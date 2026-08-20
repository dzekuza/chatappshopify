import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, MONTHLY_PLAN, PRO_PLAN } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  // /app/plans is where onFailure sends merchants to pick a plan — the
  // billing gate can't apply to that page itself or it'd redirect in a loop.
  const isPlansPage = new URL(request.url).pathname === "/app/plans";

  if (!isPlansPage) {
    try {
      await billing.require({
        plans: [MONTHLY_PLAN, PRO_PLAN],
        isTest: process.env.NODE_ENV !== "production",
        onFailure: async () => redirect("/app/plans"),
      });
    } catch (error) {
      // onFailure's redirect is thrown by billing.require — let it through.
      if (error instanceof Response) throw error;
      // Anything else is the Billing API itself failing (most commonly: the app
      // isn't approved to charge merchants yet, which 500s every page on a live
      // store). Don't brick the admin over it — let the merchant in.
      console.error("Billing check failed, allowing access:", error);
    }
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Settings</s-link>
        <s-link href="/app/knowledge">Knowledge</s-link>
        <s-link href="/app/activity">Activity</s-link>
      </s-app-nav>
      <Outlet />
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
