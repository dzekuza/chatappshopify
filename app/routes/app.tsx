import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import {
  authenticate,
  isTestBilling,
  MONTHLY_PLAN,
  PRO_PLAN,
} from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);

  const url = new URL(request.url);

  // /app/plans is where onFailure sends merchants to pick a plan — the
  // billing gate can't apply to that page itself or it'd redirect in a loop.
  const isPlansPage = url.pathname === "/app/plans";

  if (!isPlansPage) {
    try {
      await billing.require({
        plans: [MONTHLY_PLAN, PRO_PLAN],
        isTest: isTestBilling,
        // Carry Shopify's params (shop, host, embedded, id_token, …) across.
        // App Bridge reads shop/host off the document URL, so a bare-path
        // redirect makes it throw "missing required configuration fields:
        // shop" inside the iframe — and addDocumentResponseHeaders drops the
        // frame-ancestors CSP for the same reason. Same pattern as
        // app/routes/_index/route.tsx.
        onFailure: async () =>
          redirect(`/app/plans?${url.searchParams.toString()}`),
      });
    } catch (error) {
      // onFailure's redirect is thrown by billing.require — let it through.
      if (error instanceof Response) throw error;
      // Narrow: only swallow the "app can't charge merchants yet" case, which
      // 500s every page on a live store before App Store approval. Any other
      // Billing API error must surface — silently allowing access on a generic
      // failure would hand out the paid app for free.
      const message = error instanceof Error ? error.message : String(error);
      if (!/not approved|cannot charge|can't charge/i.test(message)) throw error;
      console.error("Billing unavailable (app not approved to charge):", error);
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
        {/* Persistent, so a merchant on any plan can upgrade or downgrade
            without contacting support or reinstalling. */}
        <s-link href="/app/plans">Plans</s-link>
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
