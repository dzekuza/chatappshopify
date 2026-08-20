import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export type ProductOption = {
  id: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string | null;
  compareAtPrice: string | null;
};

// Resource route the knowledge page's product picker fetches on demand —
// kept separate from app.knowledge.tsx (trailing underscore opts out of
// route nesting) so the merchant's product catalog isn't loaded until they
// open the picker. Accepts ?query= for the search box.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("query")?.trim() ?? "";

  const response = await admin.graphql(
    `#graphql
      query ProductPicker($query: String!) {
        products(first: 10, query: $query) {
          nodes {
            id
            title
            handle
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
            compareAtPriceRange {
              minVariantCompareAtPrice {
                amount
              }
            }
          }
        }
      }`,
    { variables: { query: search } },
  );
  const json = await response.json();
  const nodes: Record<string, unknown>[] = json?.data?.products?.nodes ?? [];

  const products: ProductOption[] = nodes.map((n) => {
    const featuredMedia = n.featuredMedia as
      | { preview?: { image?: { url?: string } } }
      | undefined;
    const priceRangeV2 = n.priceRangeV2 as
      | { minVariantPrice?: { amount?: string; currencyCode?: string } }
      | undefined;
    const compareAtPriceRange = n.compareAtPriceRange as
      | { minVariantCompareAtPrice?: { amount?: string } }
      | undefined;

    const minPrice = priceRangeV2?.minVariantPrice;
    const currencyCode = minPrice?.currencyCode;
    const priceAmount = minPrice?.amount ? Number(minPrice.amount) : null;
    const compareAtAmount = compareAtPriceRange?.minVariantCompareAtPrice
      ?.amount
      ? Number(compareAtPriceRange.minVariantCompareAtPrice.amount)
      : null;

    const formatAmount = (amount: number | null) =>
      amount !== null && currencyCode
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currencyCode,
          }).format(amount)
        : null;

    return {
      id: String(n.id ?? ""),
      title: String(n.title ?? ""),
      handle: String(n.handle ?? ""),
      imageUrl: featuredMedia?.preview?.image?.url ?? null,
      price: formatAmount(priceAmount),
      compareAtPrice: formatAmount(compareAtAmount),
    };
  });

  return { products };
};
