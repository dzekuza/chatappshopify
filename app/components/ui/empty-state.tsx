import type { ReactNode } from "react";

// Shopify's standard empty-state illustration, as used by the Polaris
// empty-state composition's own examples.
const EMPTY_STATE_IMAGE =
  "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png";

export function EmptyState({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  // The call(s) to action — an <s-button-group> of plain <s-button>s. Note
  // slot="primary-action"/"secondary-actions" are meaningful on s-page and
  // s-banner, not inside a button group, so buttons here carry only variants.
  children: ReactNode;
}) {
  return (
    <s-grid gap="base" justifyItems="center">
      <s-box maxInlineSize="180px">
        <s-image
          src={EMPTY_STATE_IMAGE}
          alt=""
          inlineSize="fill"
          loading="lazy"
        />
      </s-box>
      <s-heading>{heading}</s-heading>
      <s-paragraph>{description}</s-paragraph>
      {children}
    </s-grid>
  );
}
