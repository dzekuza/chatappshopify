import { describeRange } from "../../media-timestamp";
import { EmptyState } from "../ui/empty-state";

export type KnowledgeEntryRow = {
  id: string;
  type: string;
  question: string | null;
  productTitle: string | null;
  answer: string;
  mediaType: string | null;
  mediaStartSeconds: number | null;
  mediaEndSeconds: number | null;
  source: string;
  createdByEmail: string | null;
};

function mediaBadgeLabel(
  mediaType: string | null,
  startSeconds: number | null,
  endSeconds: number | null,
) {
  if (mediaType === "video") {
    const range = describeRange(startSeconds, endSeconds);
    return range ? `Video ${range}` : "Video attached";
  }
  if (mediaType === "image") return "Image attached";
  return null;
}

export function KnowledgeEntriesTable({
  entries,
  isSaving,
  onAddNew,
  onEdit,
  onDelete,
}: {
  entries: KnowledgeEntryRow[];
  isSaving: boolean;
  onAddNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <s-section>
        <EmptyState
          heading="No custom questions yet"
          description="Add exact answers for questions you want handled a specific way, or attach extra info to a product."
        >
          <s-button
            variant="primary"
            icon="plus"
            commandFor="knowledge-modal"
            onClick={onAddNew}
          >
            Add a question
          </s-button>
        </EmptyState>
      </s-section>
    );
  }

  return (
    <s-section heading="Store FAQs" padding="none">
      <s-table variant="auto">
        <s-table-header-row>
          <s-table-header listSlot="primary">Question</s-table-header>
          <s-table-header listSlot="secondary">Answer</s-table-header>
          <s-table-header listSlot="inline">Media</s-table-header>
          <s-table-header listSlot="inline">Source</s-table-header>
          <s-table-header listSlot="inline">Created by</s-table-header>
          <s-table-header listSlot="labeled" />
        </s-table-header-row>
        <s-table-body>
          {entries.map((entry) => {
            const editLinkId = `edit-${entry.id}`;
            const mediaLabel = mediaBadgeLabel(
              entry.mediaType,
              entry.mediaStartSeconds,
              entry.mediaEndSeconds,
            );
            return (
              <s-table-row key={entry.id} clickDelegate={editLinkId}>
                <s-table-cell>
                  <s-link
                    id={editLinkId}
                    commandFor="knowledge-modal"
                    command="--show"
                    onClick={() => onEdit(entry.id)}
                  >
                    {entry.type === "product"
                      ? `Product: ${entry.productTitle}`
                      : entry.question}
                  </s-link>
                </s-table-cell>
                <s-table-cell>
                  {entry.answer.length > 100
                    ? `${entry.answer.slice(0, 100)}…`
                    : entry.answer}
                </s-table-cell>
                <s-table-cell>
                  {mediaLabel ? (
                    <s-badge tone="info">{mediaLabel}</s-badge>
                  ) : (
                    <s-text color="subdued">None</s-text>
                  )}
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={entry.source === "query-log" ? "info" : "auto"}>
                    {entry.source === "query-log" ? "Query log" : "Manual"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  <s-text color="subdued">{entry.createdByEmail ?? "—"}</s-text>
                </s-table-cell>
                <s-table-cell>
                  <s-button
                    variant="tertiary"
                    tone="critical"
                    icon="delete"
                    accessibilityLabel={`Delete "${
                      entry.type === "product" ? entry.productTitle : entry.question
                    }"`}
                    {...(isSaving ? { loading: true } : {})}
                    onClick={() => onDelete(entry.id)}
                  />
                </s-table-cell>
              </s-table-row>
            );
          })}
        </s-table-body>
      </s-table>
    </s-section>
  );
}
