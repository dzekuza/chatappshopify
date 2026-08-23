export type StoreAuditInfo = {
  status: string;
  lastRunAt: string | Date | null;
  lastError: string | null;
  storeContext: string | null;
} | null;

export type StoreAuditSectionProps = {
  audit: StoreAuditInfo;
  isRunning: boolean;
  onRefresh: () => void;
};

function statusTone(status: string): "success" | "critical" | "caution" | "info" {
  if (status === "complete") return "success";
  if (status === "failed") return "critical";
  if (status === "running" || status === "pending") return "caution";
  return "info";
}

function statusLabel(status: string) {
  if (status === "complete") return "Complete";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  if (status === "pending") return "Pending";
  return status;
}

export function StoreAuditSection({
  audit,
  isRunning,
  onRefresh,
}: StoreAuditSectionProps) {
  return (
    <s-section heading="Store audit">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          On install, the app automatically scans your storefront&rsquo;s
          sitemap, key pages (About, Shipping, Returns, FAQ, Contact), and
          your store policies, then summarizes them into background context
          the AI assistant can draw on for general questions about your
          business — on top of the exact answers you set in Knowledge.
        </s-paragraph>

        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text color="subdued">Status:</s-text>
          {audit ? (
            <s-badge tone={statusTone(audit.status)}>
              {statusLabel(audit.status)}
            </s-badge>
          ) : (
            <s-badge tone="info">Not run yet</s-badge>
          )}
        </s-stack>

        {audit?.lastRunAt ? (
          <s-text color="subdued">
            Last run: {new Date(audit.lastRunAt).toLocaleString()}
          </s-text>
        ) : null}

        {audit?.status === "failed" && audit.lastError ? (
          <s-text tone="critical">{audit.lastError}</s-text>
        ) : null}

        <s-button
          variant="secondary"
          onClick={onRefresh}
          {...(isRunning ? { loading: true } : {})}
        >
          Refresh store audit
        </s-button>
      </s-stack>
    </s-section>
  );
}
