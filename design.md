# Design system

This app has **two independent visual surfaces** that share no code and are kept
in sync by hand:

1. **Admin UI** (`app/routes/app*.tsx`, `app/components/settings/*`) — rendered
   inside the Shopify admin iframe using Shopify's **Polaris web components**
   (`<s-page>`, `<s-section>`, `<s-badge>`, …). This is *not* Tailwind/shadcn,
   despite that being the global default stack for other projects — see
   [components.md](components.md) for the full inventory.
2. **Storefront widget** (`extensions/ai-chat-widget/assets/*`) — a
   vanilla JS/CSS chat bubble + panel injected into the merchant's theme via a
   Theme App Extension block. No framework, no build step.

The admin's live "Live preview" panel (`app/components/settings/chat-preview.tsx`)
is a third, React-based re-implementation that visually mirrors the storefront
widget as closely as possible, using a CSS Module
(`app/styles/chat-widget-preview.module.css`) rather than Polaris components,
because it has to render the widget's actual bubble/panel chrome, not admin
chrome.

---

## Admin UI (Polaris web components)

### Spacing scale

Only two spacing families are used in practice — Polaris's `small-*` step
scale and the semantic `base`/`large` keywords. Observed usage across the
codebase, most → least common:

| Token | Used for |
|---|---|
| `gap="base"` | Default gap between fields inside a section; gap between unrelated groups |
| `gap="small-200"` | Tight gaps: list-item-to-list-item, chip rows, icon+label rows |
| `gap="small-300"` | Gaps inside a metrics-card cell (heading → value) |
| `gap="small"` | Divider-separated metric grids |
| `gap="small-400"` | Title → description gap inside a setup-guide step |
| `gap="large"` | Gap between whole `<s-section>` blocks when they're wrapped in a `<form>` (see below) |

**Rule of thumb**: the *outer* container between big structural blocks gets
`base` or `large`; the *inner* gap between two tightly-related pieces of text
(a title and its one-line description, a checkbox and its label) gets a
`small-*` step. When two nested stacks sit next to each other, deliberately
alternate — e.g. the setup-guide step row is
`gap="small-200"` (checkbox↔label, tight) containing
`gap="small-400"` (title↔description, looser) — so the checkbox reads as
glued to its label while the title and description still breathe.

Padding: sections default to no explicit padding. `padding="none"` is used on
an `<s-section>` that wraps a `<s-table>` directly (no heading, table fills
the card edge-to-edge) — see `app.knowledge.tsx` and `app.activity.tsx`.
`padding="base"` is used on `<s-box>` cards (setup-guide step cards, plan
cards, message bubbles on the conversation detail page).

### Color / tone

Admin components never take raw hex values — only Polaris's keyword sets:

- **`tone`** (badges, banners, buttons): `info`, `success`, `warning`,
  `critical`, `neutral`, `auto`. `critical` is reserved for "Sale" /
  "needs attention" / destructive-action signals; `success` for "current
  plan" / completed states; `info` for the AI/assistant role badge and
  neutral informational badges.
- **`color`** (text): `subdued` is the only value used, for secondary/
  supporting text under a heading or next to a primary value. Never use
  `tone` on `<s-text>` for this — Polaris's own inconsistency is that
  `<s-text>` takes `color`, while `<s-badge>`/`<s-banner>` take `tone`.
- **Brand color** is the one place a merchant-controlled raw hex value
  flows through the system: `WidgetSettings.primaryColor` (default
  `#1a1a1a`). It's surfaced via Polaris's `<s-color-field>` in the admin
  form, then threaded as a CSS custom property (`--aicw-color` /
  `--aicw-preview-color`) into the storefront widget and the live preview —
  never hardcoded, never applied via Polaris's own tone system (Polaris has
  no concept of a merchant-chosen brand color).

### Structural patterns

