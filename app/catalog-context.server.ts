import type { CatalogProduct, StorePage } from "@prisma/client";

// Turns the synced catalog snapshot into compact system-prompt context.
//
// The point is orientation, not recall: the assistant should know what kinds
// of things this store sells, which collections exist and roughly what they
// cost, so it can answer "what do you sell?" or "anything under 50?" without
// first guessing a search keyword. Exact per-product facts — above all
// availability — still come from the live searchProducts tool, so nothing
// here is allowed to imply stock.

const MAX_TYPES = 25;
const MAX_COLLECTIONS = 30;
const MAX_SAMPLE_TITLES = 60;
const MAX_PAGES_LISTED = 60;

type ProductSummary = Pick<
  CatalogProduct,
  "title" | "productType" | "vendor" | "minPrice" | "maxPrice" | "currency" | "collectionTitles"
>;

function countBy(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function formatPriceBand(products: ProductSummary[]) {
  const amounts = products
    .flatMap((p) => [p.minPrice, p.maxPrice])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (amounts.length === 0) return null;

  const currency = products.find((p) => p.currency)?.currency ?? "";
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  return `Prices range from about ${low.toFixed(2)} to ${high.toFixed(2)} ${currency}`.trim();
}

export function catalogOverviewPrompt(products: ProductSummary[]) {
  if (products.length === 0) return "";

  const lines: string[] = [
    `This store's catalogue currently contains ${products.length} product${products.length === 1 ? "" : "s"}.`,
  ];

  const types = countBy(products.map((p) => p.productType ?? ""));
  if (types.length > 0) {
    lines.push(
      `Product types: ${types
        .slice(0, MAX_TYPES)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ")}.`,
    );
  }

  const collections = countBy(
    products.flatMap((p) =>
      Array.isArray(p.collectionTitles) ? (p.collectionTitles as string[]) : [],
    ),
  );
  if (collections.length > 0) {
    lines.push(
      `Collections: ${collections
        .slice(0, MAX_COLLECTIONS)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ")}.`,
    );
  }

  const priceBand = formatPriceBand(products);
  if (priceBand) lines.push(`${priceBand}.`);

  const titles = products
    .map((p) => p.title)
    .filter(Boolean)
    .slice(0, MAX_SAMPLE_TITLES);
  if (titles.length > 0) {
    const more = products.length - titles.length;
    lines.push(
      `Example products: ${titles.join("; ")}${more > 0 ? `, and ${more} more` : ""}.`,
    );
  }

  return `Here is an overview of this store's catalogue, so you know what it contains. Use it to orient yourself and to answer general questions about the range. It does NOT tell you what is in stock, and it may be slightly out of date — always call the product search tool before stating a specific product's price, availability or link:\n\n${lines.join("\n")}`;
}

export function storePagesPrompt(pages: Pick<StorePage, "url" | "title" | "type">[]) {
  if (pages.length === 0) return "";

  const listed = pages.slice(0, MAX_PAGES_LISTED);
  const lines = listed.map(
    (page) => `- ${page.title || page.url} (${page.type}): ${page.url}`,
  );
  const more = pages.length - listed.length;

  return `These are this store's pages and collection URLs. When a shopper needs one of them, link them to the exact URL below — never invent a URL or guess a path that isn't listed here:\n\n${lines.join("\n")}${more > 0 ? `\n(and ${more} more)` : ""}`;
}

// Tells the assistant where the storefront actually lives. It matters most on
// a headless (Hydrogen/Oxygen) store: `Product.onlineStoreUrl` is null there,
// so the product links the search tool returns are relative paths, and the
// assistant needs the base to turn one into something a shopper can click.
export function storefrontPrompt(
  storeUrl: string | null,
  platform: string | null,
) {
  if (!storeUrl) return "";

  const headless = platform === "headless";
  return [
    `This store's storefront is at ${storeUrl}.`,
    headless
      ? "It is a headless (Hydrogen/Oxygen) storefront rather than a Liquid theme, so its page paths are custom — never assume a Shopify default path like /pages/faq exists. Only link to URLs listed above."
      : "",
    `When a product or page link you were given is a relative path (starting with "/"), prefix it with ${storeUrl} before showing it to the shopper.`,
  ]
    .filter(Boolean)
    .join(" ");
}
