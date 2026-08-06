import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings) {
    return Response.json({ enabled: false });
  }

  return Response.json({
    enabled: settings.enabled,
    welcomeMessage: settings.welcomeMessage,
    primaryColor: settings.primaryColor,
    position: settings.position,
    iconUrl: settings.iconUrl,
  });
};
