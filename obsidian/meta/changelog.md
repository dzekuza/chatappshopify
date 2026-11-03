---
tags: [meta, changelog]
updated: 2026-08-25
---

# Changelog

Chronological log of notable changes to the project. Newest first.
This is a human-curated log — not a mirror of `git log`. Record *why*, not just
*what*; the diff already covers *what*.

## 2026-11-03 — Starting a chat can now create a Shopify customer and/or a Klaviyo profile
- Until now, the name/email/phone a shopper gives to start a chat (`apps.chat-widget.chat.tsx`'s
  contact gate) was written only to this app's own `Conversation` table — never synced anywhere else.
  Asked by the project owner; see ADR-0002 for the reasoning.
- New `app/shopify-customer-sync.server.ts`: looks up a Shopify customer by email, `customerCreate`s
  one (tagged `"AI Chat Widget"`) if not found. **Opt-in per shop** — a "Create a Shopify customer for
  each new chat" switch in the new Settings "Customer sync" card, off by default
  (`WidgetSettings.syncCustomersToShopify`). Needs the new `write_customers` scope (added to both
  `shopify.app.*.toml` configs).
- New `app/klaviyo.server.ts`: `POST /api/profiles/` (plain create, not the upsert `/api/profile-import/`
  endpoint — see ADR-0004 for why), treating a 409 as "already exists, skip". No-ops unless the shop
  has set a Klaviyo private API key in the same "Customer sync" card
  (`WidgetSettings.klaviyoApiKey`).
- **Deliberately create-only on both sides, never update an existing match** — the chat widget is a
  public, unauthenticated form, so updating on a match would let anyone type a real customer's email
  alongside a fake name/phone and have it silently overwrite that customer's real record. Caught by a
  background security review and fixed same-session, before production ever saw the unsafe version —
  see ADR-0003 and ADR-0004 (the latter also closes a subtler identity-check gap on the Klaviyo side,
  and adds the Shopify opt-in toggle).
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
