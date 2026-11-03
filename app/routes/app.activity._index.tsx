import { EmptyState } from "../components/ui/empty-state";

// Rendered in the right-hand panel (see the <Outlet /> in app.activity.tsx)
// when no conversation is selected yet — the index child of that layout
// route.
export default function ActivityIndex() {
  return (
    <EmptyState
      heading="Select a conversation"
      description="Choose a conversation from the list on the left to view its messages and reply."
    >
      {null}
    </EmptyState>
  );
}
