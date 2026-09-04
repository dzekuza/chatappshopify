import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import prisma from "./db.server";
import { FREE_TIER_DEFAULT_MODEL } from "./gemini-model.server";

// Reads back what shoppers actually asked the assistant and proposes
// knowledge entries the merchant hasn't written yet. Deliberately not
// persisted: suggestions are cheap to regenerate and go stale the moment a
// merchant adds an entry, so the panel asks for them on demand instead of
// keeping a table of half-answered advice around.

const MAX_MESSAGES = 200;
const MAX_UNANSWERED = 60;
const MAX_EXISTING = 100;
const MAX_CATALOG = 150;
const MAX_SUGGESTIONS = 8;
const LOOKBACK_DAYS = 60;
const MAX_QUESTION_CHARS = 300;

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z
          .enum(["faq", "product"])
          .describe(
            "'product' when the question is about one specific product, 'faq' otherwise",
          ),
        question: z
          .string()
          .describe("The question phrased the way a shopper would ask it"),
        productTitle: z
          .string()
          .nullable()
          .describe(
            "For kind='product', the exact catalog title it refers to; otherwise null",
          ),
        answer: z
          .string()
          .describe(
            "A draft answer the merchant can edit. Empty string if there is no factual basis for one.",
          ),
        reason: z
          .string()
          .describe("One short sentence on why this is worth adding"),
        askedCount: z
          .number()
          .int()
          .describe("How many separate shoppers asked something like this"),
      }),
    )
    .max(MAX_SUGGESTIONS),
});

export type KnowledgeSuggestion =
  z.infer<typeof suggestionSchema>["suggestions"][number];

export type SuggestionsResult =
  | { suggestions: KnowledgeSuggestion[]; error?: undefined }
  | { suggestions: []; error: string };

function truncate(value: string, max = MAX_QUESTION_CHARS) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export async function generateKnowledgeSuggestions(
  shop: string,
): Promise<SuggestionsResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { suggestions: [], error: "AI is not configured for this app." };
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [messages, unanswered, existing, catalog, audit] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { shop, role: "user", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_MESSAGES,
      select: { content: true },
    }),
    prisma.knowledgeQuery.findMany({
      where: { shop, matched: false, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_UNANSWERED,
      select: { question: true },
    }),
    prisma.knowledgeEntry.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: MAX_EXISTING,
      select: { question: true, productTitle: true },
    }),
    prisma.catalogProduct.findMany({
      where: { shop },
      orderBy: { title: "asc" },
      take: MAX_CATALOG,
      select: { title: true },
    }),
    prisma.storeAudit.findUnique({
      where: { shop },
      select: { storeContext: true },
    }),
  ]);

  const shopperQuestions = [
    ...messages.map((m) => m.content),
    ...unanswered.map((q) => q.question),
  ]
    .map((text) => truncate(text.trim()))
    .filter(Boolean);

  if (shopperQuestions.length === 0) {
    return { suggestions: [] };
  }

  const covered = existing
    .map((entry) =>
      entry.productTitle ? `Product: ${entry.productTitle}` : entry.question,
    )
    .filter(Boolean)
    .join("\n");

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { object } = await generateObject({
      model: google(FREE_TIER_DEFAULT_MODEL),
      schema: suggestionSchema,
      prompt: [
        `You are helping the merchant of the Shopify store "${shop}" grow the ` +
          "knowledge base their AI shopping assistant answers from.",
        "",
        "Below are real questions shoppers sent the assistant, the knowledge " +
          "entries the merchant has already written, and the product catalog.",
        "",
        `Propose at most ${MAX_SUGGESTIONS} new knowledge entries worth adding. Rules:`,
        "- Group near-duplicate shopper questions into one suggestion and set askedCount accordingly.",
        "- Prefer questions asked more than once, or ones the assistant clearly could not answer.",
        "- Never suggest something already covered by an existing entry.",
        "- Use kind='product' only when the question is about one specific product, and then set productTitle to the exact catalog title.",
        "- Draft an answer only from facts present in the store context or the shopper conversations. If you have no basis, leave answer as an empty string rather than inventing prices, policies, or availability.",
        "- If nothing is worth adding, return an empty list.",
        "",
        "Shopper questions:",
        shopperQuestions.join("\n"),
        "",
        "Existing knowledge entries:",
        covered || "(none)",
        "",
        "Catalog product titles:",
        catalog.map((p) => p.title).join("\n") || "(none)",
        "",
        "Store context:",
        audit?.storeContext ?? "(none)",
      ].join("\n"),
    });

    return { suggestions: object.suggestions.slice(0, MAX_SUGGESTIONS) };
  } catch {
    return {
      suggestions: [],
      error: "Could not analyze conversations right now. Try again.",
    };
  }
}
