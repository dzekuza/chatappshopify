import prisma from "../db.server";
import type { authenticate } from "../shopify.server";

const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAILS_FOR_CONVERSION_CHECK = 100;

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

export type ChatStats = {
  activeSessions: number;
  totalChats: number;
  conversionRate: number;
  convertedCount: number;
  totalCustomersWithEmail: number;
};

async function countConvertedCustomers(admin: AdminClient, emails: string[]) {
  if (!emails.length) return 0;

  const capped = emails.slice(0, MAX_EMAILS_FOR_CONVERSION_CHECK);
  const query = capped
    .map((email) => `email:"${email.replace(/"/g, "")}"`)
    .join(" OR ");

  const response = await admin.graphql(
    `#graphql
      query ConvertedOrders($query: String!) {
        orders(first: 250, query: $query) {
          edges {
            node {
              email
            }
          }
        }
      }
    `,
    { variables: { query } },
  );
  const data = await response.json();
  const edges = data.data?.orders?.edges ?? [];
  const orderedEmails = new Set(
    edges
      .map((edge: { node: { email: string | null } }) => edge.node.email?.toLowerCase())
      .filter(Boolean),
  );
  return capped.filter((email) => orderedEmails.has(email.toLowerCase())).length;
}

// Shared by the Activity page (full conversations list) and the Home page
// (metrics cards) so the "active sessions / total chats / conversion rate"
// numbers can never drift between the two.
export async function computeChatStats(
  shop: string,
  admin: AdminClient,
): Promise<ChatStats> {
  const [totalChats, activeConversations, customerEmailRows] = await Promise.all([
    prisma.conversation.count({ where: { shop } }),
    prisma.chatMessage.findMany({
      where: {
        shop,
        createdAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
    prisma.conversation.findMany({
      where: { shop, customerEmail: { not: null } },
      select: { customerEmail: true },
      distinct: ["customerEmail"],
    }),
  ]);

  const distinctEmails = customerEmailRows
    .map((row) => row.customerEmail)
    .filter((email): email is string => Boolean(email));

  const convertedCount = await countConvertedCustomers(admin, distinctEmails);
  const conversionRate = distinctEmails.length
    ? Math.round((convertedCount / distinctEmails.length) * 100)
    : 0;

  return {
    activeSessions: activeConversations.length,
    totalChats,
    conversionRate,
    convertedCount,
    totalCustomersWithEmail: distinctEmails.length,
  };
}
