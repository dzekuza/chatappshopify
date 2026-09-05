# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A Shopify embedded admin app (React Router v7) that lets a merchant configure an AI shopping-assistant chat widget, then embeds that widget on their storefront via a Theme App Extension. The AI is Google Gemini (via the Vercel `ai` SDK), with a tool that looks up real products through the Shopify Admin GraphQL API — it never invents products or prices.

Two independent runtimes ship from this one repo and are deployed separately:
- **The web app** (`app/`) — the embedded admin UI + backend API routes. Deployed to Vercel.
- **The theme extension** (`extensions/ai-chat-widget/`) — vanilla JS/CSS storefront widget. Deployed via `shopify app deploy` (bundled into an app version, installed into a theme by the merchant).

## Commands

```bash
npm run dev              # shopify app dev — local dev, tunnel, injects Shopify env vars, runs `prisma migrate deploy` first
npm run build             # react-router build
npm run typecheck         # react-router typegen && tsc --noEmit — run this after any route/schema change
npm run lint               # eslint --cache

git push                   # the normal way to ship — see "Deploying" below
npm run deploy -- --config <ai-chat-app|dev>   # manual shopify app deploy (config + theme extension only)
npx vercel deploy --prod   # manual web-app deploy; bypasses CI and ships your dirty working tree — avoid

npx prisma generate        # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name <name>   # create + apply a migration locally
npx prisma studio          # inspect the DB
```

No test suite exists in this repo currently.

### Deploying — `git push` does everything

A push to `main` triggers two independent pipelines, and together they cover both runtimes:

- **Vercel's GitHub integration** builds and deploys the web app. The Vercel project
  `ai-chat-widget` (see `.vercel/project.json`) is git-connected — no CLI step needed.
- **`.github/workflows/deploy-prod.yml`** runs typecheck → lint → build, then
  `shopify app deploy --config ai-chat-app`, pushing the prod config + theme extension.

So: commit, push, done — *for the production app*. The dev app is not fully covered;
see the two bullets below.

Things worth knowing:

- **The `ai-chat-widget-dev` Vercel project does NOT auto-deploy to production.** It is
  git-connected to this same repo, but its Production Branch isn't `main`, so a push
  produces a *preview* (`target: null`) and leaves `ai-chat-widget-dev.vercel.app` —
  which `shopify.app.dev.toml` points `application_url` at — on whatever commit was last
  pushed there by CLI. Every `target: "production"` deploy in that project's history came
  from a manual `vercel --prod`. Until someone sets Production Branch to `main` in that
  project's Git settings, shipping a change to the dev app (Orby Chat DEV, dev store
  ohubudemo) means a deliberate CLI deploy targeted at it. Target it *without* relinking
  — `.vercel/project.json` points at the prod project, and `vercel link` would overwrite it:

  ```
  VERCEL_ORG_ID=team_vz0VwiDg7l1Zy1SNy5BurmNv \
  VERCEL_PROJECT_ID=prj_WkLK6OPHeNktlkMS9dNszb4tKl5u \
  npx vercel deploy --prod
  ```

  Commit and push first so the working tree matches `main` — this ships the tree, not the
  commit, and that's the whole reason the rule below exists.
- **Don't run `npx vercel deploy --prod` as a matter of course.** It's redundant with the
  git integration and it deploys your *working tree*, dirty files included, skipping the
  CI gate entirely. Deployment history is littered with `gitDirty: "1"` deploys from agents
  doing exactly this. Reach for it only for a deliberate out-of-band push.
- **CI only deploys the prod Shopify config** (`--config ai-chat-app`). The dev app
  (`shopify.app.dev.toml`, Orby Chat DEV) has no CI step — deploy it by hand with
  `npm run deploy -- --config dev` when you change its config or the theme extension.
- **There is no `shopify.app.toml`** in this repo, only `shopify.app.ai-chat-app.toml` and
  `shopify.app.dev.toml`. Every `shopify app` command needs an explicit `--config`.
