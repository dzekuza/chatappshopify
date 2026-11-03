---
tags: [meta, status]
updated: 2026-11-03
---

# Current status — chatappshopify

> [!info] How to use this note
> The **live snapshot** of the project. Read it first when a session starts; rewrite
> it (don't append) whenever the state changes. History belongs in [[session-log]]
> and [[changelog]], not here.

**Last updated:** 2026-11-03

## Current focus

Reworked the admin Activity section into a single two-column inbox-style
page (conversation list + chat side by side) instead of separate list/detail
pages — uncommitted, see "In progress" below.

## Done recently

- **Activity is now a two-column single page (uncommitted).**
  `app/routes/app.activity.tsx` is now a layout route: a left column
  (conversation list, in a `<s-scroll-box>`-wrapped `<s-table>`, fixed
  360px) and an `<Outlet />` right column. Two new/renamed child routes
  nest under it via React Router's flat-routes dot-nesting:
  `app.activity.$conversationId.tsx` (renamed from
  `app.activity_.$conversationId.tsx` — dropped the trailing underscore so
  it nests instead of escaping nesting) now renders content-only (no
  `<s-page>`/`<s-section>`, just the message thread + reply form) for the
  right panel, and a new `app.activity._index.tsx` shows an empty state
  there when no conversation is selected. Only one 5s live-poll
  (`useRevalidator`) remains, in the parent — it revalidates the whole
  route tree including the active child, so the child route's own poll
  (redundant now that both panels are always mounted together) was removed.
  Verified nesting with `npx react-router routes`; `npm run
  typecheck`/`lint`/`build` all clean; a background Polaris-prop check
  found no issues.
- **AI pause on human takeover** (committed & pushed, `cb2b80d`). New
  `Conversation.aiPaused` column (migration `20261103130000_add_ai_paused`,
  applied), `app/conversation-handoff.server.ts` (`markHumanTookOver`)
  called from the admin reply action and `telegram.webhook.tsx` so the AI
  stops replying to a shopper once a human agent sends a message.
  `apps.chat-widget.chat.tsx` checks `aiPaused` and skips the Gemini call;
  `ai-chat-widget.js` drops the empty assistant bubble instead of showing a
  blank one. Admin conversation page shows an "AI replies paused" banner
  with a "Resume AI" button that clears the flag (never cleared
  automatically).
- **Admin Activity pages poll live** (part of the same commit above).
- Starting a chat can create a Shopify customer (opt-in, off by default —
  `WidgetSettings.syncCustomersToShopify`) and/or a Klaviyo profile (opt-in
  via connecting an API key). Both create-only, never update an existing
  match. Two rounds of background security review caught and got fixed
  same-session, before any unsafe version reached production — see
  [[changelog]] 2026-11-03 and ADR-0002 through ADR-0004 in
  [[decisions-log]]. New `app/shopify-customer-sync.server.ts` and
  `app/klaviyo.server.ts`, new "Customer sync" Settings-page card, new
  `write_customers` scope.
- Video timestamps on knowledge entries — see [[changelog]] 2026-08-25.
- Vault initialised.

## In progress

- The two-column Activity layout above is finished and verified
  (typecheck/lint/build clean, route nesting confirmed, Polaris props
  checked) but **not committed, not pushed**. No database/migration
  changes needed for it — it's routing/UI only.

## Next up

- Commit and push the two-column Activity layout.
- **Deploy the `shopify.app.dev.toml` config** — the `write_customers` scope
  change (and everything since) only went out for the prod config
  (`shopify app deploy --config ai-chat-app`, via `deploy-prod.yml` CI).
  The dev app/config has no CI step — still needs `npm run deploy --
  config dev` by hand.
- Fill the rest of the architecture/backend vault notes
  (`obsidian/architecture/*`, `obsidian/backend/*`) from the real codebase —
  still mostly unfilled `wip` templates from the vault scaffold.

## Blockers & open questions

- **No rate limiting on conversation creation.** Flagged by the second
  security review (ADR-0004) and deliberately not solved there: an opted-in
  shop's Shopify/Klaviyo sync could still be spammed by scripted requests
  using unique fake emails each time, creating junk records (and, for
  Klaviyo specifically, inflating the merchant's bill — Klaviyo prices by
  profile count). The free-plan monthly conversation cap
  (`countConversationsThisMonth`) only bounds this on free-plan shops; paid
  plans have unlimited conversations. Needs a real decision (a distributed
  rate limiter like Upstash is a new dependency) before treating this as
  closed.

## Environment

- **Run:** `npm run dev` (`shopify app dev` — local dev, tunnel, injects
  Shopify env vars, runs `prisma migrate deploy` first)
- **Deploy:** `git push` to `main` triggers Vercel (web app) + GitHub Actions
  (`shopify app deploy --config ai-chat-app`, prod Shopify config only); the
  dev app/config needs a manual deploy — see CLAUDE.md's "Deploying" section.
- **Known issues:** the dev-config scope deploy gap and the rate-limiting
  question above are the open items.
