import type { ActionFunctionArgs } from "react-router";
import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { describeRange, withMediaFragment } from "../media-timestamp";
import {
  countConversationsThisMonth,
  FREE_PLAN_MONTHLY_CONVERSATIONS,
  hasActiveSubscription,
} from "../billing.server";
import {
  FACTUAL_ACCURACY_GUARDRAILS,
  merchantPersonaPrompt,
  storeContextPrompt,
} from "../chat-guardrails.server";
import { matchKnowledgeEntry } from "../knowledge-query-matcher.server";
import { textStreamWithProductCards } from "../product-card-stream.server";
import { resolveGeminiModel } from "../gemini-model.server";

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

const PERSONALIZATION_TOOL_INSTRUCTION =
  "Use the getPurchaseHistory tool when it would help tailor a recommendation " +
  "— e.g. the shopper asks what to get, mentions liking something they " +
  "already own, or asks for something similar to a past order. Weave past " +
  "purchases into the recommendation naturally (e.g. 'since you bought X, " +
  "you might like Y') instead of just listing their order history back to " +
  "them. If it returns no history, just recommend normally without " +
  "mentioning the lookup.";

const HANDOFF_TOOL_INSTRUCTION =
  "If the shopper asks to speak with a human, a real person, or store staff " +
  "— or seems frustrated and asks for escalation — call the " +
  "requestHumanHandoff tool once, then let them know a team member has been " +
  "notified and will follow up, while still offering to keep helping in the " +
  "meantime.";

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

type KnowledgeEntryRow = {
  type: string;
  question: string | null;
  answer: string;
  productTitle: string | null;
  productHandle: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaStartSeconds: number | null;
  mediaEndSeconds: number | null;
};

