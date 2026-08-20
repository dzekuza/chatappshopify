import type { ActionFunctionArgs } from "react-router";
import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import {
  FACTUAL_ACCURACY_GUARDRAILS,
  merchantPersonaPrompt,
} from "../chat-guardrails.server";
import prisma from "../db.server";

const MAX_MESSAGES = 20;

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  lt: "Lithuanian",
  lv: "Latvian",
  et: "Estonian",
  pl: "Polish",
  de: "German",
  ru: "Russian",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
};

function languageInstruction(language: string) {
  if (!language || language === "auto") {
    return "Detect the language the shopper is writing in and always respond in that same language.";
  }
  const name = LANGUAGE_NAMES[language] ?? language;
  return `Always respond in ${name}, regardless of the language the shopper writes in.`;
}

const ORDER_TOOL_INSTRUCTION =
  "Use the lookupOrder tool to answer questions about an order's status, " +
  "fulfillment, or tracking. Only ever share the details it returns — if it " +
  "reports the order could not be found, say so rather than guessing.";

const HANDOFF_TOOL_INSTRUCTION =
  "If the shopper asks to speak with a human, a real person, or store staff " +
  "— or seems frustrated and asks for escalation — call the " +
  "requestHumanHandoff tool once, then let them know a team member has been " +
  "notified and will follow up, while still offering to keep helping in the " +
  "meantime.";

function normalizeOrderNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? `#${digits}` : "";
}

type KnowledgeCollection = { id: string; title?: string; handle?: string };

