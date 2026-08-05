import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export type ImageFile = {
  id: string;
  filename: string;
  url: string;
};

// Resource route the knowledge page's image picker fetches on demand — kept
// separate from app.knowledge.tsx (trailing underscore opts out of route
// nesting) so the merchant's image library isn't loaded until they open the
// picker. Mirrors app.knowledge_.videos.tsx for the image media type.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query ImageFiles($query: String!) {
        files(first: 20, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            ... on MediaImage {
              id
              alt
              image {
                url
              }
            }
          }
        }
      }`,
    { variables: { query: "media_type:IMAGE" } },
  );
  const json = await response.json();
  const nodes: Record<string, unknown>[] = json?.data?.files?.nodes ?? [];

  const images: ImageFile[] = nodes
    .map((n) => {
      const image = n.image as { url?: string } | undefined;
      return {
        id: String(n.id ?? ""),
        filename: String(n.alt ?? "Untitled image"),
        url: String(image?.url ?? ""),
      };
    })
    .filter((i) => i.id && i.url);

  return { images };
};
