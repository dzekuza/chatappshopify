import { useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";
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
import { PlanCard, type Plan } from "../components/plans/plan-card";

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
            error: null,
          };
        }
      }
      throw thrown;
    }
  }

  try {
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
      error: null,
    };
  } catch {
    // Billing/usage lookups are best-effort here — surface a banner rather
    // than taking the whole page down with a generic error boundary.
    return {
      confirmationUrl: null,
      currentPlan: null,
      conversationsThisMonth: 0,
      freeLimit: FREE_PLAN_MONTHLY_CONVERSATIONS,
      error: "Couldn't load your current plan and usage. Some information below may be out of date.",
    };
  }
};

// Plain string literals, not the ../shopify.server import above — that import
// is only safe in the loader because it's stripped from the client bundle.
// PLANS is used by the component below, so it can't reference the server
// import without dragging shopify.server into the client bundle.
const FREE_PLAN = "Free";
const MONTHLY_PLAN = "Monthly Plan";
const PRO_PLAN = "Pro Plan";

const PLANS: Plan[] = [
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

// Monthly and Pro sit inline in the top row, Free spans the full width below.
// These are two separate grids rather than one 3-cell grid with the Free card
// spanning both columns: s-box has no gridColumn/gridArea prop, so the span
// silently did nothing and Free rendered as a half-width cell with an empty
// slot beside it.
const PAID_PLANS = [
  PLANS.find((p) => p.name === MONTHLY_PLAN)!,
  PLANS.find((p) => p.name === PRO_PLAN)!,
];
const FREE_PLAN_DETAILS = PLANS.find((p) => p.name === FREE_PLAN)!;

export default function Plans() {
  const { confirmationUrl, currentPlan, conversationsThisMonth, freeLimit, error } =
    useLoaderData<typeof loader>();
  // No active subscription means the shop is on Free — there is no $0
  // subscription to read back from Shopify.
  const activePlan = currentPlan ?? FREE_PLAN;
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();

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

  const isPending = (planName: string) =>
    navigation.state !== "idle" &&
    new URLSearchParams(navigation.location?.search).get("plan") === planName;

  return (
    <s-page heading="Choose a plan">
      {error ? (
        <s-banner tone="critical" heading="Couldn't load plan details">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      ) : null}
      <s-section heading="Pick the plan that fits your store">
        <s-stack direction="block" gap="base">
          {activePlan === FREE_PLAN ? (
            <s-paragraph>
              You&rsquo;re on the Free plan — {conversationsThisMonth} of{" "}
              {freeLimit} conversations used this month. New conversations pause
              once you reach the limit; conversations already under way keep
              going.
            </s-paragraph>
          ) : null}
          <s-grid
            gridTemplateColumns="@container (inline-size <= 640px) 1fr, repeat(2, 1fr)"
            gap="base"
          >
            {PAID_PLANS.map((plan) => (
              <PlanCard
                key={plan.name}
                plan={plan}
                isCurrent={plan.name === activePlan}
                isFree={false}
                href={planHref(plan.name)}
                loading={isPending(plan.name)}
              />
            ))}
          </s-grid>
          <PlanCard
            plan={FREE_PLAN_DETAILS}
            isCurrent={activePlan === FREE_PLAN}
            isFree
          />
        </s-stack>
      </s-section>
    </s-page>
  );
}
