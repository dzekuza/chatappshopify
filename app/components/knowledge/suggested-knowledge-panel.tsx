import type { KnowledgeSuggestion } from "../../knowledge-suggestions.server";

export type SuggestedKnowledgePanelProps = {
  suggestions: KnowledgeSuggestion[];
  hasAnalyzed: boolean;
  isAnalyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  onAdd: (suggestion: KnowledgeSuggestion) => void;
};

function emptyMessage(hasAnalyzed: boolean) {
  return hasAnalyzed
    ? "No new suggestions — everything shoppers asked about recently is already covered by your knowledge base."
    : "Analyze recent shopper conversations to see which questions — and which products — are worth adding to your knowledge base.";
}

export function SuggestedKnowledgePanel({
  suggestions,
  hasAnalyzed,
  isAnalyzing,
  error,
  onAnalyze,
  onAdd,
}: SuggestedKnowledgePanelProps) {
  return (
    <s-section heading="Suggested knowledge">
      <s-stack direction="block" gap="base">
        {suggestions.length === 0 ? (
          <s-paragraph tone="neutral" color="subdued">
            {emptyMessage(hasAnalyzed)}
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="small-300">
            {suggestions.map((suggestion, index) => (
              // A grid rather than an inline stack: the text column has to
              // absorb whatever length the model returns while Add stays
              // pinned to the right, which "1fr auto" does and a stack's
              // space-between doesn't once the text wraps.
              <s-grid
                key={`${suggestion.question}-${index}`}
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="start"
              >
                <s-stack direction="block" gap="small-500">
                  <s-stack
                    direction="inline"
                    gap="small-300"
                    alignItems="center"
                  >
                    <s-badge
                      tone={suggestion.kind === "product" ? "info" : "auto"}
                    >
                      {suggestion.kind === "product" && suggestion.productTitle
                        ? `Product: ${suggestion.productTitle}`
                        : "FAQ"}
                    </s-badge>
                    {suggestion.askedCount > 1 ? (
                      <s-text color="subdued">
                        Asked {suggestion.askedCount} times
                      </s-text>
                    ) : null}
                  </s-stack>
                  <s-text>{suggestion.question}</s-text>
                  <s-text color="subdued">{suggestion.reason}</s-text>
                </s-stack>
                <s-button variant="tertiary" onClick={() => onAdd(suggestion)}>
                  Add
                </s-button>
              </s-grid>
            ))}
          </s-stack>
        )}

        {error ? <s-text tone="critical">{error}</s-text> : null}

        <s-button
          variant="secondary"
          icon="refresh"
          onClick={onAnalyze}
          {...(isAnalyzing ? { loading: true } : {})}
        >
          {hasAnalyzed ? "Re-analyze conversations" : "Analyze conversations"}
        </s-button>
      </s-stack>
    </s-section>
  );
}
