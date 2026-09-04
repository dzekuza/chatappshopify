import type { ActionFunctionArgs } from "react-router";
import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { authenticate } from "../shopify.server";
import {
  FACTUAL_ACCURACY_GUARDRAILS,
  merchantPersonaPrompt,
  storeContextPrompt,
} from "../chat-guardrails.server";
import { textStreamWithProductCards } from "../product-card-stream.server";
import {
  FREE_TIER_DEFAULT_MODEL,
  resolveGeminiModel,
} from "../gemini-model.server";
import {
  AI_UNAVAILABLE_MESSAGE,
  recordAiFailure,
  recordAiSuccess,
} from "../ai-status.server";
import {
  MAX_PRODUCT_DESCRIPTION_CHARS,
  STOCK_TOOL_INSTRUCTION,
  summarizeVariants,
} from "../product-variants.server";
import {
  catalogOverviewPrompt,
  storePagesPrompt,
  storefrontPrompt,
} from "../catalog-context.server";
import prisma from "../db.server";
import { describeRange, withMediaFragment } from "../media-timestamp";

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
// Shopify search query that silently returns zero products. Also see that
// file for a second, separate quirk: keyword + collection scope can't both
// go in the query string at once either (a bare keyword AND'd with a
// parenthesized collection_id OR-group silently returns zero results even
// when each half matches alone) — collectionGidSet + the searchProducts
// tool below handle that combination by filtering in code instead.
function buildProductQuery(keywords: string | undefined, collectionFilter: string) {
  return [keywords?.trim(), collectionFilter].filter(Boolean).join(" AND ");
}

