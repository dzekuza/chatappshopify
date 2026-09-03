type TextStreamSource = { textStream: ReadableStream<string> };

// Both chat routes stream plain text (toTextStreamResponse) rather than the
// AI SDK's full UI-message-stream protocol, to keep the simple char-by-char
// TextDecoder loop both clients (chat-preview.tsx, ai-chat-widget.js)
// already use. To still get structured product-card (and, for the
// storefront widget, navigation) data to the client without a wire-protocol
// rewrite, the last searchProducts result and/or navigateToProduct call are
// appended as sentinel-delimited JSON comments after the prose finishes —
// the same pattern already used for the bare-media-URL convention in
// knowledgeBasePrompt. Clients must only attempt to parse them once the
// stream is fully drained (see extractProductCards on the client side).
const PRODUCTS_SENTINEL_PREFIX = "\n\n<!--AICW_PRODUCTS:";
const PRODUCTS_SENTINEL_SUFFIX = "-->";
const NAVIGATE_SENTINEL_PREFIX = "\n\n<!--AICW_NAVIGATE:";
const NAVIGATE_SENTINEL_SUFFIX = "-->";

export type NavigateTarget = { url: string; title?: string | null };

function buildSentinelStream(
  source: ReadableStream<string>,
  getTrailer: () => string,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = source.getReader();
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
        const trailer = getTrailer();
        if (trailer) {
          controller.enqueue(encoder.encode(trailer));
        }
      } finally {
        controller.close();
      }
    },
  });
}

export function textStreamWithProductCards(
  result: TextStreamSource,
  getProducts: () => unknown[] | null,
  extraHeaders: Record<string, string> = {},
) {
  const stream = buildSentinelStream(result.textStream, () => {
    const products = getProducts();
    if (!products || products.length === 0) return "";
    return `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(products)}${PRODUCTS_SENTINEL_SUFFIX}`;
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}

// Storefront-only variant (see apps.chat-widget.chat.tsx) — the admin
// preview has no real product pages to send a browser to, so it sticks with
// the plain textStreamWithProductCards above.
export function textStreamWithProductCardsAndNavigation(
  result: TextStreamSource,
  getProducts: () => unknown[] | null,
  getNavigateTarget: () => NavigateTarget | null,
  extraHeaders: Record<string, string> = {},
) {
  const stream = buildSentinelStream(result.textStream, () => {
    let trailer = "";
    const products = getProducts();
    if (products && products.length > 0) {
      trailer += `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(products)}${PRODUCTS_SENTINEL_SUFFIX}`;
    }
    const navigateTarget = getNavigateTarget();
    if (navigateTarget && navigateTarget.url) {
      trailer += `${NAVIGATE_SENTINEL_PREFIX}${JSON.stringify(navigateTarget)}${NAVIGATE_SENTINEL_SUFFIX}`;
    }
    return trailer;
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}
