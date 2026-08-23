type TextStreamSource = { textStream: ReadableStream<string> };

// Both chat routes stream plain text (toTextStreamResponse) rather than the
// AI SDK's full UI-message-stream protocol, to keep the simple char-by-char
// TextDecoder loop both clients (chat-preview.tsx, ai-chat-widget.js)
// already use. To still get structured product-card data to the client
// without a wire-protocol rewrite, the last searchProducts result is
// appended as a sentinel-delimited JSON comment after the prose finishes —
// the same pattern already used for the bare-media-URL convention in
// knowledgeBasePrompt. Clients must only attempt to parse it once the
// stream is fully drained (see extractProductCards on the client side).
const PRODUCTS_SENTINEL_PREFIX = "\n\n<!--AICW_PRODUCTS:";
const PRODUCTS_SENTINEL_SUFFIX = "-->";

export function textStreamWithProductCards(
  result: TextStreamSource,
  getProducts: () => unknown[] | null,
  extraHeaders: Record<string, string> = {},
) {
  const source = result.textStream;
  const stream = new ReadableStream<Uint8Array>({
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
        const products = getProducts();
        if (products && products.length > 0) {
          controller.enqueue(
            encoder.encode(
              `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(products)}${PRODUCTS_SENTINEL_SUFFIX}`,
            ),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}
