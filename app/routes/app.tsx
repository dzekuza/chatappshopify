import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, isBillingEnabled } from "../shopify.server";
import prisma from "../db.server";
import { ChatPreview } from "../components/settings/chat-preview";
import type { KnowledgeCollection } from "../components/settings/knowledge-sync-section";

// No billing gate: every shop can use the app on the Free plan, which is
// capped at FREE_PLAN_MONTHLY_CONVERSATIONS new conversations a month (enforced
// in the storefront chat route, since Shopify has no $0 subscription to
// require). Paid plans lift the cap.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Backs the floating admin-preview widget below — rendered once here so it
  // persists across every /app/* page, rather than being scoped to a single
  // page's own loader. Reflects the shop's saved config, not any in-progress
  // unsaved edit on the Settings page (those are two separate component
  // trees with no shared state).
  //
  // This layout loader runs on every navigation, and Home/Settings each run
  // their own upsert too — a plain read here avoids adding a second write
  // per request on top of theirs; upsert is only needed on the rare first
  // visit before either of those has ever created the row.
  let settings = await prisma.widgetSettings.findUnique({
    where: { shop: session.shop },
  });
  if (!settings) {
    settings = await prisma.widgetSettings.upsert({
      where: { shop: session.shop },
      update: {},
      create: { shop: session.shop },
    });
  }
  const shopName = session.shop.replace(/\.myshopify\.com$/, "");
  const knowledgeCollections: KnowledgeCollection[] = Array.isArray(
    settings.knowledgeCollections,
  )
    ? (settings.knowledgeCollections as unknown as KnowledgeCollection[])
    : [];

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    isBillingEnabled,
    settings,
    shopName,
    knowledgeCollections,
  };
};

export default function App() {
  const { apiKey, isBillingEnabled, settings, shopName, knowledgeCollections } =
    useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/knowledge">Knowledge</s-link>
        <s-link href="/app/activity">Activity</s-link>
        {/* Persistent, so a merchant on any plan can upgrade or downgrade
            without contacting support or reinstalling. Hidden where the
            Billing API is unavailable (custom-distribution dev app). */}
        {isBillingEnabled && <s-link href="/app/plans">Plans</s-link>}
      </s-app-nav>
      <Outlet />
      {settings.enabled ? (
        <ChatPreview
          welcomeMessage={settings.welcomeMessage}
          primaryColor={settings.primaryColor}
          iconUrl={settings.iconUrl}
          position={settings.position}
          headerTitle={settings.headerTitle}
          cornerStyle={settings.cornerStyle}
          shopName={shopName}
          systemPrompt={settings.systemPrompt}
          geminiModel={settings.geminiModel}
          language={settings.language}
          knowledgeCollections={knowledgeCollections}
        />
      ) : null}
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