function collectionIdFilter(knowledgeCollections: unknown) {
  const collections = Array.isArray(knowledgeCollections)
    ? (knowledgeCollections as KnowledgeCollection[])
    : [];
  const ids = collections
    .map((c) => String(c?.id ?? "").replace(/^gid:\/\/shopify\/Collection\//, ""))
    .filter(Boolean);
  if (ids.length === 0) return "";
  return `(${ids.map((id) => `collection_id:${id}`).join(" OR ")})`;
}

// See apps.chat-widget.chat.tsx for why this can't just be string
// concatenation — an empty keyword with a leading " AND " is an invalid
// Shopify search query that silently returns zero products.
function buildProductQuery(keywords: string | undefined, collectionFilter: string) {
  return [keywords?.trim(), collectionFilter].filter(Boolean).join(" AND ");
}

type KnowledgeEntryRow = {
  type: string;
  question: string | null;
  answer: string;
  productTitle: string | null;
  productHandle: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
};

function mediaLine(entry: KnowledgeEntryRow) {
  if (!entry.mediaUrl) return "";
  const label = entry.mediaType === "image" ? "Image" : "Video";
  return `\n${label}: ${entry.mediaUrl}`;
}

function knowledgeBasePrompt(entries: KnowledgeEntryRow[]) {
  const freeform = entries.filter((e) => e.type !== "product");
  const productNotes = entries.filter((e) => e.type === "product");
  const sections: string[] = [];

  if (freeform.length > 0) {
    const items = freeform
      .map((e, i) => `${i + 1}. Q: ${e.question}\nA: ${e.answer}${mediaLine(e)}`)
      .join("\n\n");
    sections.push(
      "You have the following store-specific FAQ entries. If the shopper's " +
        "question matches one of these — even if worded differently — reply " +
        "using that answer (light rewording for tone is fine, but keep the " +
        "facts exactly as given). If an entry has an Image or Video line, " +
        "include just the bare URL on its own line at the end of your reply " +
        "— no 'Image:'/'Video:' label, just the URL by itself — so it can " +
        "be shown to the shopper. Don't use these answers for unrelated " +
        "questions.\n\n" +
        items,
    );
  }

  if (productNotes.length > 0) {
    const items = productNotes
      .map(
        (e, i) =>
          `${i + 1}. Product: ${e.productTitle}\nNote: ${e.answer}${mediaLine(e)}`,
      )
      .join("\n\n");
    sections.push(
      "You have the following merchant-added notes tied to specific " +
        "products. Whenever you recommend or discuss one of these products " +
        "by name, weave its note in naturally alongside the live product " +
        "data from searchProducts — don't just recite it verbatim. If a " +
        "note has an Image or Video line, include just the bare URL on its " +
        "own line — no 'Image:'/'Video:' label, just the URL by itself. " +
        "Don't mention a note for a product the shopper isn't asking " +
        "about.\n\n" +
        items,
    );
  }

  return sections.join("\n\n");
}

// Lets a merchant try out the assistant from inside the admin, using
// whatever's currently in the settings form (saved or not) — no
// conversation is persisted and no storefront contact gate applies.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  const shopSettings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
    select: { geminiApiKey: true },
  });
  const apiKey = shopSettings?.geminiApiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return new Response("AI is not configured for this store", {
      status: 503,
    });
  }

  const body = await request.json();
  const incoming: unknown[] = Array.isArray(body?.messages)
    ? body.messages
    : [];

  const messages: ModelMessage[] = incoming
    .filter(
      (m: unknown): m is { role: string; content: string } =>
        typeof m === "object" &&
        m !== null &&
        "role" in m &&
        "content" in m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content }) as ModelMessage);

  if (messages.length === 0) {
    return new Response("No message provided", { status: 400 });
  }

  const systemPrompt = String(body?.systemPrompt ?? "").trim();
  const geminiModel = String(body?.geminiModel ?? "gemini-2.5-flash").trim();
  const language = String(body?.language ?? "auto").trim();
  const collectionFilter = collectionIdFilter(body?.knowledgeCollections);
  const knowledgeEntries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
  });

  const google = createGoogleGenerativeAI({ apiKey });

  const result = streamText({
    model: google(geminiModel),
    system: [
      merchantPersonaPrompt(systemPrompt),
      languageInstruction(language),
      knowledgeBasePrompt(knowledgeEntries),
      ORDER_TOOL_INSTRUCTION,
      HANDOFF_TOOL_INSTRUCTION,
      // Last, so it overrides anything the merchant configured above.
      FACTUAL_ACCURACY_GUARDRAILS,
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages,
    stopWhen: stepCountIs(4),
    tools: {
      searchProducts: tool({
        description:
          "Search or browse this store's products. Pass specific keywords (e.g. 'blue running shoes') when the shopper names something particular. Leave the query empty when they're just browsing or ask something generic like 'what do you sell' — this returns a sample of available products instead of an empty result. Never invent products that don't come from this tool.",
        inputSchema: z.object({
          query: z
            .string()
            .optional()
            .describe(
              "Specific keywords to search for, e.g. 'blue running shoes'. Omit this entirely for generic browsing questions.",
            ),
        }),
        execute: async ({ query }) => {
          const response = await admin.graphql(
            `#graphql
              query SearchProducts($query: String!) {
                products(first: 5, query: $query) {
                  nodes {
                    title
                    handle
                    onlineStoreUrl
                    priceRangeV2 {
                      minVariantPrice {
                        amount
                        currencyCode
                      }
                    }
                    featuredImage {
                      url
                    }
                    totalInventory
                  }
                }
              }`,
            { variables: { query: buildProductQuery(query, collectionFilter) } },
          );
          const json = await response.json();
          const products = json?.data?.products?.nodes ?? [];

          return {
            products: products.map((p: Record<string, unknown>) => ({
              title: p.title,
              handle: p.handle,
              url: p.onlineStoreUrl,
              price: (p.priceRangeV2 as any)?.minVariantPrice,
              image: (p.featuredImage as any)?.url,
              inStock: ((p.totalInventory as number) ?? 0) > 0,
            })),
          };
        },
      }),
      lookupOrder: tool({
        description:
          "Look up the status, fulfillment, and tracking info for an order in this store by order number (e.g. '1001' or '#1001'). This is the admin test preview, so it looks up any order in the store — the storefront version restricts this to the shopper's own verified order.",
        inputSchema: z.object({
          orderNumber: z
            .string()
            .describe("The order number to look up, digits only or with a leading #"),
        }),
        execute: async ({ orderNumber }) => {
          const name = normalizeOrderNumber(orderNumber);
          if (!name) {
            return { found: false, reason: "invalid_order_number" };
          }

          const response = await admin.graphql(
            `#graphql
              query LookupOrder($query: String!) {
                orders(first: 1, query: $query) {
                  nodes {
                    name
                    displayFulfillmentStatus
                    displayFinancialStatus
                    createdAt
                    totalPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                    fulfillments(first: 5) {
                      trackingInfo {
                        number
                        url
                        company
                      }
                    }
                    lineItems(first: 10) {
                      nodes {
                        title
                        quantity
                      }
                    }
                  }
                }
              }`,
            { variables: { query: `name:${name}` } },
          );
          const json = await response.json();
          const order = json?.data?.orders?.nodes?.[0];

          if (!order) {
            return { found: false, reason: "not_found" };
          }

          return {
            found: true,
            order: {
              name: order.name,
              fulfillmentStatus: order.displayFulfillmentStatus,
              financialStatus: order.displayFinancialStatus,
              placedAt: order.createdAt,
              total: order.totalPriceSet?.shopMoney,
              tracking: (order.fulfillments ?? []).flatMap(
                (f: Record<string, unknown>) => f.trackingInfo ?? [],
              ),
              items: (order.lineItems?.nodes ?? []).map(
                (li: Record<string, unknown>) => ({
                  title: li.title,
                  quantity: li.quantity,
                }),
              ),
            },
          };
        },
      }),
      // No getPurchaseHistory tool here: the preview has no verified shopper
      // identity to look up (see file header) so there's nothing to
      // personalize against.
      requestHumanHandoff: tool({
        description:
          "Simulate flagging this conversation for staff follow-up, because the shopper asked for a human. This is the admin preview, so nothing is actually persisted or notified.",
        inputSchema: z.object({
          reason: z
            .string()
            .optional()
            .describe("Short note on why they want a human, e.g. 'wants a refund'"),
        }),
        execute: async ({ reason }) => {
          return { requested: true, reason: reason ?? null, preview: true };
        },
      }),
    },
  });

  return result.toTextStreamResponse();
};
