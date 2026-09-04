export type SetupStep = {
  key: string;
  label: string;
  description: string;
  done: boolean;
  actionLabel: string;
  actionHref: string;
  // Theme-editor deep links leave the embedded admin, so they open in a
  // new tab; in-app routes don't.
  external?: boolean;
};

export function SetupGuide({ steps }: { steps: SetupStep[] }) {
  const completed = steps.filter((step) => step.done).length;

  return (
    <s-section>
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-heading>Setup guide</s-heading>
          <s-badge
            tone={completed === steps.length ? "success" : "info"}
            icon={completed === steps.length ? "check-circle" : "info"}
          >
            {`${completed} of ${steps.length} steps completed`}
          </s-badge>
        </s-stack>
        <s-stack direction="block" gap="small-200">
          {steps.map((step) => (
            <s-box key={step.key} padding="base" border="base" borderRadius="base">
              {/* An inline s-stack doesn't reflow, so these rows squashed in
                  the admin's narrow embedded pane — explicit grid tracks keep
                  the checkbox and action pinned and let the text take the
                  slack. */}
              <s-grid
                gridTemplateColumns="auto 1fr auto"
                gap="base"
                alignItems="center"
              >
                <s-checkbox
                  label={step.label}
                  labelAccessibilityVisibility="exclusive"
                  {...(step.done ? { checked: true } : {})}
                  disabled
                />
                <s-stack direction="block" gap="small-400">
                  <s-text {...(step.done ? { color: "subdued" } : {})}>
                    {step.label}
                  </s-text>
                  <s-text color="subdued">{step.description}</s-text>
                </s-stack>
                <s-button
                  href={step.actionHref}
                  {...(step.external ? { target: "_blank" } : {})}
                >
                  {step.actionLabel}
                </s-button>
              </s-grid>
            </s-box>
          ))}
        </s-stack>
      </s-stack>
    </s-section>
  );
}
