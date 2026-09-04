import { parseChatMarkdown } from "../chat-markdown";

// Renders an assistant message on a Polaris surface (the conversation detail
// page). Until this existed, that page printed the raw text, so a shopper's
// transcript showed literal "**Price:**" asterisks and every bullet list
// collapsed onto one line — HTML eats the newlines the model emitted.
//
// The chat preview renders the same AST with plain <p>/<ul> instead, since it
// has to match the storefront widget rather than the admin.
export function ChatMessageBody({ text }: { text: string }) {
  const blocks = parseChatMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <s-stack direction="block" gap="small-200">
      {blocks.map((block, i) =>
        block.type === "list" ? (
          <s-unordered-list key={i}>
            {block.items.map((segments, j) => (
              <s-list-item key={j}>
                {segments.map((segment, k) =>
                  segment.bold ? (
                    <s-text key={k} type="strong">
                      {segment.text}
                    </s-text>
                  ) : (
                    segment.text
                  ),
                )}
              </s-list-item>
            ))}
          </s-unordered-list>
        ) : (
          <s-paragraph key={i}>
            {block.segments.map((segment, k) =>
              segment.bold ? (
                <s-text key={k} type="strong">
                  {segment.text}
                </s-text>
              ) : (
                segment.text
              ),
            )}
          </s-paragraph>
        ),
      )}
    </s-stack>
  );
}
