// Parses the tiny markdown subset the assistant actually emits — paragraphs,
// "- "/"* " bullet lists, and **bold** — into a structure each surface can
// render in its own idiom.
//
// This is a parser, not a renderer, because the two admin surfaces that need
// it want different markup: the chat preview mirrors the storefront widget
// with plain <p>/<ul>/<strong> and CSS Modules, while the conversation detail
// page has to be Polaris (<s-paragraph>, <s-unordered-list>, <s-text
// type="strong">). Returning an AST keeps one set of parsing rules without
// forcing one set of tags on both.
//
// Deliberately not a markdown library: the input is our own system prompt's
// output, the accepted syntax is two constructs wide, and the storefront
// widget parses the same subset by hand with no build step (see
// ai-chat-widget.js) — a dependency here would put the two out of step.

export type InlineSegment = { text: string; bold: boolean };

export type MarkdownBlock =
  | { type: "paragraph"; segments: InlineSegment[] }
  | { type: "list"; items: InlineSegment[][] };

const BULLET = /^\s*[-*]\s+/;

export function parseInlineMarkdown(line: string): InlineSegment[] {
  return line
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part !== "")
    .map((part) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export function parseChatMarkdown(text: string): MarkdownBlock[] {
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (BULLET.test(lines[i])) {
      const items: InlineSegment[][] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(parseInlineMarkdown(lines[i].replace(BULLET, "")));
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    // Blank lines only ever separated blocks in this subset — there are no
    // hard line breaks to preserve, so they're dropped rather than emitted
    // as empty paragraphs.
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    blocks.push({ type: "paragraph", segments: parseInlineMarkdown(lines[i]) });
    i++;
  }

  return blocks;
}
