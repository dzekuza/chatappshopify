import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { parseOriginsInput } from "../cors.server";

// Saves the headless-storefront origin allowlist. Kept out of
// app.settings.tsx's action for the same reason app.telegram.tsx is: that one
// saves the whole widget-settings form as a single JSON payload behind the
// App Bridge save bar, and this card saves on its own.

const MAX_ORIGINS = 10;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const origins = parseOriginsInput(
    String(formData.get("storefrontOrigins") ?? ""),
  ).slice(0, MAX_ORIGINS);

  await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: { storefrontOrigins: origins },
    create: { shop: session.shop, storefrontOrigins: origins },
  });

  return Response.json({ ok: true, origins });
};
