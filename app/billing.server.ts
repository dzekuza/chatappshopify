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
