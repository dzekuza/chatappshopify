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

npm run deploy             # shopify app deploy — pushes shopify.app.toml config + the theme extension as a new app version
npx vercel deploy --prod   # deploys the web app itself (admin routes, API routes) — separate from `npm run deploy`

npx prisma generate        # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name <name>   # create + apply a migration locally
npx prisma studio          # inspect the DB
```

No test suite exists in this repo currently.

### Deploying — two separate pushes, easy to forget one

- `npm run deploy` (`shopify app deploy`) only pushes `shopify.app.toml` config and the theme extension. It does **not** touch the running web server.
- `npx vercel deploy --prod` only pushes the web app. It does **not** register anything with Shopify.
- After changing `application_url`/`redirect_urls` in `shopify.app.toml`, you must run `npm run deploy` again for Shopify to pick up the new URL.
- `shopify.app.toml` has `automatically_update_urls_on_dev = true`, so every `npm run dev` run overwrites `application_url`/`redirect_urls` back to a local dev tunnel URL. Re-run `npm run deploy` after a dev session if you want production pointed at Vercel again.

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

### Storefront widget: vanilla JS/CSS, mirrors the admin preview's visual language deliberately

`extensions/ai-chat-widget/assets/ai-chat-widget.js` + `.css` render the actual bubble-launcher + expandable panel chat widget shoppers see, injected via `extensions/ai-chat-widget/blocks/chat_widget.liquid` (a theme app extension block, `target: "body"`). It's a self-contained IIFE with no build step or framework — string-built HTML, manual DOM event wiring. There is **no shared code** between this and the admin's React-based chat preview (`app/routes/app._index.tsx` + `app/styles/chat-widget-preview.module.css`); they're kept visually consistent by hand (same class-naming conventions, same header/empty-state/input-bar structure) rather than through a shared component.

### Database: Prisma → Supabase Postgres, isolated in its own schema

`prisma/schema.prisma` targets Postgres via `DATABASE_URL` (pooled, for runtime) and `DIRECT_URL` (direct, for migrations). All models are scoped to a dedicated `chat_widget` Postgres schema (`@@schema("chat_widget")` + `schemas = ["chat_widget"]` on the datasource) — **this Supabase project also hosts a separate, unrelated app's live data in the `public` schema.** Never write a migration or query that isn't schema-scoped to `chat_widget`; `public` is off-limits.

Models: `Session` (Shopify OAuth sessions, via `PrismaSessionStorage`), `WidgetSettings` (one row per shop — widget config), `Conversation` (one per storefront chat, with shopper contact info), `ChatMessage` (individual turns, linked by `conversationId` string, not a FK).

RLS is intentionally left disabled on these tables — access is exclusively via a direct Postgres connection through Prisma (never through Supabase's Data API/anon key), and `chat_widget` is not in this project's exposed Data API schemas.

### AI tool-calling

Both chat routes use the same pattern: `streamText` from `ai` with a Google Gemini model, a `searchProducts` tool (Zod-validated input, queries `admin.graphql` for live product data), and `stopWhen: stepCountIs(4)`. The system prompt is merchant-configurable (`WidgetSettings.systemPrompt`) and explicitly instructs the model to never invent products/prices — keep that constraint when touching the prompt or tool.
