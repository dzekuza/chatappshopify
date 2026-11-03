import { waitUntil } from "@vercel/functions";

// Keeps a Klaviyo profile in sync with the contact details a shopper gives
// the chat widget to start a conversation. Multi-tenant, so there's no
// shared app-level Klaviyo key the way there's a shared Gemini key — each
// shop connects its own private API key in Settings (WidgetSettings.klaviyoApiKey),
// and this is a no-op for any shop that hasn't.

const API_BASE = "https://a.klaviyo.com/api";
// Klaviyo revisions are supported for 2 years; pin one rather than "latest"
// so a future breaking revision can't silently change this request's shape.
// Bump deliberately — see https://developers.klaviyo.com/en/docs/changelog.
const API_REVISION = "2026-07-15";

export function isKlaviyoConfigured(apiKey: string | null | undefined) {
  return Boolean(apiKey);
}

/**
 * Never worth failing or slowing down a shopper's chat over — same reasoning
 * and pattern as telegram.server.ts's `background()` helper (kept local
 * here, like shopify-customer-sync.server.ts's copy, rather than shared;
 * each caller's error-logging prefix differs).
 */
function background(task: Promise<unknown>) {
  const swallowed = task.catch((error) => {
    console.error("Klaviyo profile sync failed:", error);
  });
  try {
    waitUntil(swallowed);
  } catch {
    // Not running on Vercel (local dev, or outside a request context) — the
    // promise still settles, it just isn't tracked.
  }
}

type KlaviyoContact = {
  name: string;
  email: string;
  phone: string | null;
};

function splitName(fullName: string): { first_name: string; last_name?: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { first_name: trimmed };
  return {
    first_name: trimmed.slice(0, spaceIndex),
    last_name: trimmed.slice(spaceIndex + 1),
  };
}

/**
 * Throws on a non-2xx response (e.g. a bad/revoked API key, rate limit) so
 * the caller's `background()` catch aborts the whole sync rather than
 * falling through to treat an inconclusive lookup as "not found" — see
 * `syncKlaviyoProfile`'s doc comment for why that distinction matters here.
 */
async function profileExistsByEmail(
  apiKey: string,
  email: string,
): Promise<boolean> {
  const filter = `equals(email,${JSON.stringify(email)})`;
  const response = await fetch(
    `${API_BASE}/profiles/?filter=${encodeURIComponent(filter)}`,
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        Accept: "application/vnd.api+json",
        revision: API_REVISION,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Klaviyo profile lookup failed (${response.status})`);
  }
  const json = await response.json();
  return Array.isArray(json?.data) && json.data.length > 0;
}

async function importProfile(
  apiKey: string,
  contact: KlaviyoContact,
  includePhone: boolean,
): Promise<Response> {
  const { first_name, last_name } = splitName(contact.name);
  return fetch(`${API_BASE}/profile-import/`, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
      revision: API_REVISION,
    },
    body: JSON.stringify({
      data: {
        type: "profile",
        attributes: {
          email: contact.email,
          phone_number: includePhone ? contact.phone : undefined,
          first_name,
          last_name,
          properties: { Source: "AI Chat Widget" },
        },
      },
    }),
  });
}

/**
 * Create a Klaviyo profile for the shopper who just started a chat
 * conversation. Runs in the background — never awaited by the chat route,
 * never blocks or fails a shopper's reply. No-ops if the shop hasn't
 * connected a Klaviyo API key.
 *
 * Deliberately CREATE-ONLY, never update, same reasoning as
 * shopify-customer-sync.server.ts's `syncShopifyCustomer`: the widget is an
 * unauthenticated storefront endpoint, so anyone can type any name/phone
 * alongside a real shopper's email with no proof they own it.
 * `/api/profile-import/` upserts unconditionally by email — calling it on a
 * match would silently overwrite that real profile's name/phone with
 * whatever the attacker typed, so a lookup runs first and the import is
 * skipped entirely on any match (security review, 2026-11-03 — see
 * decisions-log ADR-0003).
 */
export function syncKlaviyoProfile(
  apiKey: string | null | undefined,
  contact: KlaviyoContact,
) {
  if (!isKlaviyoConfigured(apiKey)) return;

  background(
    (async () => {
      const exists = await profileExistsByEmail(apiKey as string, contact.email);
      if (exists) return;

      let response = await importProfile(apiKey as string, contact, true);

      if (!response.ok && contact.phone) {
        // Klaviyo rejects a phone_number that isn't a valid, SMS-capable
        // number — the widget collects it as free text with no format
        // validation, so this isn't rare. Retry without it rather than
        // losing the profile creation entirely.
        const body = await response.clone().json().catch(() => null);
        const phoneRejected = Array.isArray(body?.errors)
          ? body.errors.some((e: {source?: {pointer?: string}}) =>
              e?.source?.pointer?.includes("phone_number"),
            )
          : false;
        if (phoneRejected) {
          response = await importProfile(apiKey as string, contact, false);
        }
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `Klaviyo profile-import failed (${response.status}):`,
          body,
        );
      }
    })(),
  );
}
