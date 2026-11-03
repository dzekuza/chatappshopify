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

type KlaviyoApiError = {
  code?: string;
  title?: string;
  // Just a field path (e.g. "/data/attributes/phone_number"), not a value —
  // safe to keep around for `phoneFieldRejected` below, unlike `detail`
  // (omitted entirely — Klaviyo's validation errors can echo the rejected
  // value back in it, e.g. the shopper's submitted phone number).
  source?: { pointer?: string };
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
 * `POST /api/profiles/` — plain create, not the `/api/profile-import/`
 * upsert endpoint. Deliberate: Klaviyo resolves a profile's identity across
 * every identifier on it (email AND phone_number, not just whichever one a
 * caller happens to check), and returns 409 the moment any of them already
 * match an existing profile. A caller-side "does a profile with this email
 * exist?" pre-check doesn't see that — supply a stranger's real phone
 * number alongside a fake email and an email-only check says "not found"
 * while Klaviyo's own identity resolution would still match (and, through
 * the upsert endpoint, update) that stranger's real profile. Letting
 * Klaviyo's create-only endpoint be the single source of truth for "does
 * this already exist" closes that gap (security review, 2026-11-03 — see
 * decisions-log ADR-0004).
 */
async function createProfile(
  apiKey: string,
  contact: KlaviyoContact,
  includePhone: boolean,
): Promise<Response> {
  const { first_name, last_name } = splitName(contact.name);
  return fetch(`${API_BASE}/profiles/`, {
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

/** Klaviyo's JSON:API error objects, stripped of `detail` (which can echo
 * the rejected value back, e.g. the submitted phone number) — never the raw
 * response body. `source.pointer` is kept for `phoneFieldRejected` below;
 * `logErrors` strips it too before this reaches a log line. */
async function errorSummary(response: Response): Promise<KlaviyoApiError[]> {
  const body = await response.json().catch(() => null);
  if (!Array.isArray(body?.errors)) return [];
  return body.errors.map((e: KlaviyoApiError) => ({
    code: e?.code,
    title: e?.title,
    source: e?.source?.pointer ? { pointer: e.source.pointer } : undefined,
  }));
}

function phoneFieldRejected(errors: KlaviyoApiError[]) {
  return errors.some((e) => e?.source?.pointer?.includes("phone_number"));
}

function logErrors(status: number, errors: KlaviyoApiError[]) {
  console.error(
    `Klaviyo profile create failed (${status}):`,
    errors.map((e) => ({ code: e.code, title: e.title })),
  );
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
 * alongside a real shopper's email (or phone — see `createProfile`'s doc
 * comment) with no proof they own it. A 409 from `createProfile` means
 * Klaviyo found an existing profile matching some identifier on this
 * contact; treated as "already exists", skipped, never updated.
 */
export function syncKlaviyoProfile(
  apiKey: string | null | undefined,
  contact: KlaviyoContact,
) {
  if (!isKlaviyoConfigured(apiKey)) return;

  background(
    (async () => {
      let response = await createProfile(apiKey as string, contact, true);

      if (response.status === 409) return;

      if (!response.ok && contact.phone) {
        // Klaviyo rejects a phone_number that isn't a valid, SMS-capable
        // number — the widget collects it as free text with no format
        // validation, so this isn't rare. Retry without it rather than
        // losing the profile creation entirely.
        const errors = await errorSummary(response.clone());
        if (phoneFieldRejected(errors)) {
          response = await createProfile(apiKey as string, contact, false);
          if (response.status === 409) return;
        }
      }

      if (!response.ok) {
        const errors = await errorSummary(response);
        logErrors(response.status, errors);
      }
    })(),
  );
}
