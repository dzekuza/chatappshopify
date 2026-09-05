import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { resolveStorefrontCorsOrigin, withCors } from "../cors.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });

  // Reuses the row already loaded above, so a headless storefront's settings
  // fetch costs no extra query to work out whether its origin is allowed.
  const corsOrigin = await resolveStorefrontCorsOrigin(
    request,
    session.shop,
    settings?.storefrontOrigins,
  );

  if (!settings) {
    return withCors(Response.json({ enabled: false }), corsOrigin);
  }

  return withCors(
    Response.json({
    enabled: settings.enabled,
    welcomeMessage: settings.welcomeMessage,
    primaryColor: settings.primaryColor,
    position: settings.position,
    iconUrl: settings.iconUrl,
    headerTitle: settings.headerTitle,
      cornerStyle: settings.cornerStyle,
    }),
    corsOrigin,
  );
};
