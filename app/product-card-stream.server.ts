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
  getTrailer: (fullText: string) => string,
  onStreamError?: StreamErrorHandler,
) {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const reader = source.getReader();
      let fullText = "";
      try {
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += value;
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
        const trailer = getTrailer(fullText);
        if (trailer) {
          controller.enqueue(encoder.encode(trailer));
        }
      } finally {
        controller.close();
      }
    },
  });
}

// The model can call searchProducts more than once in a single turn (e.g.
// browse broadly, then narrow down) — see the tool description in
// apps.chat-widget.chat.tsx. Since only the *last* call's results are ever
// captured, they aren't guaranteed to be what the final reply text actually
// recommends. When the text names a product from an earlier call by title,
// prefer results that match what's actually being talked about over
// whatever the last (possibly unrelated) call happened to return.
function preferMentionedProducts(products: unknown[], fullText: string): unknown[] {
  const mentioned = products.filter((p) => {
    const title = (p as { title?: unknown })?.title;
    return typeof title === "string" && title && fullText.includes(title);
  });
  return mentioned.length > 0 ? mentioned : products;
}

// A deterministically-served workflow question (see apps.chat-widget.chat.tsx)
// never calls the model, so there's no AI SDK textStream to wrap — this just
// puts a single string through the same "one text/plain chunk" shape so the
// client's existing stream-reading loop (ai-chat-widget.js) needs no branch
// for it.
export function plainTextResponse(
  text: string,
  extraHeaders: Record<string, string> = {},
) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
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
    (fullText) => {
      const products = getProducts();
      if (!products || products.length === 0) return "";
      const shown = preferMentionedProducts(products, fullText);
      return `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(shown)}${PRODUCTS_SENTINEL_SUFFIX}`;
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
    (fullText) => {
      let trailer = "";
      const products = getProducts();
      if (products && products.length > 0) {
        const shown = preferMentionedProducts(products, fullText);
        trailer += `${PRODUCTS_SENTINEL_PREFIX}${JSON.stringify(shown)}${PRODUCTS_SENTINEL_SUFFIX}`;
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
