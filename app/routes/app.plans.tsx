import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useSearchParams } from "react-router";
import {
  authenticate,
  isBillingEnabled,
  isTestBilling,
  MONTHLY_PLAN as SERVER_MONTHLY_PLAN,
  PRO_PLAN as SERVER_PRO_PLAN,
} from "../shopify.server";
import {
  countConversationsThisMonth,
  FREE_PLAN_MONTHLY_CONVERSATIONS,
} from "../billing.server";

// REAUTH_URL_HEADER in @shopify/shopify-app-react-router — the header the
// library puts the charge confirmation URL on when it answers an XHR.
const REAUTH_URL_HEADER = "X-Shopify-API-Request-Failure-Reauthorize-Url";

// The charge is started from this loader on a `?plan=` navigation, never from
// an action. billing.request always throws, and what it throws depends on the
// request type: a request carrying an Authorization header — which is every
// fetcher submit AND every client-side navigation React Router turns into a
// `.data` fetch — gets a bodyless 401 that lands in the ErrorBoundary, while a
// true document load gets the /auth/exit-iframe redirect. Inside the embedded
// app almost everything is the former, so rather than fighting for a document
// load, read the confirmation URL off the 401 and let the component send the
// top window there through App Bridge.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
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
    try {
      // Always throws: the 401 below, an exit-iframe redirect on a document
      // load, or a Billing API error.
      await billing.request({ plan: requestedPlan, isTest: isTestBilling });
    } catch (thrown) {
      if (thrown instanceof Response) {
        const confirmationUrl = thrown.headers.get(REAUTH_URL_HEADER);
        if (confirmationUrl) {
          return {
            confirmationUrl,
            currentPlan: null,
            conversationsThisMonth: 0,
            freeLimit: FREE_PLAN_MONTHLY_CONVERSATIONS,
          };
        }
      }
      throw thrown;
    }
  }

  const [{ appSubscriptions }, conversationsThisMonth] = await Promise.all([
    billing.check({ plans: [SERVER_MONTHLY_PLAN, SERVER_PRO_PLAN] }),
    countConversationsThisMonth(session.shop),
  ]);
  const currentPlan = appSubscriptions[0]?.name ?? null;

  return {
    confirmationUrl: null,
    currentPlan,
    conversationsThisMonth,
    freeLimit: FREE_PLAN_MONTHLY_CONVERSATIONS,
  };
};

// Plain string literals, not the ../shopify.server import above — that import
// is only safe in the loader because it's stripped from the client bundle.
// PLANS is used by the component below, so it can't reference the server
// import without dragging shopify.server into the client bundle.
const FREE_PLAN = "Free";
const MONTHLY_PLAN = "Monthly Plan";
const PRO_PLAN = "Pro Plan";

const PLANS = [
  {
    name: FREE_PLAN,
    price: "$0",
    tagline: "No charge, no trial to start",
    features: [
      "AI shopping assistant chat widget",
      "Live product lookup via your store's catalog",
      "50 conversations per month",
    ],
  },
  {
    name: MONTHLY_PLAN,
    price: "$4.99",
    tagline: "7-day free trial, then $4.99/month",
    features: [
      "Everything in Free, plus:",
      "Unlimited conversations",
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
  const { confirmationUrl, currentPlan, conversationsThisMonth, freeLimit } =
    useLoaderData<typeof loader>();
  // No active subscription means the shop is on Free — there is no $0
  // subscription to read back from Shopify.
  const activePlan = currentPlan ?? FREE_PLAN;
  const [searchParams] = useSearchParams();

  // Shopify's confirmation page can't render inside the app iframe, so it has
  // to be opened on the top window. App Bridge intercepts window.open with a
  // "_top" target and performs the redirect.
  useEffect(() => {
    if (confirmationUrl) {
      window.open(confirmationUrl, "_top");
    }
  }, [confirmationUrl]);

  // Shopify's params (shop, host, embedded, …) have to ride along or App
  // Bridge can't initialise on the page that loads.
  const planHref = (plan: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("plan", plan);
    return `/app/plans?${params.toString()}`;
  };

  return (
    <s-page heading="Choose a plan">
      <s-section heading="Pick the plan that fits your store">
        {activePlan === FREE_PLAN ? (
          <s-paragraph>
            You&rsquo;re on the Free plan — {conversationsThisMonth} of{" "}
            {freeLimit} conversations used this month. New conversations pause
            once you reach the limit; conversations already under way keep
            going.
          </s-paragraph>
        ) : null}
        <s-grid gridTemplateColumns="repeat(3, 1fr)" gap="base">
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
                <s-unordered-list>
                  {plan.features.map((feature) => (
                    <s-list-item key={feature}>{feature}</s-list-item>
                  ))}
                </s-unordered-list>
                {plan.name === activePlan ? (
                  <s-badge tone="success">Current plan</s-badge>
                ) : plan.name === FREE_PLAN ? (
                  <s-text color="subdued">
                    Cancel a paid plan from your Shopify admin to return to
                    Free.
                  </s-text>
                ) : (
                  <s-button href={planHref(plan.name)} variant="primary">
                    Start free trial
                  </s-button>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-grid>
      </s-section>
    </s-page>
  );
}
