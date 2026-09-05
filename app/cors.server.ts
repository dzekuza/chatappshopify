// Cross-origin access to the app-proxy chat endpoints, for storefronts that
// aren't the Liquid Online Store.
//
// On an Online Store the widget is injected by the theme app extension and
// runs on the shop's own domain, so every call to /apps/chat-widget/* is
// same-origin and no CORS headers are needed — that's why these routes had
// none. A headless storefront (Hydrogen on Oxygen, or a custom framework)
// can't render a theme app extension at all: the merchant embeds the widget
// by hand and it calls the proxy on the *shop's* domain from *their* domain.
// Shopify still signs those requests, so authenticate.public.appProxy keeps
// working; only the response headers were missing.
//
// The allowlist is per-shop (WidgetSettings.storefrontOrigins) rather than a
// wildcard because these endpoints read and write a shop's conversations.
import prisma from "./db.server";

/** Reduces any user-typed URL to a bare origin, or null if it isn't one. */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname) return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Parses the JSON column into a de-duplicated list of valid origins. */
export function parseStorefrontOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const origin = normalizeOrigin(entry);
    if (origin) seen.add(origin);
  }
  return [...seen];
}

/** Splits a newline/comma separated textarea value into origins. */
export function parseOriginsInput(input: string): string[] {
  return parseStorefrontOrigins(input.split(/[\n,]/));
}

export function corsHeaders(origin: string | null): Record<string, string> {
  // Vary is set even when the origin isn't allowed: without it a cached
  // response from an allowed origin could be replayed to a disallowed one.
  if (!origin) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "X-Conversation-Id",
    Vary: "Origin",
  };
}

/** Copies a response, adding the CORS headers for `origin`. */
export function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The value for Access-Control-Allow-Origin, or null when the request needs
 * no CORS treatment.
 *
 * The `Origin`-header gate matters for cost, not just correctness: the
 * messages endpoint is polled every few seconds by every open widget, and an
 * Online Store request (no Origin header on a same-origin GET) must not pay
 * for an extra settings lookup to learn it needs nothing. Pass `known` when
 * the caller already has the settings row in hand.
 */
export async function resolveStorefrontCorsOrigin(
  request: Request,
  shop: string,
  known?: unknown,
): Promise<string | null> {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  // The shop's own domain is same-origin by definition; browsers still send
  // Origin on cross-origin-capable requests like a JSON POST from the theme.
  if (normalized === `https://${shop.toLowerCase()}`) return normalized;

  const origins =
    known !== undefined
      ? parseStorefrontOrigins(known)
      : parseStorefrontOrigins(
          (
            await prisma.widgetSettings.findUnique({
              where: { shop },
              select: { storefrontOrigins: true },
            })
          )?.storefrontOrigins,
        );

  return origins.includes(normalized) ? normalized : null;
}

/**
 * Answers a CORS preflight without authenticating.
 *
 * Granting a preflight gives nothing away — the browser still enforces the
 * *actual* response's Access-Control-Allow-Origin, which is allowlisted
 * above. In practice the widget avoids preflights entirely by posting with a
 * safelisted content type (see ai-chat-widget.js), since it isn't documented
 * that Shopify's app proxy forwards OPTIONS; this exists for hand-rolled
 * clients that do trigger one.
 */
export function corsPreflightResponse(request: Request): Response {
  const requestedHeaders =
    request.headers.get("Access-Control-Request-Headers") ?? "Content-Type";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requestedHeaders,
      "Access-Control-Max-Age": "86400",
      Vary: "Origin, Access-Control-Request-Headers",
    },
  });
}
