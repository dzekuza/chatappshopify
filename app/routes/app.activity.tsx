import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
  const { session } = await authenticate.admin(request);

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

  const conversations = groups.map((g) => {
    const preview = previewByConversation.get(g.conversationId);
    return {
      conversationId: g.conversationId,
      messageCount: g._count._all,
      lastActivity: g._max.createdAt as Date,
      lastMessage: preview?.content ?? "",
      lastRole: preview?.role ?? "user",
    };
  });

  return { conversations };
};

export default function Activity() {
  const { conversations } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <s-page heading="Activity">
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
