import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import prisma from "./db.server";
import { FREE_TIER_DEFAULT_MODEL } from "./gemini-model.server";
import {
  crawlHomepageLinks,
  fetchWithTimeout,
  resolveStorefront,
  walkSitemap,
  type StorefrontPlatform,
} from "./storefront.server";

// Automatically gathers background context about a store — its policies plus
// a handful of standard pages (About/Shipping/Returns/FAQ/Contact) — so the
// chat assistant has more than just the merchant's manually-written FAQ to
// draw on. Runs once on install (see shopify.server.ts's afterAuth hook) and
// is re-runnable on demand from the Settings page.
//
// Page discovery goes through storefront.server.ts so it works on a headless
// (Hydrogen/Oxygen) storefront too, where content routes don't have to sit
// under /pages/ and there may be no sitemap at all.

const MAX_STORE_CONTEXT_CHARS = 4000;
const PAGE_FETCH_TIMEOUT_MS = 5000;
const TOTAL_CRAWL_BUDGET_MS = 30000;
const MAX_CANDIDATE_PAGES = 10;
const MAX_PAGE_TEXT_CHARS = 4000;

const PRIORITY_PATH_PATTERNS = [
  /\/pages\/about/i,
  /\/pages\/(faq|faqs)/i,
  /\/pages\/(shipping|delivery)/i,
  /\/pages\/(returns?|refunds?)/i,
  /\/pages\/contact/i,
  /\/policies\//i,
];

// A headless storefront routes its About/FAQ/Shipping pages wherever it likes
// — /about, /en-us/faq, /help/returns — so the Liquid-shaped patterns above
// would match nothing. These look for the same topics at any depth.
const HEADLESS_PATH_PATTERNS = [
  /(^|\/)about(-us)?(\/|$)/i,
  /(^|\/)(faq|faqs|help|support)(\/|$)/i,
  /(^|\/)(shipping|delivery)(\/|$)/i,
  /(^|\/)(returns?|refunds?|exchanges?)(\/|$)/i,
  /(^|\/)contact(-us)?(\/|$)/i,
  /(^|\/)(policies|terms|privacy)(\/|$)/i,
];

type SourceUrl = { url: string; type: "sitemap" | "policy" | "page"; title?: string };

type Policies = {
  shippingPolicy?: string | null;
  refundPolicy?: string | null;
  privacyPolicy?: string | null;
  termsOfService?: string | null;
};

