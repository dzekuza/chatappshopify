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

/**
 * Called when the model stream fails part-way through. Returns the text to
 * append in place of the answer the shopper never got.
 *
 * The status line is already sent by the time a Gemini call throws, so an
 * error here can't become an HTTP status — without this hook the stream just
 * ended and the client showed a truncated (usually empty) message, which is
 * exactly how an exhausted API key stayed invisible. Erroring the stream
 * instead is worse: the client's read loop throws and falls into the same
 * generic "something went wrong" branch.
 */
export type StreamErrorHandler = (error: unknown) => Promise<string> | string;

function buildSentinelStream(
  source: ReadableStream<string>,
  getTrailer: () => string,
  onStreamError?: StreamErrorHandler,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = source.getReader();
      try {
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(encoder.encode(value));
          }
        } catch (error) {
          if (!onStreamError) throw error;
          const message = await onStreamError(error);
          if (message) controller.enqueue(encoder.encode(message));
          // Deliberately no trailer: whatever product cards were captured
          // before the failure belong to an answer that never arrived.
          return;
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
  onStreamError?: StreamErrorHandler,
) {
  const stream = buildSentinelStream(
    result.textStream,
    () => {
      const products = getProducts();
      if (!products || products.length === 0) return "";
      return `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(products)}${PRODUCTS_SENTINEL_SUFFIX}`;
    },
    onStreamError,
  );

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
  onStreamError?: StreamErrorHandler,
) {
  const stream = buildSentinelStream(
    result.textStream,
    () => {
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
    },
    onStreamError,
  );

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
  });
}