- **Both configs set `automatically_update_urls_on_dev = false`** on purpose: both apps are
  hosted (`ai-chat-widget-vert` / `ai-chat-widget-dev` on Vercel), so letting `shopify app dev`
  rewrite `application_url` to a tunnel breaks the hosted app the moment the tunnel dies.
  If you do flip it to run a tunnel, restore the file and re-run
  `npm run deploy -- --config <name>` afterwards to point the app back at Vercel.
- After changing `application_url`/`redirect_urls` in a config, Shopify only picks up the
  new URL on the next `shopify app deploy` for that config.

## Architecture

### Routing: React Router v7 flat file-routes

`app/routes.ts` uses `flatRoutes()` from `@react-router/fs-routes` — routes are inferred from filenames, not manually declared. Two gotchas that have already bitten this repo:

- **Dot-prefix nesting**: a file whose name is a dot-prefix of another (e.g. `app.activity.tsx` and `app.activity.$conversationId.tsx`) gets nested — the shorter one becomes a parent layout and needs an `<Outlet />`, or the child route silently never renders. Use a trailing underscore to opt out of nesting when you don't want a layout relationship (see `app.activity_.$conversationId.tsx`, which deliberately breaks nesting under `app.activity.tsx`).
- Run `npx react-router routes` any time route nesting behavior is unclear — don't guess from filenames alone.

### Two chat backends with different auth, same shape

- `app/routes/apps.chat-widget.chat.tsx` — the real storefront endpoint, hit by the theme extension via the app proxy (`authenticate.public.appProxy`). Persists conversations/messages to Postgres, enforces the name+contact gate before starting a conversation.
- `app/routes/app.chat-widget.preview.tsx` — an admin-only "test the widget" endpoint (`authenticate.admin`) used by the settings page's live preview. Same Gemini call + product-search tool, but takes `systemPrompt`/`geminiModel` straight from the in-progress (possibly unsaved) settings form, and never persists anything.

Keep these two in sync manually when changing the assistant's tool-calling behavior — there's no shared module between them by design (different auth strategies, different persistence needs).

### Admin UI: Polaris web components, not Tailwind/shadcn

