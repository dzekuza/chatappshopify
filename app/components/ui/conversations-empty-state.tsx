import { EmptyState } from "./empty-state";

// Rendered identically by Home and Activity — previously duplicated in both.
export function ConversationsEmptyState() {
  return (
    <s-section heading="Conversations">
      <EmptyState
        heading="No conversations yet"
        description="Once shoppers chat with the assistant on your storefront, their conversations will show up here."
      >
        <s-button-group>
          <s-button href="/app/settings" variant="primary" icon="settings">
            Test the widget
          </s-button>
          <s-button href="/app/knowledge" icon="plus">
            Add answers
          </s-button>
        </s-button-group>
      </EmptyState>
    </s-section>
  );
}
