import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 50;
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;
const MAX_EMAILS_FOR_CONVERSION_CHECK = 100;

function formatDate(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function roleLabel(role: string) {
  if (role === "assistant") return "AI";
  if (role === "agent") return "You";
  return "Shopper";
}

function roleTone(role: string) {
  if (role === "assistant") return "info";
  if (role === "agent") return "success";
  return "auto";
}

async function countConvertedCustomers(
  admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  emails: string[],
) {
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const [totalChats, activeConversations, customerEmailRows] = await Promise.all([
    prisma.conversation.count({ where: { shop: session.shop } }),
    prisma.chatMessage.findMany({
      where: {
        shop: session.shop,
        createdAt: { gte: new Date(Date.now() - ACTIVE_WINDOW_MS) },
      },
      select: { conversationId: true },
      distinct: ["conversationId"],
    }),
    prisma.conversation.findMany({
      where: { shop: session.shop, customerEmail: { not: null } },
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

  const stats = {
    activeSessions: activeConversations.length,
    totalChats,
    conversionRate,
    convertedCount,
    totalCustomersWithEmail: distinctEmails.length,
  };

  const groups = await prisma.chatMessage.groupBy({
    by: ["conversationId"],
    where: { shop: session.shop },
    _max: { createdAt: true },
    _count: { _all: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: PAGE_SIZE,
  });

  const conversationIds = groups.map((g) => g.conversationId);

  const recentMessages = conversationIds.length
    ? await prisma.chatMessage.findMany({
        where: { shop: session.shop, conversationId: { in: conversationIds } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const previewByConversation = new Map<string, (typeof recentMessages)[number]>();
  for (const message of recentMessages) {
    if (!previewByConversation.has(message.conversationId)) {
      previewByConversation.set(message.conversationId, message);
    }
  }

  const needsHumanRows = conversationIds.length
    ? await prisma.conversation.findMany({
        where: {
          shop: session.shop,
          conversationId: { in: conversationIds },
          needsHuman: true,
        },
        select: { conversationId: true },
      })
    : [];
  const needsHumanSet = new Set(needsHumanRows.map((r) => r.conversationId));

  const conversations = groups
    .map((g) => {
      const preview = previewByConversation.get(g.conversationId);
      return {
        conversationId: g.conversationId,
        messageCount: g._count._all,
        lastActivity: g._max.createdAt as Date,
        lastMessage: preview?.content ?? "",
        lastRole: preview?.role ?? "user",
        needsHuman: needsHumanSet.has(g.conversationId),
      };
    })
    .sort((a, b) => {
      if (a.needsHuman !== b.needsHuman) return a.needsHuman ? -1 : 1;
      return 0;
    });

  return { conversations, stats };
};

export default function Activity() {
  const { conversations, stats } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page heading="Activity">
      <s-section heading="Overview">
        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Active sessions</s-text>
              <s-heading>{stats.activeSessions}</s-heading>
              <s-text color="subdued">Chats active in the last 15 minutes</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Total customer chats</s-text>
              <s-heading>{stats.totalChats}</s-heading>
              <s-text color="subdued">All-time conversations with shoppers</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text color="subdued">Conversion rate</s-text>
              <s-heading>{stats.conversionRate}%</s-heading>
              <s-text color="subdued">
                {stats.convertedCount} of {stats.totalCustomersWithEmail} chat
                customers went on to place an order
              </s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Conversations">
        {conversations.length === 0 ? (
          <s-paragraph>
            No chats yet. Once shoppers use the widget on your storefront,
            their conversations will show up here.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Conversation</s-table-header>
              <s-table-header listSlot="inline">Last sender</s-table-header>
              <s-table-header listSlot="labeled" format="numeric">
                Messages
              </s-table-header>
              <s-table-header listSlot="labeled">Last activity</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {conversations.map((c) => {
                const linkId = `conversation-link-${c.conversationId}`;
                return (
                  <s-table-row key={c.conversationId} clickDelegate={linkId}>
                    <s-table-cell>
                      <s-link
                        id={linkId}
                        href={`/app/activity/${c.conversationId}`}
                        onClick={(event: any) => {
                          event.preventDefault();
                          navigate(`/app/activity/${c.conversationId}`);
                        }}
                      >
                        {c.lastMessage.length > 80
                          ? `${c.lastMessage.slice(0, 80)}…`
                          : c.lastMessage || "No messages yet"}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={roleTone(c.lastRole)}>
                        {roleLabel(c.lastRole)}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>{c.messageCount}</s-table-cell>
                    <s-table-cell>{formatDate(c.lastActivity)}</s-table-cell>
                    <s-table-cell>
                      {c.needsHuman ? (
                        <s-badge tone="warning">Needs attention</s-badge>
                      ) : null}
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
