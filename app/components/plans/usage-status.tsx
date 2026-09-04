export type UsageStatusProps = {
  isFreePlan: boolean;
  conversationsThisMonth: number;
  freeLimit: number;
  usesOwnKey: boolean;
  aiOk: boolean;
};

// Conversations are only capped on Free, but the count is shown on every plan:
// "am I still being served?" is the question this section exists to answer,
// and leaving paid plans blank made a working store look unmonitored.
export function UsageStatus({
  isFreePlan,
  conversationsThisMonth,
  freeLimit,
  usesOwnKey,
  aiOk,
}: UsageStatusProps) {
  const remaining = Math.max(0, freeLimit - conversationsThisMonth);
  const atLimit = isFreePlan && remaining === 0;
  const nearLimit = isFreePlan && !atLimit && remaining <= 5;

  return (
    <s-section heading="Usage this month">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text color="subdued">Conversations:</s-text>
          {isFreePlan ? (
            <s-badge
              tone={atLimit ? "critical" : nearLimit ? "warning" : "success"}
              icon={atLimit ? "alert-circle" : nearLimit ? "alert-triangle" : "check-circle"}
            >
              {conversationsThisMonth} of {freeLimit} used
            </s-badge>
          ) : (
            <s-badge tone="success" icon="check-circle">
              {conversationsThisMonth} started &mdash; no limit
            </s-badge>
          )}
        </s-stack>

        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text color="subdued">AI assistant:</s-text>
          <s-badge
            tone={aiOk ? "success" : "critical"}
            icon={aiOk ? "check-circle" : "alert-circle"}
          >
            {aiOk ? "Answering shoppers" : "Not answering"}
          </s-badge>
        </s-stack>

        <s-paragraph tone="neutral" color="subdued">
          {usesOwnKey
            ? "Running on your own Gemini API key, so AI usage is billed to you by Google and isn't limited by this app."
            : "Running on the shared Gemini API key included with the app."}
        </s-paragraph>

        {atLimit ? (
          <s-banner tone="critical" heading="Monthly conversation limit reached">
            <s-paragraph>
              New conversations are paused until next month &mdash; shoppers who
              start a chat are told to contact you directly. Conversations
              already under way keep going. Upgrade below to remove the limit.
            </s-paragraph>
          </s-banner>
        ) : null}

        {nearLimit ? (
          <s-banner tone="warning" heading="Almost at your monthly limit">
            <s-paragraph>
              {remaining} conversation{remaining === 1 ? "" : "s"} left this
              month. New chats pause once you hit {freeLimit}.
            </s-paragraph>
          </s-banner>
        ) : null}
      </s-stack>
    </s-section>
  );
}