Despite the global stack defaults, this app's admin (`app/routes/app*.tsx`) uses Shopify's Polaris **web components** (`<s-page>`, `<s-section>`, `<s-table>`, `<s-badge>`, etc. — global custom elements, no import needed) inside React Router, not Tailwind/shadcn. Key things learned the hard way in this repo:
- Custom-element props are typed via `@shopify/polaris-types` — check the actual typed props before assuming a prop like `className`/`onClick` exists on a given `s-*` element (many don't; e.g. `s-table-row` has no `onClick`, use `clickDelegate="<id-of-an-inner-link>"` instead).
- `s-box`/`s-badge` color/tone props use a fixed keyword set (`base`/`subdued`/`strong` for `s-box` background; `auto`/`info`/`success`/`caution`/`warning`/`critical` for `s-badge`/`s-text` tone; `s-text` uses `color="subdued"`, not `tone="subdued"`) — don't guess, `tsc --noEmit` will catch wrong values.
- `s-table` needs `listSlot` (`primary`/`inline`/`labeled`/`secondary`) on each `s-table-header` to render properly; without it every column falls back to an ugly stacked label/value layout.
- For back navigation, use `<s-link slot="breadcrumb-actions">` on `<s-page>` (renders as the standard Admin back-chevron) rather than an inline link in the page body.
- Custom CSS for these pages (e.g. the bubble/panel chat preview UI) lives in CSS Modules under `app/styles/` — **not** colocated in `app/routes/` as `<routename>.module.css`, because `@react-router/fs-routes` will try to parse a same-named `.module.css` file as a route module.
- Use the `shopify-plugin:*` skills / `mcp__shopify-dev-mcp__validate_component_codeblocks` (api: `polaris-app-home`) to validate generated Polaris web component JSX before shipping it — the type errors it catches (invalid prop, invalid keyword value) are easy to introduce.
- Any server-side `redirect()` between `/app*` routes must carry `new URL(request.url).searchParams` through. Shopify opens the app with `shop`/`host`/`embedded`/`id_token` on the URL, and the App Bridge script reads `shop`/`host` off the *document* URL — a bare-path redirect makes it throw `missing required configuration fields: shop` and makes `addDocumentResponseHeaders` skip the `frame-ancestors` CSP. This took down the whole admin once already.

### Storefront widget: vanilla JS/CSS, mirrors the admin preview's visual language deliberately

`extensions/ai-chat-widget/assets/ai-chat-widget.js` + `.css` render the actual bubble-launcher + expandable panel chat widget shoppers see, injected via `extensions/ai-chat-widget/blocks/chat_widget.liquid` (a theme app extension block, `target: "body"`). It's a self-contained IIFE with no build step or framework — string-built HTML, manual DOM event wiring. There is **no shared code** between this and the admin's React-based chat preview (`app/routes/app._index.tsx` + `app/styles/chat-widget-preview.module.css`); they're kept visually consistent by hand (same class-naming conventions, same header/empty-state/input-bar structure) rather than through a shared component.

### Database: Prisma → Supabase Postgres, isolated in its own schema

`prisma/schema.prisma` targets Postgres via `DATABASE_URL` (pooled, for runtime) and `DIRECT_URL` (direct, for migrations). All models are scoped to a dedicated `chat_widget` Postgres schema (`@@schema("chat_widget")` + `schemas = ["chat_widget"]` on the datasource) — **this Supabase project also hosts a separate, unrelated app's live data in the `public` schema.** Never write a migration or query that isn't schema-scoped to `chat_widget`; `public` is off-limits.

Models: `Session` (Shopify OAuth sessions, via `PrismaSessionStorage`), `WidgetSettings` (one row per shop — widget config), `Conversation` (one per storefront chat, with shopper contact info), `ChatMessage` (individual turns, linked by `conversationId` string, not a FK).

RLS is intentionally left disabled on these tables — access is exclusively via a direct Postgres connection through Prisma (never through Supabase's Data API/anon key), and `chat_widget` is not in this project's exposed Data API schemas.

### Telegram: the push channel, and a second front-end onto the agent reply

Shopify's mobile admin app has no notification for chat-widget conversations,
so a merchant otherwise only learns a shopper wanted them by opening the app.
Telegram fills that gap — and it deliberately adds **no new reply mechanism**.

The human-handoff loop already existed: the merchant's admin reply in
`app.activity_.$conversationId.tsx` writes a `ChatMessage` with `role: "agent"`,
and the storefront widget polls `apps.chat-widget.messages.tsx` for exactly
those. A Telegram reply writes the same row, so the shopper sees it with zero
widget changes. Keep it that way — don't give Telegram its own delivery path.

- **One shared bot serves every shop.** Merchants never touch @BotFather; they
  generate an `ORBY-XXXXXX` code in Settings and send it to the bot, and
  `telegram.webhook.tsx` records their `chatId`. All routing is chat-id-based.
- **`/telegram/webhook` is public and has no Shopify session.** Its *only*
  authentication is the `X-Telegram-Bot-Api-Secret-Token` header matching
  `TELEGRAM_WEBHOOK_SECRET`. It also re-checks that the replying chat is still
  the one linked to that shop, so a stale `TelegramMessageRef` can't write into
  another store's conversation.
- **It always returns 200.** Telegram retries any non-2xx indefinitely, so
  failures are reported back into the chat instead of failing the request.
- **Sends are fire-and-forget via `waitUntil`.** A Telegram outage must never
  fail a shopper's chat request. On Vercel a bare floating promise is killed
  when the response ends, hence `@vercel/functions`' `waitUntil` in
  `telegram.server.ts`.
- **Registering the webhook is a manual one-time step** per deployment — see
  the `setWebhook` curl in `.env.example`. Changing `SHOPIFY_APP_URL` means
  re-running it.
- Handoff alerts ignore the merchant's feed-scope setting: that notification is
  the whole point of the feature.

### AI tool-calling

Both chat routes use the same pattern: `streamText` from `ai` with a Google Gemini model, a `searchProducts` tool (Zod-validated input, queries `admin.graphql` for live product data), and `stopWhen: stepCountIs(4)`. The system prompt is merchant-configurable (`WidgetSettings.systemPrompt`) and explicitly instructs the model to never invent products/prices — keep that constraint when touching the prompt or tool.
