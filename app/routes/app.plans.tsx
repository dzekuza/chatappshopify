import type { ActionFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import {
  authenticate,
  isTestBilling,
  MONTHLY_PLAN as SERVER_MONTHLY_PLAN,
  PRO_PLAN as SERVER_PRO_PLAN,
} from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan =
    formData.get("plan") === SERVER_PRO_PLAN
      ? SERVER_PRO_PLAN
      : SERVER_MONTHLY_PLAN;

  return billing.request({
    plan,
    isTest: isTestBilling,
  });
};

// Plain string literals, not the ../shopify.server import above — that
// import is only safe here because `action` is stripped from the client
// bundle. PLANS is also used by the component below, so it can't reference
// the server import without dragging shopify.server into the client bundle.
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
  const fetcher = useFetcher();

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
                <fetcher.Form method="post">
                  <input type="hidden" name="plan" value={plan.name} />
                  <s-button
                    type="submit"
                    variant="primary"
                    loading={
                      fetcher.state !== "idle" &&
                      fetcher.formData?.get("plan") === plan.name
                        ? true
                        : undefined
                    }
                  >
                    Start free trial
                  </s-button>
                </fetcher.Form>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
