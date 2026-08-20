import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// The app proxy's base path. Without this route, Shopify's proxy hitting
// `/apps/chat-widget` (rather than one of the sub-paths) 404s with
// "No route matched". Acts as a health check for the proxy configuration:
// a 200 here means the proxy signature verified and the shop has a session.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ ok: true, shop: session.shop });
};
