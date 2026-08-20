import type { LoaderFunctionArgs } from "react-router";
import { redirect, useSearchParams } from "react-router";
import {
  authenticate,
  isBillingEnabled,
  isTestBilling,
  MONTHLY_PLAN as SERVER_MONTHLY_PLAN,
  PRO_PLAN as SERVER_PRO_PLAN,
} from "../shopify.server";

// The charge is started from this loader, on a `?plan=` document navigation —
// never from an action. billing.request ends in the library's redirectOutOfApp,
// which branches on the request type: an XHR (any fetcher/Form submit, which
// carries an Authorization header) gets a bodyless 401 that React Router hands
// straight to the ErrorBoundary, while a document request gets the
// /auth/exit-iframe redirect App Bridge needs to take the top window to
// Shopify's charge confirmation page.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Where the Billing API is unavailable (custom-distribution dev app), this
  // page can only ever fail, so send the merchant back to the app. Keep
  // Shopify's params on the redirect or App Bridge can't initialise — see
  // app.tsx.
  if (!isBillingEnabled) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const requestedPlan = url.searchParams.get("plan");
  if (
    requestedPlan === SERVER_MONTHLY_PLAN ||
    requestedPlan === SERVER_PRO_PLAN
  ) {
    // Always throws — either the exit-iframe redirect or a Billing API error.
    return billing.request({ plan: requestedPlan, isTest: isTestBilling });
  }

  return null;
};

// Plain string literals, not the ../shopify.server import above — that import
// is only safe in the loader because it's stripped from the client bundle.
// PLANS is used by the component below, so it can't reference the server
// import without dragging shopify.server into the client bundle.
const MONTHLY_PLAN = "Monthly Plan";
const PRO_PLAN = "Pro Plan";

const PLANS = [
  {
    name: MONTHLY_PLAN,
    price: "$4.99",
    tagline: "7-day free trial, then $4.99/month",
    features: [
      "AI shopping assistant chat widget",
      "Live product lookup via your store's catalog",
      "Order status lookup and human handoff",
      "Uses the app's shared Gemini API key",
    ],
  },
  {
    name: PRO_PLAN,
    price: "$12.99",
    tagline: "7-day free trial, then $12.99/month",
    features: [
      "Everything in the Monthly plan",
      "Bring your own Gemini API key — unlimited usage on your own quota",
      "Priority support",
    ],
  },
];

export default function Plans() {
  const [searchParams] = useSearchParams();

  // A plain link, not a Form: s-button renders an anchor that React Router
  // doesn't intercept, so the click is a real document navigation. Shopify's
  // params (shop, host, embedded, …) have to ride along or App Bridge can't
  // initialise on the page that loads.
  const planHref = (plan: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("plan", plan);
    return `/app/plans?${params.toString()}`;
  };

  return (
    <s-page heading="Choose a plan">
      <s-section heading="Pick the plan that fits your store">
        <s-stack direction="inline" gap="base">
          {PLANS.map((plan) => (
            <s-box
              key={plan.name}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              minInlineSize="280px"
            >
              <s-stack direction="block" gap="base">
                <s-heading>{plan.name}</s-heading>
                <s-text type="strong">{plan.price}/month</s-text>
                <s-text color="subdued">{plan.tagline}</s-text>
                <s-stack direction="block" gap="small-300">
                  {plan.features.map((feature) => (
                    <s-text key={feature}>• {feature}</s-text>
                  ))}
                </s-stack>
                <s-button href={planHref(plan.name)} variant="primary">
                  Start free trial
                </s-button>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
