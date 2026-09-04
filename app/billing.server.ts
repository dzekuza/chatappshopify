import prisma from "./db.server";

// Shopify's Billing API has no $0 subscription, so the Free plan is simply the
// absence of one: a shop with no active app subscription is on Free and gets a
// capped number of new conversations per calendar month. The cap is enforced
// here rather than by Shopify.
export const FREE_PLAN = "Free";
export const FREE_PLAN_MONTHLY_CONVERSATIONS = 50;

// Minimal shape of the Admin API client, which both authenticate.admin and
// authenticate.public.appProxy hand back — typed here so the storefront chat
// route can reuse this without importing route-specific types.
type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

// Shops that get unlimited conversations without paying — internal dev, demo
// and partner stores. Shopify's Billing API has no way to comp a shop (there
// is no $0 subscription, and a test charge still has to be approved and still
// expires), so this is an explicit allowlist rather than a faked subscription
// that billing.check would immediately contradict.
//
// These are our own stores, and a myshopify domain isn't a secret — it's
// already public in shopify.app.*.toml — so they're checked in rather than
// left to an env var alone. UNLIMITED_CONVERSATION_SHOPS extends this list
// (comma-separated domains) so a store can be comped without a deploy.
const COMPED_SHOPS = ["ohubudemo.myshopify.com", "checkoutipick.myshopify.com"];

export function hasUnlimitedConversations(shop: string): boolean {
  const normalized = shop.trim().toLowerCase();
  if (COMPED_SHOPS.includes(normalized)) return true;
  return (process.env.UNLIMITED_CONVERSATION_SHOPS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export function startOfCurrentMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

// Only conversations started this month count — an ongoing conversation keeps
// working past the cap so a shopper is never cut off mid-chat.
export async function countConversationsThisMonth(
  shop: string,
): Promise<number> {
  return prisma.conversation.count({
    where: { shop, createdAt: { gte: startOfCurrentMonth() } },
  });
}

export async function hasActiveSubscription(
  admin: AdminGraphqlClient,
): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
      query ActiveSubscriptions {
        currentAppInstallation {
          activeSubscriptions {
            name
            status
          }
        }
      }`,
  );
  const json = await response.json();
  const subscriptions: { name: string; status: string }[] =
    json?.data?.currentAppInstallation?.activeSubscriptions ?? [];

  return subscriptions.some((subscription) => subscription.status === "ACTIVE");
}
