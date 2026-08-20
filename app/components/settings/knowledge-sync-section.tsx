export type KnowledgeCollection = { id: string; title: string; handle: string };

export type KnowledgeSyncSectionProps = {
  knowledgeCollections: KnowledgeCollection[];
  isSyncingCollections: boolean;
  onSync: () => void;
  onRemove: (id: string) => void;
};

export function KnowledgeSyncSection({
  knowledgeCollections,
  isSyncingCollections,
  onSync,
  onRemove,
}: KnowledgeSyncSectionProps) {
  return (
    <s-section heading="Knowledge">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Sync specific collections so the assistant only recommends
          products from them. Leave empty to search your entire catalog.
        </s-paragraph>
        <s-button onClick={onSync} {...(isSyncingCollections ? { loading: true } : {})}>
          Sync collections
        </s-button>
        {knowledgeCollections.length > 0 ? (
          <s-stack direction="inline" gap="small-200">
            {knowledgeCollections.map((c) => (
              <s-clickable-chip
                key={c.id}
                removable
                accessibilityLabel={`Remove ${c.title}`}
                onRemove={() => onRemove(c.id)}
              >
                {c.title}
              </s-clickable-chip>
            ))}
          </s-stack>
        ) : (
          <s-paragraph tone="neutral" color="subdued">
            No collections synced — the assistant can recommend from any
            product in your store.
          </s-paragraph>
        )}
      </s-stack>
    </s-section>
  );
}