// A video's merchant-marked slice rides along as a `#t=start,end` media
// fragment on the URL — the model only ever echoes the URL, so that's the
// only channel the range can travel through. The separate "Video timestamp"
// line is there so the assistant can also say it out loud.
function mediaLine(entry: KnowledgeEntryRow) {
  if (!entry.mediaUrl) return "";
  if (entry.mediaType === "image") return `\nImage: ${entry.mediaUrl}`;
  const url = withMediaFragment(
    entry.mediaUrl,
    entry.mediaStartSeconds,
    entry.mediaEndSeconds,
  );
  const range = describeRange(entry.mediaStartSeconds, entry.mediaEndSeconds);
  return range
    ? `\nVideo: ${url}\nVideo timestamp: the relevant part is ${range}`
    : `\nVideo: ${url}`;
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
        "be shown to the shopper. Copy that URL character for character, " +
        "including any '#t=...' part at the end — that's what makes the " +
        "video start at the right moment. If the entry also has a 'Video " +
        "timestamp' line, say that time range in your own words just " +
        "before the URL (e.g. \"it's shown from 0:10 to 0:15\"), and never " +
        "put the timestamp line itself in your reply. Don't use these " +
        "answers for unrelated questions.\n\n" +
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
        "own line — no 'Image:'/'Video:' label, just the URL by itself, " +
        "copied character for character including any '#t=...' part. If " +
        "the note also has a 'Video timestamp' line, say that time range " +
        "in your own words just before the URL, and never put the " +
        "timestamp line itself in your reply. " +
        "Don't mention a note for a product the shopper isn't asking " +
        "about.\n\n" +
        items,
    );
  }

  return sections.join("\n\n");
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
    // Free-plan cap. Counting first keeps this free of an Admin API call for
    // every chat — the subscription is only looked up once a shop is actually
    // at the cap. Conversations already under way are unaffected, since this
    // branch only runs when a new one is being created.
    const conversationsThisMonth = await countConversationsThisMonth(
      session.shop,
    );
    if (conversationsThisMonth >= FREE_PLAN_MONTHLY_CONVERSATIONS) {
      const isPaid = await hasActiveSubscription(admin);
      if (!isPaid) {
        return new Response(
          "This store has reached its monthly chat limit. Please contact the store directly.",
          { status: 402 },
        );
      }
    }

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

  const google = createGoogleGenerativeAI({
    apiKey: settings.geminiApiKey || process.env.GEMINI_API_KEY,
  });
  const geminiModel = resolveGeminiModel(
    settings.geminiModel,
    Boolean(settings.geminiApiKey),
  );
  const collectionFilter = collectionIdFilter(settings.knowledgeCollections);
  const knowledgeEntries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
  });
  const storeAudit = await prisma.storeAudit.findUnique({
    where: { shop: session.shop },
    select: { storeContext: true },
  });

  // Log the shopper's question for the "top unanswered questions" panel —
  // only real storefront traffic, never the admin preview (see
  // app.chat-widget.preview.tsx). Fire-and-forget: a logging failure should
  // never block the chat response.
  if (lastMessage.role === "user") {
    const { matched, matchedEntryId } = matchKnowledgeEntry(
      String(lastMessage.content),
      knowledgeEntries,
    );
    prisma.knowledgeQuery
      .create({
        data: {
          shop: session.shop,
          conversationId,
          question: String(lastMessage.content),
          matched,
          matchedEntryId,
        },
      })
      .catch(() => {});
  }

  // Captures the most recent searchProducts results so they can be rendered
  // as product cards on the client — see the sentinel appended to the
  // response stream below.
  let lastProductResults: unknown[] | null = null;

  const result = streamText({
    model: google(geminiModel),
    system: [
      merchantPersonaPrompt(settings.systemPrompt),
      storeContextPrompt(storeAudit?.storeContext),
      languageInstruction(settings.language),
      knowledgeBasePrompt(knowledgeEntries),
      ORDER_TOOL_INSTRUCTION,
      PERSONALIZATION_TOOL_INSTRUCTION,
      HANDOFF_TOOL_INSTRUCTION,
      // Last, so it overrides anything the merchant configured above.
      FACTUAL_ACCURACY_GUARDRAILS,
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

          const mapped = products.map((p: Record<string, unknown>) => ({
            title: p.title,
            handle: p.handle,
            url: p.onlineStoreUrl,
            price: (p.priceRangeV2 as { minVariantPrice?: unknown } | undefined)
              ?.minVariantPrice,
            image: (p.featuredImage as { url?: unknown } | undefined)?.url,
            inStock: ((p.totalInventory as number) ?? 0) > 0,
          }));

          lastProductResults = mapped.length > 0 ? mapped : null;

          return { products: mapped };
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
      getPurchaseHistory: tool({
        description:
          "Get this shopper's past orders (product titles they've bought before) to personalize a recommendation. Only works if they gave an email when starting the chat.",
        inputSchema: z.object({}),
        execute: async () => {
          const email = conversationContact?.customerEmail;
          if (!email) {
            return { available: false, reason: "no_email_on_file" };
          }

          const response = await admin.graphql(
            `#graphql
              query PastOrders($query: String!) {
                orders(first: 5, sortKey: CREATED_AT, reverse: true, query: $query) {
                  nodes {
                    createdAt
                    lineItems(first: 10) {
                      nodes {
                        title
                      }
                    }
                  }
                }
              }`,
            { variables: { query: `email:"${email.replace(/"/g, "")}"` } },
          );
          const json = await response.json();
          const orders = json?.data?.orders?.nodes ?? [];

          return {
            available: true,
            pastPurchases: orders.flatMap((o: Record<string, unknown>) =>
              (
                (o.lineItems as { nodes?: unknown[] } | undefined)?.nodes ?? []
              ).map((li) => (li as Record<string, unknown>).title),
            ),
          };
        },
      }),
      requestHumanHandoff: tool({
        description:
          "Flag this conversation so a staff member follows up, because the shopper asked for a human. Call this once when they first ask.",
        inputSchema: z.object({
          reason: z
            .string()
            .optional()
            .describe("Short note on why they want a human, e.g. 'wants a refund'"),
        }),
        execute: async ({ reason }) => {
          await prisma.conversation.update({
            where: { shop_conversationId: { shop: session.shop, conversationId } },
            data: { needsHuman: true, needsHumanRequestedAt: new Date() },
          });
          return { requested: true, reason: reason ?? null };
        },
      }),
    },
  });

  return textStreamWithProductCards(result, () => lastProductResults, {
    "X-Conversation-Id": conversationId,
  });
};
