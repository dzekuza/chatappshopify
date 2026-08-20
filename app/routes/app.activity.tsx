import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { computeChatStats } from "../lib/chat-stats.server";

const PAGE_SIZE = 50;

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const stats = await computeChatStats(session.shop, admin);

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

  const conversationRows = conversationIds.length
    ? await prisma.conversation.findMany({
        where: {
          shop: session.shop,
          conversationId: { in: conversationIds },
        },
        select: { conversationId: true, customerName: true, needsHuman: true },
      })
    : [];
  const needsHumanSet = new Set(
    conversationRows.filter((r) => r.needsHuman).map((r) => r.conversationId),
  );
  const customerNameByConversation = new Map(
    conversationRows.map((r) => [r.conversationId, r.customerName]),
  );

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
        customerName: customerNameByConversation.get(g.conversationId) || "",
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
          <s-grid gap="base" justifyItems="center">
            <s-heading>No conversations yet</s-heading>
            <s-paragraph>
              Once shoppers chat with the assistant on your storefront, their
              conversations will show up here.
            </s-paragraph>
            <s-button-group>
              <s-button slot="primary-action" href="/app/settings" variant="primary">
                Test the widget
              </s-button>
              <s-button slot="secondary-actions" href="/app/knowledge">
                Add answers
              </s-button>
            </s-button-group>
          </s-grid>
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
                      <s-stack direction="block" gap="small-200">
                        <s-link
                          id={linkId}
                          href={`/app/activity/${c.conversationId}`}
                          onClick={(event: Event) => {
                            event.preventDefault();
                            navigate(`/app/activity/${c.conversationId}`);
                          }}
                        >
                          {c.customerName ||
                            (c.lastMessage.length > 80
                              ? `${c.lastMessage.slice(0, 80)}…`
                              : c.lastMessage || "No messages yet")}
                        </s-link>
                        {c.customerName ? (
                          <s-text color="subdued">
                            {c.lastMessage.length > 80
                              ? `${c.lastMessage.slice(0, 80)}…`
                              : c.lastMessage || "No messages yet"}
                          </s-text>
                        ) : null}
                      </s-stack>
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