type AdminGraphqlClient = {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchStorePolicies(admin: AdminGraphqlClient): Promise<Policies> {
  try {
    const response = await admin.graphql(
      `#graphql
        query StorePolicies {
          shop {
            shippingPolicy { body }
            refundPolicy { body }
            privacyPolicy { body }
            termsOfService { body }
          }
        }`,
    );
    const json = await response.json();
    const shop = json?.data?.shop ?? {};
    return {
      shippingPolicy: shop.shippingPolicy?.body ?? null,
      refundPolicy: shop.refundPolicy?.body ?? null,
      privacyPolicy: shop.privacyPolicy?.body ?? null,
      termsOfService: shop.termsOfService?.body ?? null,
    };
  } catch {
    return {};
  }
}

function matchesPriority(url: string, platform: StorefrontPlatform) {
  if (PRIORITY_PATH_PATTERNS.some((pattern) => pattern.test(url))) return true;
  if (platform === "online-store") return false;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  return HEADLESS_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

async function discoverCandidateUrls(
  storeUrl: string,
  platform: StorefrontPlatform,
  deadline: number,
): Promise<SourceUrl[]> {
  const seen = new Set<string>();
  const candidates: SourceUrl[] = [];

  const collect = (urls: string[]) => {
    for (const url of urls) {
      if (candidates.length >= MAX_CANDIDATE_PAGES) return;
      if (seen.has(url) || !matchesPriority(url, platform)) continue;
      seen.add(url);
      candidates.push({ url, type: "sitemap" });
    }
  };

  collect(
    await walkSitemap(storeUrl, {
      deadline,
      maxUrls: 400,
      fetchTimeoutMs: PAGE_FETCH_TIMEOUT_MS,
      maxNestedSitemaps: 5,
    }),
  );

  // No sitemap, or one that indexes only products: fall back to the
  // storefront's own navigation, which is all a hand-rolled headless build
  // may expose.
  if (candidates.length === 0) {
    collect(
      await crawlHomepageLinks(storeUrl, {
        deadline,
        maxUrls: 200,
        fetchTimeoutMs: PAGE_FETCH_TIMEOUT_MS,
      }),
    );
  }

  return candidates.slice(0, MAX_CANDIDATE_PAGES);
}

async function crawlPages(candidates: SourceUrl[], deadline: number) {
  const pages: { url: string; text: string }[] = [];
  for (const candidate of candidates) {
    if (Date.now() > deadline) break;
    try {
      const response = await fetchWithTimeout(candidate.url, PAGE_FETCH_TIMEOUT_MS);
      if (!response.ok) continue;
      const html = await response.text();
      const text = stripHtml(html).slice(0, MAX_PAGE_TEXT_CHARS);
      if (text) pages.push({ url: candidate.url, text });
    } catch {
      // Skip unreachable page — never let one bad page fail the whole audit.
    }
  }
  return pages;
}

async function summarizeStoreContext(
  shop: string,
  policies: Policies,
  pages: { url: string; text: string }[],
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const policyText = Object.entries(policies)
    .filter(([, body]) => body)
    .map(([key, body]) => `${key}:\n${stripHtml(String(body)).slice(0, 2000)}`)
    .join("\n\n");
  const pageText = pages.map((p) => `Page (${p.url}):\n${p.text}`).join("\n\n");

  const source = [policyText, pageText].filter(Boolean).join("\n\n");
  if (!source.trim()) return null;

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const { text } = await generateText({
      model: google(FREE_TIER_DEFAULT_MODEL),
      prompt:
        `Given the following crawled content and policies from the Shopify store "${shop}", ` +
        "produce a concise store-context brief for a shopping-assistant AI. Cover: what kind " +
        "of business this is, brand voice/tone cues if evident, a short summary of the shipping " +
        "policy, a short summary of the return/refund policy, and any other useful facts (contact " +
        "info, FAQ-like content). Keep it under 1000 words, plain prose, no markdown headers.\n\n" +
        source,
    });
    return text.slice(0, MAX_STORE_CONTEXT_CHARS);
  } catch {
    return null;
  }
}

export async function runStoreAudit(shop: string, admin: AdminGraphqlClient) {
  await prisma.storeAudit.upsert({
    where: { shop },
    update: { status: "running", lastError: null },
    create: { shop, status: "running" },
  });

  const deadline = Date.now() + TOTAL_CRAWL_BUDGET_MS;

  try {
    const [policies, storefront] = await Promise.all([
      fetchStorePolicies(admin),
      resolveStorefront(shop, admin),
    ]);

    const candidates = await discoverCandidateUrls(
      storefront.url,
      storefront.platform,
      deadline,
    );
    const pages = await crawlPages(candidates, deadline);
    const storeContext = await summarizeStoreContext(shop, policies, pages);

    const sourceUrls: SourceUrl[] = [
      ...candidates,
      ...(policies.shippingPolicy ? [{ url: "policy:shipping", type: "policy" as const }] : []),
      ...(policies.refundPolicy ? [{ url: "policy:refund", type: "policy" as const }] : []),
    ];

    await prisma.storeAudit.update({
      where: { shop },
      data: {
        status: "complete",
        storeContext,
        sourceUrls: sourceUrls as unknown as object,
        policies: policies as unknown as object,
        lastRunAt: new Date(),
        lastError: null,
      },
    });
  } catch (err) {
    await prisma.storeAudit.update({
      where: { shop },
      data: {
        status: "failed",
        lastRunAt: new Date(),
        lastError: err instanceof Error ? err.message : "Unknown error",
      },
    });
  }
}
