---
tags: [meta, changelog]
updated: 2026-08-25
---

# Changelog

Chronological log of notable changes to the project. Newest first.
This is a human-curated log — not a mirror of `git log`. Record *why*, not just
*what*; the diff already covers *what*.

## 2026-11-03 — Starting a chat now creates a Shopify customer, and a Klaviyo profile if connected
- Until now, the name/email/phone a shopper gives to start a chat (`apps.chat-widget.chat.tsx`'s
  contact gate) was written only to this app's own `Conversation` table — never synced anywhere else.
  Asked by the project owner; see ADR-0002 for the reasoning.
- New `app/shopify-customer-sync.server.ts`: looks up a Shopify customer by email, `customerCreate`s
  one (tagged `"AI Chat Widget"`) if not found. Needs the new `write_customers` scope (added to both
  `shopify.app.*.toml` configs) — **not deployed yet**, see session-log for the deploy step this still
  needs.
- New `app/klaviyo.server.ts`: looks a profile up by email first, then `POST /api/profile-import/`
  (Klaviyo's create-or-update endpoint) only if none was found. No-ops unless the shop has set a
  Klaviyo private API key — new `WidgetSettings.klaviyoApiKey` field (migration
  `20261102235532_add_klaviyo_api_key`) and a new "Klaviyo" settings-page section, available on every
  plan.
- **Deliberately create-only on both sides, never update an existing match** — a background security
  review (same session) correctly flagged the first version of this as an unauthenticated overwrite:
  the chat widget is a public storefront form, so anyone could type a real customer's email alongside
  any name/phone and have it silently overwrite that customer's Shopify/Klaviyo record. See ADR-0003.
- Both syncs run fire-and-forget via `waitUntil` (same `background()` pattern as
  `telegram.server.ts`'s notifications) — a sync failure or Klaviyo being unreachable never blocks or
  fails the shopper's chat. Each retries once without the phone number if the receiving API rejects it
  specifically for its format, since the widget collects phone as unvalidated free text.

## 2026-08-25 — video timestamps on knowledge entries

- A knowledge entry with an attached video can now carry a start/end time, so
  the assistant can say "that's shown from 0:10 to 0:15" and hand the shopper a
  player that opens at 0:10 and stops at 0:15.
- The range travels as a `#t=start,end` media fragment on the URL, because the
  model's reply text is the only channel between the server and the players —
  there is no structured media payload in the stream.
- Both chat backends (`apps.chat-widget.chat.tsx`, `app.chat-widget.preview.tsx`)
  and all three players (storefront widget, admin preview, activity transcript)
  had to change together; the widget is vanilla JS and shares no code with the
  React side by design.

## 2026-08-25 — vault initialised

- Project brain scaffolded from the shared `.project-brain` template: vault,
  root shims (`AGENTS.md` / `CLAUDE.md` / `.cursorrules`), and the three Claude
  Code hooks that keep this vault in sync.
