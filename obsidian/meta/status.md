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

`<s-scroll-box>` itself turned out unreliable, not just `<s-table>` inside
it — second live screenshot showed the reply composer overlapping message
bubbles because the scroll-box wrapping the (already-fixed) plain message
list still wasn't clipping its content. Both Activity scroll regions now use
plain CSS instead. Uncommitted, see "In progress".

## Done recently

- **`<s-scroll-box>` replaced with plain CSS overflow divs, everywhere in
  Activity (uncommitted).** First fix (table → `<s-stack>` of rows, see
  below) still left `<s-scroll-box maxBlockSize="...">` in place as the
  outer scroll container for both the conversation list and the message
  thread — and it *still* didn't clip/scroll correctly: a live screenshot
  showed the reply `<Form>` (a sibling right after the scroll-box in the
  DOM) visually overlapping earlier message bubbles, meaning the scroll
  box's children were painting past its assigned height instead of being
  clipped. Same failure mode as the table, just one layer deeper. Both
  scroll regions in `app/routes/app.activity.tsx` and
  `app.activity.$conversationId.tsx` now use a plain `<div>` with real CSS
  `overflow-y: auto` + `max-height` (`.scrollRegionList` 640px /
  `.scrollRegionThread` 480px in the renamed
  `app/styles/activity.module.css`, formerly
  `activity-conversation-list.module.css`) instead of trusting the Polaris
  component. Each div carries `role="region"` + `aria-label` +
  `tabIndex={0}` (WAI-ARIA's scrollable-region pattern — needed so keyboard
  users can actually focus/scroll the region, since `<s-scroll-box>`
  apparently handled that internally and jsx-a11y's default
  `no-noninteractive-tabindex` role allowlist doesn't include `"region"`, so
  both spots carry a narrow, commented `eslint-disable-next-line` for it —
  a widget-parity-style review flagged the missing tabIndex before this was
  added). Invoked via the `polaris-ui-expert` skill, which also confirmed
  the diagnosis and that mixing plain HTML containers into the Polaris tree
  is already an established pattern in both these files (`<Form>`,
  `<Outlet />`, the `<a>` row from the first fix).
- **Activity conversation list no longer uses `<s-table>`** (committed &
  pushed, `03d0240`). `<s-scroll-box maxBlockSize="640px">` wrapping
  `<s-table>` never actually constrained/scrolled it — the list just grew
  and the whole admin page scrolled past it (seen live, screenshot).
  `TableProps$1` has no `overflow`/size props at all (it's designed for
  pagination, not ancestor-constrained scrolling — confirmed via
  @shopify/polaris-types). Replaced with a plain `<s-stack>` of rows, each
  a real `<a>` (not `<s-link>`, which has no block/card layout props).
- **AI sends a short holding reply once a human's been requested**
  (committed & pushed, `5149708`). New `NEEDS_HUMAN_HOLDING_MESSAGE` constant +
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

- The `<s-scroll-box>` → plain-div fix above is finished and verified
  (typecheck/lint/build clean, confirmed via the `polaris-ui-expert` skill +
  a Polaris-prop review) but **not committed, not pushed**. No
  database/migration changes needed.

## Next up

- Commit and push the scroll-box fix, then have ohubo re-test the whole
  handoff flow (and the Activity page's scrolling specifically — it's been
  visibly broken through two prior attempts) now that everything's live.
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
