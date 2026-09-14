import prisma from "./db.server";
import { MONTHLY_PLAN, PRO_PLAN } from "./shopify.server";

// Secret codes that unlock a paid plan without going through a real Shopify
// charge — for beta testers, partners, and promo unlocks. Format:
// "CODE1:Monthly Plan,CODE2:Pro Plan", kept in an env var rather than
// checked into git — unlike the myshopify domains in billing.server.ts's
// COMPED_SHOPS, a redemption code is meant to be secret, not just internal.
const VALID_OVERRIDE_PLANS = [MONTHLY_PLAN, PRO_PLAN];

function resolveCodePlan(code: string): string | null {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  const raw = process.env.PLAN_UNLOCK_CODES ?? "";
  for (const pair of raw.split(",")) {
    const [rawCode, rawPlan] = pair.split(":");
    if (!rawCode || !rawPlan) continue;
    if (rawCode.trim().toLowerCase() !== normalized) continue;

    const plan = rawPlan.trim();
    if (VALID_OVERRIDE_PLANS.includes(plan)) return plan;
  }
  return null;
}

// Records the unlock on WidgetSettings so it's checked everywhere a real
// subscription of that plan name would be — see isProPlan in
// app.settings.tsx and the conversation cap in apps.chat-widget.chat.tsx.
export async function redeemPlanCode(
  shop: string,
  code: string,
): Promise<{ plan: string } | { error: string }> {
  const plan = resolveCodePlan(code);
  if (!plan) return { error: "That code isn't valid." };

  await prisma.widgetSettings.upsert({
    where: { shop },
    update: { planOverride: plan, planOverrideRedeemedAt: new Date() },
    create: { shop, planOverride: plan, planOverrideRedeemedAt: new Date() },
  });

  return { plan };
}
