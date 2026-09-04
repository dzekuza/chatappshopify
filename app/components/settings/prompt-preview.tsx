// Renders a persona prompt for reading inside a modal. The prompt is plain
// text whose line breaks carry meaning (markdown headings, bullet lists), and
// s-text has no preformatted type — so each line becomes its own paragraph.
// Splitting only on blank lines collapses every bullet in a list onto one run.
export function PromptPreview({ prompt }: { prompt: string }) {
  const lines = prompt.split("\n").filter((line) => line.trim());

  return (
    <s-box background="subdued" padding="base" borderRadius="base">
      <s-stack direction="block" gap="small-300">
        {lines.map((line, index) => (
          <s-paragraph key={index}>{line}</s-paragraph>
        ))}
      </s-stack>
    </s-box>
  );
}
