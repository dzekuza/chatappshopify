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
  "reports the order could not be verified, tell the shopper you can't pull " +
  "up that order with the contact details on file and offer to connect them " +
  "with a human, rather than guessing or asking them to repeat sensitive info.";

function normalizePhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(-9);
}

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

// Combines a shopper's free-text keywords (optional — omitted when they're
// just browsing, e.g. "what do you sell") with the merchant's collection
// scope into a single Shopify search query. Joining with a leading " AND "
// when there's no keyword term produces an invalid query that silently
// matches nothing, which is what caused "I couldn't find any products" for
// generic browsing questions.
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

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { session, admin } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings || !settings.enabled) {
    return new Response("Chat widget is disabled", { status: 403 });
  }

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

  const conversationId =
    typeof body?.conversationId === "string" && body.conversationId.trim()
      ? body.conversationId.trim()
      : crypto.randomUUID();

  const existingConversation = await prisma.conversation.findUnique({
    where: { shop_conversationId: { shop: session.shop, conversationId } },
  });

  if (!existingConversation) {
    const contact = (body?.contact ?? {}) as Record<string, unknown>;
    const customerName =
      typeof contact.name === "string" ? contact.name.trim() : "";
    const customerEmail =
      typeof contact.email === "string" ? contact.email.trim() : "";
    const customerPhone =
      typeof contact.phone === "string" ? contact.phone.trim() : "";

    if (!customerName || (!customerEmail && !customerPhone)) {
      return new Response(
        "Name and either an email or phone number are required to start a conversation",
        { status: 400 },
      );
    }

    await prisma.conversation.create({
      data: {
        shop: session.shop,
        conversationId,
        customerName,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
      },
    });
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "user") {
    await prisma.chatMessage.create({
      data: {
        shop: session.shop,
        conversationId,
        role: "user",
        content: String(lastMessage.content),
      },
    });
  }

  // Contact on file for this conversation — used to verify order-lookup
  // requests so the AI can never be tricked into reading a stranger's order
  // just because it knows an order number.
  const conversationContact =
    existingConversation ??
    (await prisma.conversation.findUnique({
      where: { shop_conversationId: { shop: session.shop, conversationId } },
    }));

  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  const collectionFilter = collectionIdFilter(settings.knowledgeCollections);
  const knowledgeEntries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
  });

  const result = streamText({
    model: google(settings.geminiModel),
    system: [
      settings.systemPrompt,
      languageInstruction(settings.language),
      knowledgeBasePrompt(knowledgeEntries),
      ORDER_TOOL_INSTRUCTION,
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages,
    stopWhen: stepCountIs(4),
    onFinish: async ({ text }) => {
      if (text) {
        await prisma.chatMessage.create({
          data: {
            shop: session.shop,
            conversationId,
            role: "assistant",
            content: text,
          },
        });
      }
    },
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
          "Look up the status, fulfillment, and tracking info for one of this shopper's own orders by order number (e.g. '1001' or '#1001'). Only returns a result if the order's contact details match this conversation's contact on file — never claims to find an order otherwise.",
        inputSchema: z.object({
          orderNumber: z
            .string()
            .describe("The order number the shopper gave you, digits only or with a leading #"),
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
                    customer {
                      email
                      phone
                    }
                    shippingAddress {
                      phone
                    }
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

          const conversationEmail = conversationContact?.customerEmail?.toLowerCase() ?? "";
          const conversationPhone = normalizePhone(conversationContact?.customerPhone);

          const orderEmail = String(order.customer?.email ?? "").toLowerCase();
          const orderPhone = normalizePhone(
            order.customer?.phone ?? order.shippingAddress?.phone,
          );

          const emailMatches = conversationEmail && orderEmail && conversationEmail === orderEmail;
          const phoneMatches = conversationPhone && orderPhone && conversationPhone === orderPhone;

          if (!emailMatches && !phoneMatches) {
            return { found: false, reason: "verification_failed" };
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

  return result.toTextStreamResponse({
    headers: { "X-Conversation-Id": conversationId },
  });
};
