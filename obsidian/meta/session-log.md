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

## 2026-11-03 — Real client QA on handoff flow + AI holding-reply fix
- **Changed:** ohubo (real merchant) reported 5 issues after testing the
  handoff flow by hand (translated from Lithuanian): AI doesn't go quiet
  after a human replies; AI should give a short notice instead of fully
  answering while waiting for a human; no "team member joined" message;
  can a reply also go by email if the shopper's left the site; does
  Telegram/Activity need a paid plan. Investigated with a direct read-only
  query against the live production DB for their actual test conversation
  (`28529b47-...`) plus `gh run list` deploy timestamps — their test window
  (17:19–17:22 UTC) was *before* that day's AI-pause deploy finished
  (17:25), so items 1 and (partly) 3 were already fixed, just not live yet
  at test time. Confirmed via grep that Telegram/Activity have zero plan
  gating (item 5: works fully on Free). Confirmed via grep that there's no
  email-sending code anywhere in the repo (item 4: real feature, not a
  tweak). Item 2 was genuinely missing and got fixed: new
  `NEEDS_HUMAN_HOLDING_MESSAGE` + early-return in apps.chat-widget.chat.tsx
  — once a human's been requested (`needsHuman`) but hasn't joined
  (`aiPaused` still false), every further shopper message gets a short
  canned holding reply instead of a full AI turn with tool calls.
  `HANDOFF_TOOL_INSTRUCTION` reworded to match (stop telling the model to
  promise ongoing full help).
- **Status:** typecheck/lint/build clean. Not committed, not pushed.
- **Next:** Commit, push, have ohubo re-test everything fresh.

## 2026-11-03 — Storefront widget shows live human-handoff status
- **Changed:** `requestHumanHandoff` (apps.chat-widget.chat.tsx) now sets a
  `handoffRequested` flag, which `textStreamWithProductCardsAndNavigation`
  (product-card-stream.server.ts) turns into a new flag-only
  `AICW_HANDOFF` sentinel on the reply stream. The widget
  (ai-chat-widget.js/.css) parses it in `extractProductCards` and shows a
  "Connecting you with a team member…" loader via a new
  `renderHandoffStatus()` / `.aicw-handoff-status` element between the
  message list and composer. `apps.chat-widget.messages.tsx`'s existing 5s
  poll now also returns `needsHuman`/`aiPaused`, so once a human agent
  actually replies (aiPaused — see the AI-pause session below) the banner
  switches to a "A team member has joined" badge, styled to match
  `.aicw-message-agent`'s existing green exactly (a widget-parity review
  caught a slightly-off shade on the first pass, fixed).
- **Status:** typecheck/lint/build clean; widget-parity review confirmed the
  admin chat preview needs no change (it has no persisted Conversation row,
  so no handoff state to show — its stream helper never gets the sentinel
  param). Not committed, not pushed.
- **Next:** Commit and push.

## 2026-11-03 — Activity rebuilt as a two-column inbox page
- **Changed:** Reworked the admin Activity section from separate list/detail
  pages into one two-column page. `app.activity.tsx` is now a layout route
  (left: conversation list in a `<s-scroll-box>` + `<s-table>`; right:
  `<Outlet />`). Renamed `app.activity_.$conversationId.tsx` →
  `app.activity.$conversationId.tsx` (dropped the trailing underscore so it
  nests under the layout per the flat-routes dot convention) and stripped it
  down to content-only (no `<s-page>`/`<s-section>`). Added
  `app.activity._index.tsx` for the right panel's empty state. Removed the
  child route's own 5s poll since the parent's poll already revalidates the
  whole tree once both panels share a page.
- **Status:** `npx react-router routes` confirms the nesting; `npm run
  typecheck`/`lint`/`build` all clean; a background Polaris-prop review of
  all three files found no issues. Not committed, not pushed — no DB changes
  needed for this one.
- **Next:** Commit and push.

## 2026-11-03 — Admin live-polling + AI pauses when a human agent takes over
- **Changed:** Admin Activity pages (`app.activity.tsx`,
  `app.activity_.$conversationId.tsx`) didn't revalidate after first load —
  added a 5s `useRevalidator` poll to both. Added `Conversation.aiPaused`
  (migration `20261103130000_add_ai_paused`, **not yet applied** — run
  `npx prisma migrate deploy`) and `app/conversation-handoff.server.ts`
  (`markHumanTookOver`), called from the admin reply action and
  `telegram.webhook.tsx` so the AI stops replying to a shopper once a human
  agent sends a message. `apps.chat-widget.chat.tsx` checks `aiPaused` and
  returns an empty reply instead of calling Gemini; `ai-chat-widget.js`
  drops the empty assistant bubble instead of showing a blank one. Admin
  conversation page shows an "AI replies paused" banner with a "Resume AI"
  button that clears the flag (never cleared automatically).
- **Status:** `npm run typecheck`/`lint` clean. Not committed, not pushed,
  migration not applied to any database.
- **Next:** Apply the migration, commit, and verify in a real embedded
  admin session (couldn't exercise this in-session — needs an authenticated
  Shopify admin + a live Telegram-linked shop to see the full handoff path).

## 2026-11-03 — Committed, deployed prod scope config, and fixed a second security review round
- **Changed:** Committed and pushed the chat-sync feature + ADR-0003 fix (`a828464`). A background
  review of that push flagged two more issues before production: `app/klaviyo.server.ts` switched from
  a `GET /api/profiles/?filter=equals(email,…)` pre-check + `POST /api/profile-import/` to a direct
  `POST /api/profiles/` (plain create), treating its 409 as "exists, skip" — closes a gap where the
  email-only pre-check couldn't see Klaviyo's phone-based identity matching. Error logging now strips
  `detail`/raw body everywhere (kept only `code`/`title`). Added
  `WidgetSettings.syncCustomersToShopify` (`Boolean @default(false)`, new migration) and a Settings
  toggle — the Shopify customer sync (previously unconditional for every shop) is now opt-in, same as
  Klaviyo already was structurally.
- **Status:** Fixed and verified (`npm run typecheck`/`lint`/`build` all clean) before any further
  deploy — see ADR-0004 in [[decisions-log]]. Pushed to `main`; the prod `deploy-prod.yml` CI run for
  the first commit (`a828464`) had already completed successfully
  (`shopify app deploy --config ai-chat-app`, run 41549980653) by the time this second review landed,
  so the fixed code's Vercel deploy supersedes whatever briefly went out — real-world exposure window
  was effectively nil (brand-new, unannounced endpoint behavior).
- **Next:** still need `npm run deploy -- --config dev` for the dev Shopify config (CI only covers
  prod). The rate-limiting gap ADR-0004 flagged is unresolved — see [[status]]'s blockers.

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
