export type QueryLogEntry = {
  id: string;
  question: string;
  matched: boolean;
  createdAt: string | Date;
};

export function QueryLogPanel({ queries }: { queries: QueryLogEntry[] }) {
  return (
    <s-section heading="FAQ query log">
      {queries.length === 0 ? (
        <s-stack direction="block" gap="small-200" alignItems="center">
          <s-paragraph tone="neutral" color="subdued">
            No queries yet. When shoppers ask AI agents about your store,
            their questions and whether your FAQ covered them will appear
            here.
          </s-paragraph>
        </s-stack>
      ) : (
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header listSlot="primary">Question</s-table-header>
            <s-table-header listSlot="inline">Matched</s-table-header>
            <s-table-header listSlot="secondary">Asked</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {queries.map((entry) => (
              <s-table-row key={entry.id}>
                <s-table-cell>{entry.question}</s-table-cell>
                <s-table-cell>
                  {entry.matched ? (
                    <s-badge tone="success">Matched</s-badge>
                  ) : (
                    <s-badge tone="warning">Unanswered</s-badge>
                  )}
                </s-table-cell>
                <s-table-cell>
                  {new Date(entry.createdAt).toLocaleString()}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      )}
    </s-section>
  );
}
