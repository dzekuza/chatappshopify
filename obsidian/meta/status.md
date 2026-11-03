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

Two small admin/chat UX fixes this session, both uncommitted:
1. Admin Activity pages now poll (5s) instead of only loading once.
2. The AI now pauses for a conversation once a human agent replies (admin or
   Telegram), until the merchant explicitly resumes it.

## Done recently

- **AI pause on human takeover.** New `Conversation.aiPaused` column
  (migration `20261103130000_add_ai_paused`, schema updated, `prisma
  generate` run — **migration not yet applied to the dev database**, since
  `prisma migrate deploy`/`dev` are blocked by this session's permission
  classifier; run `npx prisma migrate deploy` by hand before relying on the
  column). New `app/conversation-handoff.server.ts` (`markHumanTookOver`)
  called from both `app.activity_.$conversationId.tsx`'s reply action and
  `telegram.webhook.tsx`'s reply handler — sets `aiPaused: true` and clears
  `needsHuman`. `apps.chat-widget.chat.tsx` checks `aiPaused` right after
  persisting the shopper's message and returns an empty reply (AI model
  never called) instead of answering. The storefront widget
  (`ai-chat-widget.js`) now removes the empty assistant bubble instead of
  leaving a blank one when that happens. The admin conversation page shows
  an "AI replies paused" banner with a "Resume AI" button
  (`intent=resumeAi` form action) that clears the flag — it's never cleared
  automatically.
- **Admin Activity pages now poll.** Neither `app/routes/app.activity.tsx`
  nor `app.activity_.$conversationId.tsx` ever re-fetched after the initial
  load, so a merchant watching a conversation didn't see new shopper/Telegram
  messages without a manual refresh. Both now poll via `useRevalidator`
  every 5s (same cadence as the storefront widget's own poll), paused while
  idle-submitting or navigating.
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

- Nothing left mid-change in code. `npm run typecheck` and `npm run lint`
  are both clean for the AI-pause + admin-polling work above. **Not
  committed, not pushed.** The new migration has not been applied to any
  database yet — do that before deploying, or the `aiPaused` column won't
  exist and the Prisma calls that read/write it will fail at runtime.

## Next up

- Apply migration `20261103130000_add_ai_paused` (`npx prisma migrate
  deploy`) and commit the AI-pause + admin-polling changes.
- **Deploy the `shopify.app.dev.toml` config** — the `write_customers` scope
  change only went out for the prod config
  (`shopify app deploy --config ai-chat-app`, via `deploy-prod.yml` CI,
  which ran successfully on this push). The dev app/config has no CI step —
  still needs `npm run deploy -- --config dev` by hand.
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
- **Known issues:** the `aiPaused` migration above is written but unapplied;
  the dev-config scope deploy gap and the rate-limiting question above are
  otherwise the open items.
