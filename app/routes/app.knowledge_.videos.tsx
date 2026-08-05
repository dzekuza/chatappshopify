import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export type VideoFile = {
  id: string;
  filename: string;
  thumbnailUrl: string | null;
  url: string;
};

// Resource route the knowledge page's video picker fetches on demand — kept
// separate from app.knowledge.tsx (trailing underscore opts out of route
// nesting) so the merchant's video library isn't loaded until they open the
// picker.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query VideoFiles($query: String!) {
        files(first: 20, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            ... on Video {
              id
              filename
              alt
              preview {
                image {
                  url
                }
              }
              sources {
                url
                mimeType
                format
              }
            }
          }
        }
      }`,
    { variables: { query: "media_type:VIDEO" } },
  );
  const json = await response.json();
  const nodes: Record<string, unknown>[] = json?.data?.files?.nodes ?? [];

  const videos: VideoFile[] = nodes
    .map((n) => {
      const sources = (n.sources as Record<string, unknown>[]) ?? [];
      const mp4 =
        sources.find((s) => String(s.mimeType) === "video/mp4") ?? sources[0];
      const preview = n.preview as { image?: { url?: string } } | undefined;
      return {
        id: String(n.id ?? ""),
        filename: String(n.filename ?? "Untitled video"),
        thumbnailUrl: preview?.image?.url ?? null,
        url: String(mp4?.url ?? ""),
      };
    })
    .filter((v) => v.id && v.url);

  return { videos };
};
