export type Plan = {
  name: string;
  price: string;
  tagline: string;
  features: string[];
};

export function PlanCard({
  plan,
  isCurrent,
  isFree,
  href,
  loading,
}: {
  plan: Plan;
  isCurrent: boolean;
  isFree: boolean;
  href?: string;
  loading?: boolean;
}) {
  return (
    // `border` (the shorthand) not `borderWidth` — width alone leaves
    // borderStyle unset, so no border actually paints.
    <s-box padding="base" border="base" borderRadius="base" minInlineSize="280px">
      <s-stack direction="block" gap="base">
        <s-heading>{plan.name}</s-heading>
        <s-text type="strong">{plan.price}/month</s-text>
        <s-text color="subdued">{plan.tagline}</s-text>
        <s-unordered-list>
          {plan.features.map((feature) => (
            <s-list-item key={feature}>{feature}</s-list-item>
          ))}
        </s-unordered-list>
        {isCurrent ? (
          <s-badge tone="success" icon="check-circle">
            Current plan
          </s-badge>
        ) : isFree ? (
          <s-text color="subdued">
            Cancel a paid plan from your Shopify admin to return to Free.
          </s-text>
        ) : (
          <s-button
            href={href}
            variant="primary"
            {...(loading ? { loading: true } : {})}
          >
            Start free trial
          </s-button>
        )}
      </s-stack>
    </s-box>
  );
}
