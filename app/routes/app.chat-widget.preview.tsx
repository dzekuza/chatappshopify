import type { ActionFunctionArgs } from "react-router";
import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { authenticate } from "../shopify.server";
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

type KnowledgeQA = { question: string; answer: string; videoUrl: string | null };

function knowledgeBasePrompt(entries: KnowledgeQA[]) {
  if (entries.length === 0) return "";
  const items = entries
    .map((e, i) => {
      const videoLine = e.videoUrl ? `\nVideo: ${e.videoUrl}` : "";
      return `${i + 1}. Q: ${e.question}\nA: ${e.answer}${videoLine}`;
    })
    .join("\n\n");
  return (
    "You have the following store-specific FAQ entries. If the shopper's " +
    "question matches one of these — even if worded differently — reply " +
    "using that answer (light rewording for tone is fine, but keep the " +
    "facts exactly as given). If an entry has a Video line, include that " +
    "exact URL on its own line at the end of your reply so it can be shown " +
    "to the shopper. Don't use these answers for unrelated questions.\n\n" +
    items
  );
}

// Lets a merchant try out the assistant from inside the admin, using
// whatever's currently in the settings form (saved or not) — no
// conversation is persisted and no storefront contact gate applies.
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { session, admin } = await authenticate.admin(request);

  if (!process.env.GEMINI_API_KEY) {
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

  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

  const result = streamText({
    model: google(geminiModel),
    system: [
      systemPrompt,
      languageInstruction(language),
      knowledgeBasePrompt(knowledgeEntries),
      ORDER_TOOL_INSTRUCTION,
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
    },
  });

  return result.toTextStreamResponse();
};
