export type PaginationControlsProps = {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function PaginationControls({
  page,
  pageCount,
  onPageChange,
}: PaginationControlsProps) {
  // A single page of results needs no controls at all.
  if (pageCount <= 1) return null;

  return (
    <s-stack
      direction="inline"
      gap="small-200"
      alignItems="center"
      justifyContent="center"
    >
      <s-button
        variant="tertiary"
        icon="chevron-left"
        accessibilityLabel="Previous page"
        {...(page <= 1 ? { disabled: true } : {})}
        onClick={() => onPageChange(page - 1)}
      />
      <s-text color="subdued">
        Page {page} of {pageCount}
      </s-text>
      <s-button
        variant="tertiary"
        icon="chevron-right"
        accessibilityLabel="Next page"
        {...(page >= pageCount ? { disabled: true } : {})}
        onClick={() => onPageChange(page + 1)}
      />
    </s-stack>
  );
}
