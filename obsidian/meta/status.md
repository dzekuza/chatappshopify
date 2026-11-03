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
feature below (code complete, not yet deployed).

## Done recently

- Starting a chat now creates a Shopify customer, and a Klaviyo profile if
  the shop has connected a key — create-only, never updates an existing
  match (a same-session security review caught the first version silently
  overwriting an existing customer's/profile's name+phone on an
  unauthenticated email match) — see [[changelog]] 2026-11-03, ADR-0002 and
  ADR-0003 in [[decisions-log]]. New `app/shopify-customer-sync.server.ts`
  and `app/klaviyo.server.ts`, new `WidgetSettings.klaviyoApiKey` field +
  Settings-page section, new `write_customers` scope.
- Video timestamps on knowledge entries — see [[changelog]] 2026-08-25.
- Vault initialised.

## In progress

- Nothing left mid-change in code. `npm run typecheck`, `npm run lint`, and
  `npm run build` are all clean for the chat-sync feature above.

## Next up

- **Deploy the scope change** — `write_customers` was added to both
  `shopify.app.ai-chat-app.toml` and `shopify.app.dev.toml` but not pushed.
  Until `shopify app deploy` runs for both configs (and existing merchants
  re-approve the new scope via Shopify's standard reconsent flow), the
  Shopify-customer half of the sync will fail silently in the background
  (swallowed by `background()`'s catch) — nothing shopper-facing breaks, but
  no customers get created until this ships.
- Fill the rest of the architecture/backend vault notes
  (`obsidian/architecture/*`, `obsidian/backend/*`) from the real codebase —
  still mostly unfilled `wip` templates from the vault scaffold.

## Blockers & open questions

- Whether a merchant should be able to opt out of the automatic Shopify
  customer sync (no toggle exists today — see ADR-0002's consequences).

## Environment

- **Run:** `npm run dev` (`shopify app dev` — local dev, tunnel, injects
  Shopify env vars, runs `prisma migrate deploy` first)
- **Deploy:** `git push` to `main` triggers Vercel (web app) + GitHub Actions
  (`shopify app deploy --config ai-chat-app`, prod Shopify config only); the
  dev app/config needs a manual deploy — see CLAUDE.md's "Deploying" section.
- **Known issues:** none tracked separately; see [[changelog]] for recent
  fixes. The `write_customers` scope deploy gap above is the one open item.
