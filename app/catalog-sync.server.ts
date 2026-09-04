import prisma from "./db.server";

// Syncs the catalog's *shape* (CatalogProduct) and the store's linkable URLs
// (StorePage) so the assistant knows what the store actually contains without
// having to guess a search keyword first.
//
// Inventory is deliberately NOT synced. Stock changes by the minute, and an
// assistant quoting a stale "in stock" is precisely what
// FACTUAL_ACCURACY_GUARDRAILS forbids — availability is always read live via
// the searchProducts tool. What lives here is the slow-moving stuff: titles,
// handles, URLs, product types, options, collection membership, price bands.
//
// Page URLs come from the public sitemap rather than the Admin pages API,
// which needs the read_content scope this app doesn't request (adding a scope
// forces every existing merchant to re-authorise).

const PRODUCT_PAGE_SIZE = 100;
const MAX_PRODUCTS = 2000;
const MAX_PAGES = 500;
const MAX_DESCRIPTION_CHARS = 500;
const FETCH_TIMEOUT_MS = 8000;
// Matches the store audit's proven crawl budget — this runs synchronously in
// a serverless function, and there's no vercel.json raising maxDuration.
const TOTAL_BUDGET_MS = 30000;

type AdminGraphqlClient = {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type ProductNode = {
  id: string;
  title: string;
  handle: string;
  onlineStoreUrl: string | null;
  productType: string | null;
  vendor: string | null;
  status: string | null;
  description: string | null;
  tags: string[] | null;
  options: { name: string; values: string[] }[] | null;
  collections: { nodes: { title: string }[] } | null;
  priceRangeV2: {
    minVariantPrice?: { amount: string; currencyCode: string };
    maxVariantPrice?: { amount: string; currencyCode: string };
  } | null;
};

const PRODUCTS_QUERY = `#graphql
  query CatalogProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        onlineStoreUrl
        productType
        vendor
        status
        description
        tags
        options { name values }
        collections(first: 10) { nodes { title } }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
      }
    }
  }`;

async function fetchAllProducts(
  admin: AdminGraphqlClient,
  deadline: number,
): Promise<{ products: ProductNode[]; complete: boolean }> {
  const products: ProductNode[] = [];
  let after: string | null = null;
  let complete = false;

  while (products.length < MAX_PRODUCTS) {
    // Running out of budget mid-catalogue is reported rather than swallowed:
    // a silently partial sync makes the assistant's catalogue overview
    // understate the range, which reads to a shopper as "we don't sell that".
    if (Date.now() >= deadline) break;

    const response: Response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: PRODUCT_PAGE_SIZE, after },
    });
    const json = await response.json();
    const connection = json?.data?.products;
    if (!connection) break;

    products.push(...(connection.nodes ?? []));
    if (!connection.pageInfo?.hasNextPage) {
      complete = true;
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return { products: products.slice(0, MAX_PRODUCTS), complete };
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

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractSitemapUrls(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
  return matches.map((m) => m.replace(/<\/?loc>/gi, "").trim()).filter(Boolean);
}

function classifyUrl(url: string): "page" | "collection" | "policy" | null {
  if (/\/policies\//i.test(url)) return "policy";
  if (/\/collections\//i.test(url)) {
    // /collections/<handle>/products/<handle> is a product URL wearing a
    // collection prefix — those are covered by CatalogProduct already.
    return /\/products\//i.test(url) ? null : "collection";
  }
  if (/\/pages\//i.test(url)) return "page";
  if (/\/blogs\//i.test(url)) return "page";
  return null;
}

function titleFromUrl(url: string): string {
  const slug = url.split("?")[0].replace(/\/$/, "").split("/").pop() ?? "";
  if (!slug) return "";
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Walks sitemap.xml plus its nested sitemaps, keeping only the content,
// collection and policy URLs a shopper could usefully be linked to.
async function discoverStoreUrls(
  storeUrl: string,
  deadline: number,
): Promise<{ url: string; title: string; type: string }[]> {
  const found = new Map<string, { url: string; title: string; type: string }>();

  const collect = (urls: string[]) => {
    for (const url of urls) {
      if (found.size >= MAX_PAGES) return;
      const type = classifyUrl(url);
      if (!type || found.has(url)) continue;
      found.set(url, { url, title: titleFromUrl(url), type });
    }
  };

  try {
    const response = await fetchWithTimeout(
      `${storeUrl}/sitemap.xml`,
      FETCH_TIMEOUT_MS,
    );
    if (!response.ok) return [];
    const topLevel = extractSitemapUrls(await response.text());

    collect(topLevel.filter((u) => !/sitemap.*\.xml$/i.test(u)));

    const nested = topLevel.filter((u) => /sitemap.*\.xml$/i.test(u));
    for (const sitemapUrl of nested) {
      if (Date.now() > deadline || found.size >= MAX_PAGES) break;
      // Product sitemaps are large and redundant with CatalogProduct.
      if (/sitemap_products/i.test(sitemapUrl)) continue;
      try {
        const nestedResponse = await fetchWithTimeout(
          sitemapUrl,
          FETCH_TIMEOUT_MS,
        );
        if (!nestedResponse.ok) continue;
        collect(extractSitemapUrls(await nestedResponse.text()));
      } catch {
        // Skip unreachable nested sitemap — a partial index still helps.
      }
    }
  } catch {
    return [];
  }

  return [...found.values()];
}

export async function syncCatalog(shop: string, admin: AdminGraphqlClient) {
  await prisma.catalogSync.upsert({
    where: { shop },
    update: { status: "running", lastError: null },
    create: { shop, status: "running" },
  });

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  try {
    const [{ products, complete }, primaryDomain] = await Promise.all([
      fetchAllProducts(admin, deadline),
      fetchPrimaryDomain(admin),
    ]);

    const storeUrl = (primaryDomain ?? `https://${shop}`).replace(/\/$/, "");
    const pages = await discoverStoreUrls(storeUrl, deadline);

    const productRows = products.map((product) => ({
      shop,
      productId: product.id,
      title: product.title ?? "",
      handle: product.handle ?? "",
      url:
        product.onlineStoreUrl ||
        (product.handle ? `${storeUrl}/products/${product.handle}` : null),
      productType: product.productType || null,
      vendor: product.vendor || null,
      status: product.status || null,
      description: (product.description ?? "").slice(0, MAX_DESCRIPTION_CHARS) || null,
      tags: (product.tags ?? []) as unknown as object,
      options: (product.options ?? []) as unknown as object,
      collectionTitles: (product.collections?.nodes ?? []).map(
        (c) => c.title,
      ) as unknown as object,
      minPrice: product.priceRangeV2?.minVariantPrice?.amount ?? null,
      maxPrice: product.priceRangeV2?.maxVariantPrice?.amount ?? null,
      currency: product.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
      syncedAt: new Date(),
    }));

    // Replace-in-one-transaction rather than upsert-then-prune: a product
    // deleted in Shopify has to disappear here too, or the assistant keeps
    // offering something the store no longer sells.
    await prisma.$transaction([
      prisma.catalogProduct.deleteMany({ where: { shop } }),
      prisma.catalogProduct.createMany({ data: productRows }),
      prisma.storePage.deleteMany({ where: { shop } }),
      prisma.storePage.createMany({
        data: pages.map((page) => ({
          shop,
          url: page.url,
          title: page.title || null,
          type: page.type,
          syncedAt: new Date(),
        })),
      }),
    ]);

    await prisma.catalogSync.update({
      where: { shop },
      data: {
        status: complete ? "ready" : "partial",
        productCount: productRows.length,
        pageCount: pages.length,
        lastRunAt: new Date(),
        lastError: complete
          ? null
          : `Only the first ${productRows.length} products were synced before the time limit. Run the sync again to continue.`,
      },
    });

    return { productCount: productRows.length, pageCount: pages.length };
  } catch (error) {
    await prisma.catalogSync.update({
      where: { shop },
      data: {
        status: "failed",
        lastError:
          error instanceof Error ? error.message : "Catalog sync failed.",
        lastRunAt: new Date(),
      },
    });
    throw error;
  }
}
