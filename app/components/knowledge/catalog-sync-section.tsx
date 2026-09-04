export type CatalogSyncInfo = {
  status: string;
  productCount: number;
  pageCount: number;
  storeUrl: string | null;
  platform: string;
  lastRunAt: string | Date | null;
  lastError: string | null;
} | null;

export type CatalogSyncSectionProps = {
  catalogSync: CatalogSyncInfo;
  isSyncing: boolean;
  onSync: () => void;
};

function statusTone(status: string): "success" | "critical" | "caution" | "info" {
  if (status === "ready") return "success";
  if (status === "partial") return "caution";
  if (status === "failed") return "critical";
  if (status === "running" || status === "pending") return "caution";
  return "info";
}

function statusIcon(status: string): JSX.IntrinsicElements["s-badge"]["icon"] {
  if (status === "ready") return "check-circle";
  if (status === "partial") return "alert-triangle";
  if (status === "failed") return "alert-circle";
  if (status === "running" || status === "pending") return "clock";
  return "info";
}

function statusLabel(status: string) {
  if (status === "ready") return "Synced";
  if (status === "partial") return "Partially synced";
  if (status === "failed") return "Failed";
  if (status === "running") return "Syncing";
  if (status === "pending") return "Pending";
  return status;
}

function formatDate(value: string | Date | null) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export function CatalogSyncSection({
  catalogSync,
  isSyncing,
  onSync,
}: CatalogSyncSectionProps) {
  const lastRun = formatDate(catalogSync?.lastRunAt ?? null);

  return (
    <s-section heading="Catalogue &amp; pages">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Syncs every product&rsquo;s title, type, options, price and
          collections, plus your store&rsquo;s page and collection URLs, so the
          assistant knows what you sell and can link shoppers to the right
          page instead of guessing.
        </s-paragraph>
        <s-paragraph tone="neutral" color="subdued">
          Stock is deliberately not stored here. Availability — including which
          sizes or variants are in stock — is read live from Shopify on every
          question, so the assistant never quotes stale inventory.
        </s-paragraph>

        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-text color="subdued">Status:</s-text>
          {catalogSync ? (
            <s-badge
              tone={statusTone(catalogSync.status)}
              icon={statusIcon(catalogSync.status)}
            >
              {statusLabel(catalogSync.status)}
            </s-badge>
          ) : (
            <s-badge tone="info" icon="info">
              Not synced yet
            </s-badge>
          )}
        </s-stack>

        {catalogSync &&
        (catalogSync.status === "ready" || catalogSync.status === "partial") ? (
          <s-paragraph tone="neutral" color="subdued">
            {catalogSync.productCount} product
            {catalogSync.productCount === 1 ? "" : "s"} and{" "}
            {catalogSync.pageCount} page
            {catalogSync.pageCount === 1 ? "" : "s"} indexed
            {lastRun ? ` — last synced ${lastRun}` : ""}.
          </s-paragraph>
        ) : null}

        {catalogSync?.storeUrl ? (
          <s-paragraph tone="neutral" color="subdued">
            {catalogSync.platform === "headless"
              ? "Headless storefront (Hydrogen/Oxygen) detected"
              : "Online Store storefront"}{" "}
            &mdash; pages indexed from {catalogSync.storeUrl}.
          </s-paragraph>
        ) : null}

        {catalogSync?.lastError ? (
          <s-banner
            tone={catalogSync.status === "partial" ? "warning" : "critical"}
            heading={
              catalogSync.status === "partial"
                ? "Catalogue only partly synced"
                : "Last sync failed"
            }
          >
            <s-paragraph>{catalogSync.lastError}</s-paragraph>
          </s-banner>
        ) : null}

        <s-button onClick={onSync} {...(isSyncing ? { loading: true } : {})}>
          Sync catalogue
        </s-button>
      </s-stack>
    </s-section>
  );
}
