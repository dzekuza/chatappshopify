import { Fragment } from "react";

// Shared by Home and Activity, which previously each hand-built the same
// three-tile KPI row and had already drifted apart (Home's tiles linked
// through, Activity's didn't; only Activity had descriptions).
export type Metric = {
  key: string;
  label: string;
  value: string;
  description?: string;
  // Omit to render a plain, non-interactive tile — Activity links nowhere
  // because it *is* the destination Home's tiles point at.
  href?: string;
  icon?: JSX.IntrinsicElements["s-icon"]["type"];
};

export function MetricsCard({
  heading,
  metrics,
}: {
  heading?: string;
  metrics: Metric[];
}) {
  // "1fr auto 1fr auto 1fr" for three tiles — the `auto` tracks are the
  // dividers interleaved between them below.
  const columns = metrics.map(() => "1fr").join(" auto ");

  return (
    <s-section padding="base" {...(heading ? { heading } : {})}>
      <s-grid
        gridTemplateColumns={`@container (inline-size <= 400px) 1fr, ${columns}`}
        gap="small"
      >
        {metrics.map((metric, index) => (
          <Fragment key={metric.key}>
            {index > 0 ? <s-divider direction="block" /> : null}
            <MetricTile metric={metric} />
          </Fragment>
        ))}
      </s-grid>
    </s-section>
  );
}

function MetricTile({ metric }: { metric: Metric }) {
  const body = (
    <s-grid gap="small-300">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        {metric.icon ? (
          <s-icon type={metric.icon} color="subdued" size="small" />
        ) : null}
        <s-heading>{metric.label}</s-heading>
      </s-stack>
      <s-text>{metric.value}</s-text>
      {metric.description ? (
        <s-text color="subdued">{metric.description}</s-text>
      ) : null}
    </s-grid>
  );

  if (!metric.href) return body;

  return (
    <s-clickable
      href={metric.href}
      paddingBlock="small-400"
      paddingInline="small-100"
      borderRadius="base"
    >
      {body}
    </s-clickable>
  );
}
