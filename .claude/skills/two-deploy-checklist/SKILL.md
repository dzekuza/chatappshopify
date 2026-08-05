---
name: two-deploy-checklist
description: Check which of the two independent deploy paths (Shopify app deploy vs Vercel) are needed for the current changes, and warn about the shopify.app.toml URL-overwrite gotcha before deploying.
disable-model-invocation: true
---

# Two-deploy checklist

This repo ships from one codebase but deploys in two independent halves that
are easy to forget to pair:

- `npm run deploy` (`shopify app deploy`) — pushes `shopify.app.toml` config
  and the theme extension (`extensions/ai-chat-widget/`). Does **not** touch
  the running web server.
- `npx vercel deploy --prod` — pushes the web app (`app/` routes/API). Does
  **not** register anything with Shopify.

Extra gotcha: `shopify.app.toml` has `automatically_update_urls_on_dev = true`,
so every `npm run dev` run overwrites `application_url`/`redirect_urls` back
to a local tunnel URL. If a dev session ran since the last `npm run deploy`,
production may be pointed at a dead tunnel until you redeploy.

## What to do

1. Run `git status` and `git diff --stat` (or check the diff for the current
   PR/branch) against these two buckets:
   - Shopify-side: `shopify.app.toml`, `shopify.web.toml`, `extensions/**`
   - Web-app side: `app/**`, `prisma/**`, other files outside `extensions/`
2. Check whether `shopify.app.toml`'s `application_url` / `redirect_urls`
   currently point at a `trycloudflare.com` (or other tunnel) URL rather than
   the production Vercel URL — that means a `npm run dev` session ran more
   recently than the last `npm run deploy`.
3. Report which command(s) are needed:
   - Only `app/**`/`prisma/**` changed → `npx vercel deploy --prod`
   - Only `shopify.app.toml`/`extensions/**` changed → `npm run deploy`
   - Both → both, Shopify deploy first if `application_url` also needs fixing
   - `application_url` currently a tunnel URL → run `npm run deploy` even if
     no other Shopify-side files changed, to point prod back at Vercel
4. Do not run any deploy command yourself — this skill only reports the
   checklist. Deploys are user-triggered.
