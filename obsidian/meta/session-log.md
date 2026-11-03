---
tags: [meta, session-log]
updated: 2026-11-03
---

# Session log

Append-only record of **what each working session changed and where it left the
project**. Newest first. Keep entries short (3–6 lines). Notable user-facing or
architectural changes also go in [[changelog]] / [[decisions-log]]; the live
snapshot lives in [[status]].

Entry format:

```
## YYYY-MM-DD HH:MM — one-line summary
- **Changed:** files / areas touched and why
- **Status:** what works now, what is half-done
- **Next:** the first thing to do next session
```

## 2026-11-03 — Fixed unauthenticated-overwrite bug in the chat-sync feature below
- **Changed:** `app/shopify-customer-sync.server.ts` (deleted `updateCustomer`; a matched email now
  returns/skips instead of updating) and `app/klaviyo.server.ts` (added `profileExistsByEmail` lookup;
  `/api/profile-import/` is now only called when it returns false). Both syncs are create-only now.
- **Status:** A background security review of the chat-sync feature below correctly flagged that
  `customerUpdate`/`profile-import`-on-a-match let anyone type a real customer's email into the
  (unauthenticated, public) chat widget alongside an arbitrary name/phone and have it silently
  overwritten in Shopify/Klaviyo. Fixed same-session, before any deploy — see ADR-0003 in
  [[decisions-log]]. `npm run typecheck`/`npm run lint` clean after the fix.
- **Next:** none for this fix. If "update an existing customer from chat" is wanted later, it needs
  `logged_in_customer_id` verification (see ADR-0003's consequences), not a reversion to this bug's
  shape.

## 2026-11-03 — Chat-start sync to Shopify customers + Klaviyo
- **Changed:** new `app/shopify-customer-sync.server.ts` (find-by-email then
  customerUpdate/customerCreate, tag `"AI Chat Widget"`) and `app/klaviyo.server.ts`
  (`POST /api/profile-import/`), both wired into `app/routes/apps.chat-widget.chat.tsx`'s
  conversation-creation block. New `WidgetSettings.klaviyoApiKey` field
  (`prisma/migrations/20261102235532_add_klaviyo_api_key`, migration applied to the dev DB), new
  `app/components/settings/klaviyo-section.tsx` + wiring in `app/routes/app.settings.tsx`. Added
  `write_customers` to `scopes` in both `shopify.app.ai-chat-app.toml` and `shopify.app.dev.toml`.
- **Status:** `npm run typecheck`, `npm run lint`, `npm run build` all clean. Not manually verified in
  a live embedded-admin session (would need a tunnel + installed dev store — out of reach here).
  **The scope change is not deployed** — `shopify app deploy` wasn't run for either config, so
  `admin.graphql` customer mutations will 403/no-op in production until it is, and existing merchants
  need to re-approve the new scope afterward (Shopify's `app/scopes_update` reconsent flow, already
  wired in this app).
- **Next:** deploy the scope change (`npm run deploy -- --config ai-chat-app` and
  `-- --config dev`), then verify a real chat conversation actually creates a Shopify customer and
  (with a test Klaviyo key set) a Klaviyo profile.

## 2026-11-03 — vault initialised

- **Changed:** project brain scaffolded (vault, shims, hooks).
- **Status:** skeleton only — architecture notes and catalogs still empty.
- **Next:** fill [[status]] and the architecture notes from the real codebase.
