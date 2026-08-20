import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, isBillingEnabled } from "../shopify.server";

// No billing gate: every shop can use the app on the Free plan, which is
// capped at FREE_PLAN_MONTHLY_CONVERSATIONS new conversations a month (enforced
// in the storefront chat route, since Shopify has no $0 subscription to
// require). Paid plans lift the cap.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", isBillingEnabled };
};

export default function App() {
  const { apiKey, isBillingEnabled } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Settings</s-link>
        <s-link href="/app/knowledge">Knowledge</s-link>
        <s-link href="/app/activity">Activity</s-link>
        {/* Persistent, so a merchant on any plan can upgrade or downgrade
            without contacting support or reinstalling. Hidden where the
            Billing API is unavailable (custom-distribution dev app). */}
        {isBillingEnabled && <s-link href="/app/plans">Plans</s-link>}
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
