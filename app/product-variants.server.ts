// Shared by both chat backends (apps.chat-widget.chat.tsx and
// app.chat-widget.preview.tsx) so the shape of a searchProducts result can't
// drift between the live storefront widget and the admin preview.

export const MAX_PRODUCT_DESCRIPTION_CHARS = 300;

type VariantNode = {
  title?: string;
  availableForSale?: boolean;
  selectedOptions?: { name: string; value: string }[];
};

// Per-variant availability, so the assistant can say "medium is sold out but
// large and XL are in" rather than only knowing whether the product has any
// stock at all. Read live on every search — never cached, because stock is
// the one thing a stale answer gets dangerously wrong.
//
// Shopify names a single-variant product's only variant "Default Title";
// surfacing that invites the model to offer a choice that doesn't exist, so
// single-variant products return null instead.
export function summarizeVariants(raw: unknown) {
  const nodes = (raw as { nodes?: VariantNode[] } | undefined)?.nodes ?? [];
  if (nodes.length <= 1) return null;

  return nodes.map((variant) => ({
    title:
      variant.title && variant.title !== "Default Title"
        ? variant.title
        : (variant.selectedOptions ?? [])
            .map((option) => option.value)
            .join(" / "),
    available: Boolean(variant.availableForSale),
  }));
}

// Without this the model tends to quietly skip an out-of-stock product rather
// than say it's unavailable, which reads to a shopper as "you don't sell it".
export const STOCK_TOOL_INSTRUCTION =
  "Every product search result carries live availability. `inStock` is false when the product has no stock at all, and `variants` (present only for products with real options like size or colour) marks each one `available: true/false`. " +
  "Always tell the shopper when something is out of stock rather than staying silent or omitting it — say it plainly, then offer the closest alternative you actually found. " +
  "When a product has variants, only confirm a specific option if that variant's `available` is true; if the shopper asks for one that isn't, say which options ARE available. " +
  "Never state or imply availability that didn't come from a search result in this conversation.";
