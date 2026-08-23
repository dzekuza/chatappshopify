import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import prisma from "./db.server";

// Automatically gathers background context about a store — its policies plus
// a handful of standard pages (About/Shipping/Returns/FAQ/Contact) — so the
// chat assistant has more than just the merchant's manually-written FAQ to
// draw on. Runs once on install (see shopify.server.ts's afterAuth hook) and
// is re-runnable on demand from the Settings page.

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

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

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

async function fetchPrimaryDomain(admin: AdminGraphqlClient): Promise<string | null> {
  try {
    const response = await admin.graphql(
      `#graphql
        query ShopUrl {
          shop {
            primaryDomain { url }
          }
        }`,
    );
    const json = await response.json();
    return json?.data?.shop?.primaryDomain?.url ?? null;
  } catch {
    return null;
  }
}

function extractSitemapUrls(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
  return matches.map((m) => m.replace(/<\/?loc>/gi, "").trim()).filter(Boolean);
}

async function discoverCandidateUrls(storeUrl: string, deadline: number): Promise<SourceUrl[]> {
  const candidates: SourceUrl[] = [];
  try {
    if (Date.now() > deadline) return candidates;
    const response = await fetchWithTimeout(`${storeUrl}/sitemap.xml`, PAGE_FETCH_TIMEOUT_MS);
    if (!response.ok) return candidates;
    const xml = await response.text();
    const topLevelUrls = extractSitemapUrls(xml);

    // Nested sitemaps (sitemap_pages_1.xml etc.) vs. direct page entries.
    const nestedSitemaps = topLevelUrls.filter((u) => /sitemap.*\.xml$/i.test(u));
    const directUrls = topLevelUrls.filter((u) => !/sitemap.*\.xml$/i.test(u));

    for (const u of directUrls) {
      if (PRIORITY_PATH_PATTERNS.some((p) => p.test(u))) {
        candidates.push({ url: u, type: "sitemap" });
      }
    }

    for (const nested of nestedSitemaps.slice(0, 5)) {
      if (Date.now() > deadline || candidates.length >= MAX_CANDIDATE_PAGES) break;
      try {
        const nestedResponse = await fetchWithTimeout(nested, PAGE_FETCH_TIMEOUT_MS);
        if (!nestedResponse.ok) continue;
        const nestedXml = await nestedResponse.text();
        for (const u of extractSitemapUrls(nestedXml)) {
          if (PRIORITY_PATH_PATTERNS.some((p) => p.test(u))) {
            candidates.push({ url: u, type: "sitemap" });
          }
        }
      } catch {
        // Skip unreachable nested sitemap.
      }
    }
  } catch {
    // Sitemap unreachable — return whatever we have (likely nothing); the
    // audit still proceeds with policies alone.
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
      model: google("gemini-2.5-flash"),
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
    const [policies, primaryDomain] = await Promise.all([
      fetchStorePolicies(admin),
      fetchPrimaryDomain(admin),
    ]);

    const storeUrl = primaryDomain
      ? primaryDomain.replace(/\/$/, "")
      : `https://${shop}`;

    const candidates = await discoverCandidateUrls(storeUrl, deadline);
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
