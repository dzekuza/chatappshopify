import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { validateProactiveRules } from "../proactive";

// Saves the proactive-message rules. Kept out of app.settings.tsx's action for
// the same reason app.headless.tsx and app.telegram.tsx are: that one saves the
// whole widget-settings form as a single JSON payload behind the App Bridge
// save bar, and a rules list edited through a modal fires none of the field
// events that save bar derives its dirty state from.

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const payload = await request.json();

  const result = validateProactiveRules(payload?.rules);
  if ("error" in result) {
    return Response.json({ ok: false, error: result.error }, { status: 400 });
  }

  const enabled = Boolean(payload?.enabled);

  await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: { proactiveEnabled: enabled, proactiveRules: result.rules },
    create: {
      shop: session.shop,
      proactiveEnabled: enabled,
      proactiveRules: result.rules,
    },
  });

  return Response.json({ ok: true, enabled, rules: result.rules });
};
