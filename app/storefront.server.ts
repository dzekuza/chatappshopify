// Works out *where* a shop's storefront actually lives and *how* it is built,
// then discovers its linkable URLs.
//
// The knowledge pipeline (catalog-sync.server.ts, store-audit.server.ts) used
// to assume a Liquid Online Store: primary domain serves `/sitemap.xml`, that
// sitemap nests as `sitemap_pages_1.xml`, and every content URL sits under
// `/pages/`, `/collections/`, `/blogs/` or `/policies/`. None of that holds
// for a headless storefront (Hydrogen on Oxygen, or any custom framework):
//
//   - `Product.onlineStoreUrl` is null, because products aren't published to
//     the Online Store channel at all.
//   - Hydrogen's own sitemap index nests as `/sitemap/pages/1.xml` — a path,
//     not an underscore-separated filename.
//   - Routes are the developer's to choose. `/about` and `/faq` are as likely
//     as `/pages/about`, and a localised store prefixes everything (`/en-us/…`).
//   - A hand-rolled storefront may serve no sitemap whatsoever.
//
// So detection is empirical rather than declarative: the Admin API exposes no
// "this shop is headless" flag, and asking for one would mean a new scope.
// We fetch the storefront root once and read what it tells us.

const ROOT_PROBE_TIMEOUT_MS = 6000;

export type StorefrontPlatform = "online-store" | "headless" | "unknown";

export type Storefront = {
  /** Base URL with no trailing slash, e.g. "https://shop.example.com". */
  url: string;
  platform: StorefrontPlatform;
};

type AdminGraphqlClient = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function extractSitemapUrls(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
  return matches.map((m) => m.replace(/<\/?loc>/gi, "").trim()).filter(Boolean);
}

async function fetchPrimaryDomain(
  admin: AdminGraphqlClient,
): Promise<string | null> {
  try {
    const response = await admin.graphql(
      `#graphql
        query ShopUrl { shop { primaryDomain { url } } }`,
    );
    const json = await response.json();
    return json?.data?.shop?.primaryDomain?.url ?? null;
  } catch {
    return null;
  }
}

// Liquid themes always emit a `Shopify.theme` / `Shopify.shop` bootstrap
// object; Hydrogen ships an Oxygen `powered-by` header and a Remix hydration
// payload. Either signal alone is enough — a merchant running a custom
// headless storefront off Oxygen still lands on "headless" via the markup,
// and one running Hydrogen behind a proxy that strips headers does too.
function classifyMarkup(headers: Headers, html: string): StorefrontPlatform {
  const poweredBy = (headers.get("powered-by") ?? "").toLowerCase();
  if (poweredBy.includes("hydrogen") || poweredBy.includes("oxygen")) {
    return "headless";
  }
  for (const key of headers.keys()) {
    if (key.toLowerCase().startsWith("oxygen-")) return "headless";
  }

  const head = html.slice(0, 200_000);
  if (/Shopify\.theme\s*=|Shopify\.shop\s*=|window\.ShopifyAnalytics/.test(head)) {
    return "online-store";
  }
  if (/__remixContext|__reactRouterContext|\/_root\.data|hydrogen/i.test(head)) {
    return "headless";
  }
  return "unknown";
}

/**
 * Resolves the shop's public storefront URL and detects whether it is the
 * Liquid Online Store or a headless (Hydrogen/Oxygen) build.
 *
 * The primary domain is the right base either way: when a merchant points a
 * domain at a Hydrogen storefront in the admin, that domain *is* the shop's
 * primary domain — the difference is only what answers on it.
 */
export async function resolveStorefront(
  shop: string,
  admin: AdminGraphqlClient,
): Promise<Storefront> {
  const primaryDomain = await fetchPrimaryDomain(admin);
  const url = (primaryDomain ?? `https://${shop}`).replace(/\/$/, "");

  try {
    const response = await fetchWithTimeout(url, ROOT_PROBE_TIMEOUT_MS);
    if (!response.ok) return { url, platform: "unknown" };
    return { url, platform: classifyMarkup(response.headers, await response.text()) };
  } catch {
    // An unreachable storefront isn't fatal — the sitemap walk below may still
    // work, and every caller treats "unknown" as "use the permissive rules".
    return { url, platform: "unknown" };
  }
}

