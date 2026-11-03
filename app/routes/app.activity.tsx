import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Outlet,
  useLoaderData,
  useNavigate,
  useNavigation,
  useParams,
  useRevalidator,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { computeChatStats } from "../lib/chat-stats.server";
import { MetricsCard, type Metric } from "../components/ui/metrics-card";
import { ConversationsEmptyState } from "../components/ui/conversations-empty-state";
import styles from "../styles/activity-conversation-list.module.css";

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
        select: {
          conversationId: true,
          customerName: true,
          needsHuman: true,
          aiPaused: true,
        },
      })
    : [];
  const needsHumanSet = new Set(
    conversationRows.filter((r) => r.needsHuman).map((r) => r.conversationId),
  );
  const aiPausedSet = new Set(
    conversationRows.filter((r) => r.aiPaused).map((r) => r.conversationId),
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
        aiPaused: aiPausedSet.has(g.conversationId),
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
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const params = useParams();

  // Poll for new conversations/messages so both panels update live — this
  // revalidates the whole route tree, including the selected conversation
  // rendered in <Outlet />, so the child route doesn't need its own poll.
  // Same cadence as the storefront widget's own poll.
  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle" && navigation.state === "idle") {
        revalidator.revalidate();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [revalidator, navigation.state]);

  // Opening a conversation is a client-side navigation that waits on that
  // route's loader — without this the table just sits there looking dead.
  const openingConversation =
    navigation.state === "loading" &&
    navigation.location?.pathname.startsWith("/app/activity/");

  const metrics: Metric[] = [
    {
      key: "active",
      label: "Active sessions",
      value: String(stats.activeSessions),
      description: "Chats active in the last 15 minutes",
      icon: "chat",
    },
    {
      key: "total",
      label: "Total customer chats",
      value: String(stats.totalChats),
      description: "All-time conversations with shoppers",
      icon: "order",
    },
    {
      key: "conversion",
      label: "Conversion rate",
      value: `${stats.conversionRate}%`,
      description: `${stats.convertedCount} of ${stats.totalCustomersWithEmail} chat customers went on to place an order`,
      icon: "cart",
    },
  ];

  return (
    <s-page heading="Activity">
      <MetricsCard heading="Overview" metrics={metrics} />

      {conversations.length === 0 ? (
        <ConversationsEmptyState />
      ) : (
        <s-grid gridTemplateColumns="360px 1fr" gap="base">
          <s-box border="base" borderRadius="base" padding="none">
            {openingConversation ? (
              <s-box padding="base">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-spinner accessibilityLabel="Opening conversation" />
                  <s-text color="subdued">Opening conversation…</s-text>
                </s-stack>
              </s-box>
            ) : null}
            <s-scroll-box
              maxBlockSize="640px"
              accessibilityLabel="Conversations"
              accessibilityRole="region"
            >
              <s-stack direction="block" gap="none">
                {conversations.map((c, index) => {
                  const isActive = params.conversationId === c.conversationId;
                  const preview =
                    c.lastMessage.length > 60
                      ? `${c.lastMessage.slice(0, 60)}…`
                      : c.lastMessage || "No messages yet";
                  return (
                    <s-stack key={c.conversationId} direction="block" gap="none">
                      <a
                        className={styles.row}
                        href={`/app/activity/${c.conversationId}`}
                        onClick={(event) => {
                          event.preventDefault();
                          navigate(`/app/activity/${c.conversationId}`);
                        }}
                      >
                        <s-box
                          padding="base"
                          {...(isActive ? { background: "subdued" } : {})}
                        >
                          <s-stack direction="block" gap="small-200">
                            <s-text type={isActive ? "strong" : undefined}>
                              {c.customerName || preview}
                            </s-text>
                            {c.customerName ? (
                              <s-text color="subdued">{preview}</s-text>
                            ) : null}
                            <s-stack
                              direction="inline"
                              gap="small-200"
                              alignItems="center"
                            >
                              <s-badge tone={roleTone(c.lastRole)}>
                                {roleLabel(c.lastRole)}
                              </s-badge>
                              {c.needsHuman ? (
                                <s-badge tone="warning" icon="alert-triangle">
                                  Needs attention
                                </s-badge>
                              ) : null}
                              {c.aiPaused ? (
                                <s-badge tone="info">AI paused</s-badge>
                              ) : null}
                              <s-text color="subdued">
                                {formatDate(c.lastActivity)}
                              </s-text>
                            </s-stack>
                          </s-stack>
                        </s-box>
                      </a>
                      {index < conversations.length - 1 ? (
                        <s-divider direction="block" color="base" />
                      ) : null}
                    </s-stack>
                  );
                })}
              </s-stack>
            </s-scroll-box>
          </s-box>

          <s-box border="base" borderRadius="base" padding="base">
            <Outlet />
          </s-box>
        </s-grid>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