function collectionGidSet(knowledgeCollections: unknown): Set<string> {
  const collections = Array.isArray(knowledgeCollections)
    ? (knowledgeCollections as KnowledgeCollection[])
    : [];
  return new Set(collections.map((c) => String(c?.id ?? "")).filter(Boolean));
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
  const requestedGeminiModel = String(
    body?.geminiModel ?? FREE_TIER_DEFAULT_MODEL,
  ).trim();
  const usesOwnKey = Boolean(shopSettings?.geminiApiKey);
  const geminiModel = resolveGeminiModel(
    requestedGeminiModel,
    Boolean(shopSettings?.geminiApiKey),
  );
  const language = String(body?.language ?? "auto").trim();
  const collectionFilter = collectionIdFilter(body?.knowledgeCollections);
  const allowedCollectionGids = collectionGidSet(body?.knowledgeCollections);
  const knowledgeEntries = await prisma.knowledgeEntry.findMany({
    where: { shop: session.shop },
  });
  const storeAudit = await prisma.storeAudit.findUnique({
    where: { shop: session.shop },
    select: { storeContext: true },
  });
  // The synced catalogue snapshot and page index (see catalog-sync.server.ts).
  // Both are orientation only — the snapshot deliberately holds no inventory,
  // so availability still comes from the live searchProducts call below.
  const [catalogProducts, catalogSync, storePages] = await Promise.all([
    prisma.catalogProduct.findMany({
      where: { shop: session.shop },
      select: {
        title: true,
        productType: true,
        vendor: true,
        minPrice: true,
        maxPrice: true,
        currency: true,
        collectionTitles: true,
      },
    }),
    prisma.catalogSync.findUnique({
      where: { shop: session.shop },
      select: { storeUrl: true, platform: true },
    }),
    prisma.storePage.findMany({
      where: { shop: session.shop },
      select: { url: true, title: true, type: true },
      orderBy: { type: "asc" },
    }),
  ]);

  const google = createGoogleGenerativeAI({ apiKey });

  let lastProductResults: unknown[] | null = null;

  const result = streamText({
    model: google(geminiModel),
    system: [
      merchantPersonaPrompt(systemPrompt),
      storeContextPrompt(storeAudit?.storeContext),
      languageInstruction(language),
      knowledgeBasePrompt(knowledgeEntries),
      catalogOverviewPrompt(catalogProducts),
      storePagesPrompt(storePages),
      storefrontPrompt(catalogSync?.storeUrl ?? null, catalogSync?.platform ?? null),
      STOCK_TOOL_INSTRUCTION,
      ORDER_TOOL_INSTRUCTION,
      HANDOFF_TOOL_INSTRUCTION,
      // Last, so it overrides anything the merchant configured above.
      FACTUAL_ACCURACY_GUARDRAILS,
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages,
    stopWhen: stepCountIs(4),
    // The preview is where a merchant goes to ask "why isn't my assistant
    // working?", so its result feeds the same health flag the Plans page
    // reads — a successful test here clears a stale failure.
    onError: ({ error }) => {
      recordAiFailure(session.shop, error, usesOwnKey).catch(() => {});
    },
    onFinish: () => {
      recordAiSuccess(session.shop).catch(() => {});
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
          const keyword = query?.trim();
          const usesCodeSideCollectionFilter =
            Boolean(keyword) && allowedCollectionGids.size > 0;
          // A collection_id OR-group in the query string (browsing with a
          // collection scope, no keyword) returns one row per *matching
          // collection*, not per product — see apps.chat-widget.chat.tsx for
          // the live-testing case ("only Mira" ever recommended) this fixes.
          const queryHasCollectionGroup =
            !usesCodeSideCollectionFilter && Boolean(collectionFilter);

          const response = await admin.graphql(
            `#graphql
              query SearchProducts($query: String!, $first: Int!) {
                products(first: $first, query: $query) {
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
                    productType
                    description
                    variants(first: 25) {
                      nodes {
                        title
                        availableForSale
                        selectedOptions {
                          name
                          value
                        }
                      }
                    }
                    collections(first: 20) {
                      nodes {
                        id
                      }
                    }
                  }
                }
              }`,
            {
              variables: {
                query: usesCodeSideCollectionFilter
                  ? keyword!
                  : buildProductQuery(keyword, collectionFilter),
                first: usesCodeSideCollectionFilter || queryHasCollectionGroup ? 25 : 5,
              },
            },
          );
          const json = await response.json();
          let products = json?.data?.products?.nodes ?? [];

          if (usesCodeSideCollectionFilter) {
            products = products.filter((p: Record<string, unknown>) =>
              (
                (p.collections as { nodes?: { id: string }[] } | undefined)
                  ?.nodes ?? []
              ).some((c) => allowedCollectionGids.has(c.id)),
            );
          }

          const seenHandles = new Set<string>();
          products = products.filter((p: Record<string, unknown>) => {
            const handle = String(p.handle ?? "");
            if (!handle || seenHandles.has(handle)) return false;
            seenHandles.add(handle);
            return true;
          });

          // onlineStoreUrl is null whenever a product isn't published to the
          // classic "Online Store" sales channel specifically — several real
          // stores' catalogs never populate this even for products the
          // theme renders fine — so it can't be trusted alone. Unlike the
          // storefront widget (apps.chat-widget.chat.tsx), this preview
          // opens links from inside the Shopify admin iframe, so the
          // fallback needs the shop's own absolute domain, not a relative
          // path.
          const mapped = products.slice(0, 5).map((p: Record<string, unknown>) => ({
            title: p.title,
            handle: p.handle,
            url:
              p.onlineStoreUrl ||
              (p.handle ? `https://${session.shop}/products/${p.handle}` : null),
            price: (p.priceRangeV2 as { minVariantPrice?: unknown } | undefined)
              ?.minVariantPrice,
            image: (p.featuredImage as { url?: unknown } | undefined)?.url,
            inStock: ((p.totalInventory as number) ?? 0) > 0,
            productType: p.productType || null,
            description: p.description
              ? String(p.description).slice(0, MAX_PRODUCT_DESCRIPTION_CHARS)
              : null,
            // Variant-level availability, so the assistant can say "size M is
            // sold out but L and XL are in" instead of only knowing whether
            // the product as a whole has any stock at all. Omitted for
            // single-variant products, where it's just noise in the prompt.
            variants: summarizeVariants(p.variants),
          }));

          lastProductResults = mapped.length > 0 ? mapped : null;

          return { products: mapped };
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
      // No navigateToProduct tool here: this preview renders inside the
      // Shopify admin, not on a real storefront page, so there's nowhere
      // meaningful to navigate to. See apps.chat-widget.chat.tsx.
    },
  });

  return textStreamWithProductCards(
    result,
    () => lastProductResults,
    {},
    async (error) => {
      await recordAiFailure(session.shop, error, usesOwnKey).catch(() => {});
      return AI_UNAVAILABLE_MESSAGE;
    },
  );
};