// Matches both sitemap naming schemes: the Online Store's
// `sitemap_products_1.xml` and Hydrogen's `/sitemap/products/1.xml`.
function isNestedSitemap(url: string) {
  return /sitemap[^/]*\.xml$/i.test(url) || /\/sitemap\/[^/]+\/\d+\.xml$/i.test(url);
}

function isProductSitemap(url: string) {
  return /sitemap[_/]products/i.test(url);
}

export type SitemapWalkOptions = {
  deadline: number;
  maxUrls: number;
  fetchTimeoutMs: number;
  /** Product URLs are covered by CatalogProduct, so their sitemaps are skipped. */
  skipProductSitemaps?: boolean;
  maxNestedSitemaps?: number;
};

/**
 * Walks `/sitemap.xml` and the sitemaps it indexes, returning every content
 * URL found. Purely mechanical — classification is the caller's job, because
 * the catalogue index and the store audit want different subsets.
 */
export async function walkSitemap(
  storeUrl: string,
  options: SitemapWalkOptions,
): Promise<string[]> {
  const {
    deadline,
    maxUrls,
    fetchTimeoutMs,
    skipProductSitemaps = true,
    maxNestedSitemaps = 10,
  } = options;
  const found = new Set<string>();

  try {
    const response = await fetchWithTimeout(
      `${storeUrl}/sitemap.xml`,
      fetchTimeoutMs,
    );
    if (!response.ok) return [];
    const topLevel = extractSitemapUrls(await response.text());

    for (const url of topLevel) {
      if (found.size >= maxUrls) break;
      if (!isNestedSitemap(url)) found.add(url);
    }

    const nested = topLevel
      .filter(isNestedSitemap)
      .filter((url) => !(skipProductSitemaps && isProductSitemap(url)))
      .slice(0, maxNestedSitemaps);

    for (const sitemapUrl of nested) {
      if (Date.now() > deadline || found.size >= maxUrls) break;
      try {
        const nestedResponse = await fetchWithTimeout(sitemapUrl, fetchTimeoutMs);
        if (!nestedResponse.ok) continue;
        for (const url of extractSitemapUrls(await nestedResponse.text())) {
          if (found.size >= maxUrls) break;
          found.add(url);
        }
      } catch {
        // Skip an unreachable nested sitemap — a partial index still helps.
      }
    }
  } catch {
    return [];
  }

  return [...found];
}

const NON_PAGE_EXTENSION = /\.(xml|json|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|pdf|txt|zip|mp4|webm)$/i;

/**
 * Last-resort discovery for storefronts with no usable sitemap: pull the
 * same-origin links out of the homepage's navigation. A hand-built headless
 * storefront often has no sitemap at all, and without this its content pages
 * would be invisible to the assistant.
 */
export async function crawlHomepageLinks(
  storeUrl: string,
  options: { deadline: number; maxUrls: number; fetchTimeoutMs: number },
): Promise<string[]> {
  const { deadline, maxUrls, fetchTimeoutMs } = options;
  if (Date.now() > deadline) return [];

  let html: string;
  try {
    const response = await fetchWithTimeout(storeUrl, fetchTimeoutMs);
    if (!response.ok) return [];
    html = await response.text();
  } catch {
    return [];
  }

  const origin = new URL(storeUrl).origin;
  const found = new Set<string>();

  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    if (found.size >= maxUrls) break;
    let resolved: URL;
    try {
      resolved = new URL(match[1], `${storeUrl}/`);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    if (resolved.pathname === "/" || NON_PAGE_EXTENSION.test(resolved.pathname)) {
      continue;
    }
    resolved.hash = "";
    resolved.search = "";
    found.add(resolved.toString().replace(/\/$/, ""));
  }

  return [...found];
}