- **Page template**: `<s-page heading="...">` with `<s-button slot="primary-action">`
  / `<s-button slot="secondary-actions">` for the title-bar actions (rendered
  by Shopify's native TitleBar, not inline in the iframe — see note below),
  `<s-link slot="breadcrumb-actions">` for back-navigation, and
  `<s-section slot="aside">` for a sidebar card. All of these slot props only
  work on **direct children of `<s-page>`** — a wrapping `<form>` or `<div>`
  silently breaks slot assignment. This bit us once (see
  `app.settings.tsx`'s `slot="aside"` comment) and is the reason the settings
  form explicitly re-adds spacing (`<s-stack gap="large">`) instead of relying
  on `<s-page>`'s automatic section-to-section spacing, which likewise only
  applies to direct `<s-section>` children.
- **Save bar**: the settings form uses `<form data-save-bar onSubmit onReset>`
  wrapping every trackable field, instead of a manual header Save button —
  App Bridge shows/hides the save/discard bar automatically based on form
  dirty state.
- **Setup guide** composition: `<s-heading>` + completion `<s-badge>`, then a
  list of `<s-box>` step cards, each with a disabled `<s-checkbox>` reflecting
  real computed state (never a stored "dismissed" flag), a title/description
  text stack, and an action `<s-button>`.
- **Metrics card** composition: `<s-grid>` with a container-query
  `gridTemplateColumns` (`@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr`)
  so it collapses to one column on narrow admin panes, cells built from
  `<s-heading>` (label) + `<s-text>` (value) + optional trend `<s-badge>`,
  separated by `<s-divider direction="block">` (a *vertical* rule between
  *horizontally* arranged cells — the divider's `direction` is the opposite
  of the stack's own direction).
- **Empty state** composition: centered `<s-grid gap="base" justifyItems="center">`
  with a heading, one line of explanation, and a primary (+ optional
  secondary) action button — used on Knowledge and Activity when there's no
  data yet.
- **Index table**: `<s-table>` with `listSlot` (`primary`/`secondary`/`inline`/
  `labeled`) set on every `<s-table-header>` — omitting it makes every column
  fall back to a stacked label/value layout instead of a real column.
  `<s-table-row clickDelegate="<id>">` pointing at an inner `<s-link id="...">`
  is how whole-row-click works (`<s-table-row>` has no `onClick`).

### Reusable CSS custom properties (theming bridge)

Both the admin's live preview and the real storefront widget read the same
three variable names, just under different prefixes:

| Storefront (`--aicw-*`) | Admin preview (`--aicw-preview-*`) | Meaning |
|---|---|---|
| `--aicw-color` | `--aicw-preview-color` | Brand color (`WidgetSettings.primaryColor`) |
| `--aicw-color-contrast` | `--aicw-preview-color-contrast` | Auto-computed black/white text color for readability on the brand color (luminance-based, see `contrastColor()` in both `ai-chat-widget.js` and `chat-preview.tsx`) |
| `--aicw-radius` | `--aicw-preview-radius` | `20px` (rounded, default) or `8px` (square) — `WidgetSettings.cornerStyle` |

These are the **only** place `style={{ ... }}` is used in the admin code —
as an exception to the "no inline styles" rule, for CSS custom-property
theming that can't be expressed as a static Tailwind/Polaris class because
the value is merchant-controlled at runtime. Everything else uses Polaris
props or CSS Modules.

---

## Storefront widget (vanilla CSS)

`extensions/ai-chat-widget/assets/ai-chat-widget.css` — plain class-based CSS,
`aicw-` prefixed, no build step, no CSS Modules (can't use them outside the
Vite/React app). Key values:

- Launcher bubble: 56×56px circle (`border-radius: 999px`), uploaded icon
  fills 44×44px of it (`~6px` margin), default SVG icon is 26×26px.
- Panel: 360px wide (`max-width: calc(100vw - 32px)`), 500px tall, corner
  radius driven by `--aicw-radius`.
- Font: inherits `var(--aicw-font-family)` — not currently exposed as a
  merchant setting.

## Admin live preview (CSS Module)

`app/styles/chat-widget-preview.module.css` mirrors the storefront values by
hand (56×56 bubble / 44×44 icon / 20px-or-8px panel radius) — check this file
whenever a storefront CSS value changes, and vice versa. See
`widget-parity-reviewer` guidance in `CLAUDE.md` for the sync convention.
