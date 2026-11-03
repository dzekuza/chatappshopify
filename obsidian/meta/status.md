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

No single active workstream — most recent work is the chat-start-to-CRM sync
feature below (shipped to main and the prod Shopify config; dev config still
needs its own manual deploy).

## Done recently

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

- Nothing left mid-change in code. `npm run typecheck`, `npm run lint`, and
  `npm run build` are all clean. Committed (`a828464` + a follow-up commit
  for the ADR-0004 fixes) and pushed to `main`.

## Next up

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
- **Known issues:** none tracked separately; see [[changelog]] for recent
  fixes. The dev-config scope deploy gap and the rate-limiting question
  above are the two open items.
