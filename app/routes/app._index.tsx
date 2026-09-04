import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { waitUntil } from "@vercel/functions";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { computeChatStats } from "../lib/chat-stats.server";
import { runStoreAudit } from "../store-audit.server";
import { SetupGuide, type SetupStep } from "../components/home/setup-guide";
import { MetricsCard, type Metric } from "../components/ui/metrics-card";
import { ConversationsEmptyState } from "../components/ui/conversations-empty-state";

// Kept in sync with the Prisma default in prisma/schema.prisma
// (WidgetSettings.systemPrompt) — used only to detect whether the merchant
// has customized the persona away from the out-of-the-box prompt.
const DEFAULT_SYSTEM_PROMPT =
  "You are a friendly, concise shopping assistant for this store. Use the product lookup tool to answer questions about products, pricing, and availability. Never invent products or prices.";

// Same deep link used by the settings page's "Add to theme" button — see
// app.settings.tsx for the fuller explanation of why it's api_key-keyed.
const THEME_BLOCK_HANDLE = "chat_widget";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const settings = await prisma.widgetSettings.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
    select: {
      enabled: true,
      systemPrompt: true,
      knowledgeCollections: true,
    },
  });

  // Fallback for shops that installed before the store-audit feature shipped
  // (or whose afterAuth-triggered run failed) — the install hook is the
  // primary trigger, this just catches anything it missed.
  const storeAudit = await prisma.storeAudit.findUnique({
    where: { shop: session.shop },
    select: { status: true },
  });
  if (!storeAudit || storeAudit.status === "failed") {
    waitUntil(runStoreAudit(session.shop, admin));
  }

  const stats = await computeChatStats(session.shop, admin);

  const addToThemeUrl = `https://${session.shop}/admin/themes/current/editor?context=apps&activateAppId=${process.env.SHOPIFY_API_KEY}/${THEME_BLOCK_HANDLE}`;

  const knowledgeCollectionsCount = Array.isArray(settings.knowledgeCollections)
    ? settings.knowledgeCollections.length
    : 0;

  return {
    addToThemeUrl,
    stats,
    steps: {
      widgetEnabled: settings.enabled,
      personaCustomized: settings.systemPrompt.trim() !== DEFAULT_SYSTEM_PROMPT,
      knowledgeSynced: knowledgeCollectionsCount > 0,
    },
  };
};

export default function Index() {
  const { addToThemeUrl, stats, steps } = useLoaderData<typeof loader>();

  const setupSteps: SetupStep[] = [
    {
      key: "enable",
      label: "Enable the chat widget",
      description: "Turn the widget on so shoppers can start chatting.",
      done: steps.widgetEnabled,
      actionLabel: "Go to settings",
      actionHref: "/app/settings",
    },
    {
      key: "persona",
      label: "Customize the assistant's persona",
      description:
        "Tell the AI how to talk to shoppers instead of using the default instructions.",
      done: steps.personaCustomized,
      actionLabel: "Edit persona",
      actionHref: "/app/settings",
    },
    {
      key: "theme",
      label: "Add the widget to your theme",
      description:
        "Open the theme editor and enable the AI Chat Widget block so it shows up on your storefront.",
      // No stored flag for this — a shop only ever gets a real conversation
      // once the block is live on the storefront and enabled, so at least
      // one logged chat is a reliable (if lagging) proxy for it.
      done: stats.totalChats > 0,
      actionLabel: "Add to theme",
      actionHref: addToThemeUrl,
      external: true,
    },
    {
      key: "knowledge",
      label: "Sync your knowledge base",
      description:
        "Sync collections so the assistant only recommends products from them.",
      done: steps.knowledgeSynced,
      actionLabel: "Sync knowledge",
      actionHref: "/app/settings",
    },
  ];

  const metrics: Metric[] = [
    {
      key: "active",
      label: "Active sessions",
      value: String(stats.activeSessions),
      description: "Chats active in the last 15 minutes",
      href: "/app/activity",
      icon: "chat",
    },
    {
      key: "total",
      label: "Total chats",
      value: String(stats.totalChats),
      description: "All-time conversations with shoppers",
      href: "/app/activity",
      icon: "order",
    },
    {
      key: "conversion",
      label: "Conversion rate",
      value: `${stats.conversionRate}%`,
      description: "Chat customers who went on to place an order",
      href: "/app/activity",
      icon: "cart",
    },
  ];

  const showThemeBanner = steps.widgetEnabled && !setupSteps[2].done;

  return (
    <s-page heading="AI Chat Widget">
      <s-button
        slot="primary-action"
        href="/app/settings"
        variant="primary"
        icon="settings"
      >
        Configure widget
      </s-button>
      <s-button slot="secondary-actions" href="/app/activity" icon="chat">
        View conversations
      </s-button>

      {showThemeBanner ? (
        <s-section>
          <s-banner tone="info" heading="Confirm the widget is on your storefront">
            <s-paragraph>
              The widget is enabled, but we can&rsquo;t automatically tell
              whether it&rsquo;s been added to your theme yet. If shoppers
              don&rsquo;t see the chat bubble, add it from the theme editor.
            </s-paragraph>
            <s-button slot="secondary-actions" href={addToThemeUrl} target="_blank">
              Add to theme
            </s-button>
          </s-banner>
        </s-section>
      ) : null}

      <SetupGuide steps={setupSteps} />

      <MetricsCard metrics={metrics} />

      {stats.totalChats === 0 ? <ConversationsEmptyState /> : null}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
