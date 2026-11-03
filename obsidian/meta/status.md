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

Two fixes ready to commit together: the Activity conversation list didn't
actually scroll internally in production, and a real client's (ohubo)
human-handoff QA feedback led to one AI-behavior fix. See "In progress".

## Done recently

- **Activity conversation list no longer uses `<s-table>` (uncommitted).**
  `<s-scroll-box maxBlockSize="640px">` wrapping `<s-table>` never actually
  constrained/scrolled it — the list just grew and the whole admin page
  scrolled past it (seen live, screenshot). `TableProps$1` has no
  `overflow`/size props at all (it's designed for pagination, not
  ancestor-constrained scrolling — confirmed via @shopify/polaris-types), so
  wrapping it in a scroll box was never going to work. Replaced with a plain
  `<s-stack>` of rows, each a real `<a>` (not `<s-link>`, which has no
  block/card layout props) styled via a new
  `app/styles/activity-conversation-list.module.css` (`all: unset` reset +
  focus-visible outline). A Polaris-prop review confirmed the new markup is
  clean and the diagnosis holds.
- **AI sends a short holding reply once a human's been requested
  (uncommitted).** New `NEEDS_HUMAN_HOLDING_MESSAGE` constant +
  early-return branch in `apps.chat-widget.chat.tsx`, right after the
  `aiPaused` check: once `conversationRecord.needsHuman` is true (shopper
  asked for a human on an *earlier* turn) and no one's joined yet
  (`aiPaused` still false), every further message gets the same short
  "I've flagged this for our team…" reply instead of a full AI turn with
  tool calls — the turn that actually *requests* the handoff still gets a
  full reply, since `conversationRecord` reflects pre-turn state.
  `HANDOFF_TOOL_INSTRUCTION` reworded to stop telling the model to promise
  ongoing full help it won't actually give. Requested by ohubo after
  confusingly getting full AI answers each time while waiting for a reply.
  Part of a wider QA pass on the handoff flow — see [[session-log]] for the
  full item-by-item verdict (most of ohubo's other reports turned out to be
  them testing in a ~15-minute window before that day's deploys had gone
  live; items 4 (email fallback) and 5 (plan gating) were answered without
  needing a code change).
- **Storefront widget: handoff status UI** (committed & pushed, `1692c6e`).
  When the AI calls `requestHumanHandoff`, the widget shows a "Connecting
  you with a team member…" loader immediately (a flag-only `AICW_HANDOFF`
  sentinel on the reply stream), then switches to a green "A team member
  has joined" badge once `aiPaused` is confirmed true via the existing
  `apps.chat-widget.messages.tsx` poll (which now also returns
  `needsHuman`/`aiPaused`, so the status resyncs correctly across a page
  reload). New `renderHandoffStatus()` + `.aicw-handoff-status` in
  `ai-chat-widget.js`/`.css`. Admin preview deliberately untouched — it has
  no persisted Conversation row, so there's no handoff state for it to show.
- **Activity is now a two-column single page** (committed & pushed,
  `244de74`). `app/routes/app.activity.tsx` is a layout route: left column
  (conversation list) + `<Outlet />` right column. `app.activity_.$conversationId.tsx` → `app.activity.$conversationId.tsx`
  (dropped the trailing underscore so it nests per React Router's
  flat-routes convention) now renders content-only for the right panel; a
  new `app.activity._index.tsx` covers the empty state when nothing's
  selected. One 5s live-poll in the parent covers both panels.
- **AI pause on human takeover** (committed & pushed, `cb2b80d`). New
  `Conversation.aiPaused` column, `app/conversation-handoff.server.ts`
  (`markHumanTookOver`) called from the admin reply action and
  `telegram.webhook.tsx` so the AI stops replying once a human agent sends
  a message. Admin conversation page shows an "AI replies paused" banner
  with a "Resume AI" button (never cleared automatically). Admin Activity
  pages also started polling live in this same commit.
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

- The list-scroll fix and the holding-reply fix above are both finished and
  verified (typecheck/lint/build clean, Polaris-prop reviews on both) but
  **not committed, not pushed**. No database/migration changes needed for
  either.

## Next up

- Commit and push both fixes, then have ohubo re-test the whole handoff
  flow now that every piece (AI pause, status badge, holding reply, list
  scrolling) is actually live.
- **Email fallback for shoppers who've left the site before an agent
  replies** (ohubo asked for this) — there's no email-sending
  infrastructure anywhere in this repo at all. This would be a new feature
  (provider, sending domain, template, send-timing logic) on the scale of
  the Telegram integration, not a quick fix. Needs a real scoping decision
  before starting.
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
- **Known issues:** the dev-config scope deploy gap, the rate-limiting
  question above, and the missing email-fallback feature are the open items.
