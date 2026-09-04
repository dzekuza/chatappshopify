# Component inventory

Two unrelated component systems are in play. Neither is Tailwind/shadcn,
despite that being this workspace's global default — see
[design.md](design.md) for why.

1. **Polaris web components** (`<s-*>`) — the admin UI. Global custom
   elements from `@shopify/polaris-types`, no import needed, typed props
   checked by `tsc` + validated against `mcp__shopify-dev-mcp__validate_component_codeblocks`
   (api: `polaris-app-home`).
2. **Native HTML** — the storefront widget (string-built, no framework) and
   a handful of spots inside the admin's React-based live preview where no
   Polaris equivalent exists (`<video>`, `<img>`, raw `<button>`/`<div>` for
   pixel-precise bubble/panel chrome).

No third-party UI library (no shadcn, no Radix, no MUI, no Tailwind classes)
is used anywhere in this repo.

---

## Polaris web components used, by route

| Component | `app._index` (Home) | `app.settings` | `app.knowledge` | `app.activity` | `app.activity_.$id` | `app.plans` | `app.tsx` (nav) |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `s-page` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-section` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-app-nav` | | | | | | | ✅ |
| `s-link` | | ✅ | ✅ | ✅ | ✅ | | ✅ |
| `s-button` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-button-group` | ✅ | | | ✅ | | | |
| `s-stack` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-grid` | ✅ | | ✅ | ✅ | | ✅ | |
| `s-box` | ✅ | | | | ✅ | ✅ | |
| `s-divider` | ✅ | | | ✅ | | | |
| `s-heading` | ✅ | | ✅ | ✅ | | ✅ | |
| `s-text` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-paragraph` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| `s-badge` | ✅ | | ✅ | ✅ | ✅ | ✅ | |
| `s-banner` | ✅ | | | | ✅ | | |
| `s-checkbox` | ✅ | | | | | | |
| `s-clickable` | ✅ | | ✅ | | | | |
| `s-clickable-chip` | | (via `KnowledgeSyncSection`) | | | | | |
| `s-image` | | | ✅ | | ✅ | | |
| `s-thumbnail` | | | ✅ | | | | |
| `s-table` / `s-table-header-row` / `s-table-header` / `s-table-body` / `s-table-row` / `s-table-cell` | | | ✅ | ✅ | | | |
| `s-modal` | | | ✅ | | | | |
| `s-text-field` | | (via section components) | ✅ | | | | |
| `s-text-area` | | (via section components) | ✅ | | ✅ | | |
| `s-select` / `s-option` | | (via section components) | | | | | |
| `s-unordered-list` / `s-list-item` | | | | | | ✅ | |

### Extracted settings components (`app/components/settings/*.tsx`)

| Component | `s-*` elements used |
|---|---|
| `widget-section.tsx` | `s-section`, `s-stack`, `s-switch`, `s-text-field`, `s-text-area` |
| `appearance-section.tsx` | `s-section`, `s-stack`, `s-color-field`, `s-thumbnail`, `s-drop-zone`, `s-select`, `s-option`, `s-text-field`, `s-text`, `s-paragraph`, `s-button`, `s-divider` |
| `ai-model-section.tsx` | `s-section`, `s-stack`, `s-select`, `s-option`, `s-text-field`, `s-banner`, `s-button`, `s-paragraph` |
| `knowledge-sync-section.tsx` | `s-section`, `s-stack`, `s-button`, `s-clickable-chip`, `s-paragraph` |
| `chat-preview.tsx` | `s-stack`, `s-text`, `s-paragraph` (the bubble/panel chrome itself is native HTML — see below; this file renders inside `AppearanceSection`'s `preview` slot, not as its own `<s-section>`) |

### Full alphabetical list (33 distinct tags in use)

`s-app-nav`, `s-badge`, `s-banner`, `s-box`, `s-button`, `s-button-group`,
`s-checkbox`, `s-clickable`, `s-clickable-chip`, `s-color-field`,
`s-divider`, `s-drop-zone`, `s-grid`, `s-heading`, `s-image`, `s-link`,
`s-list-item`, `s-modal`, `s-option`, `s-page`, `s-paragraph`, `s-section`,
`s-select`, `s-stack`, `s-switch`, `s-table`, `s-table-body`, `s-table-cell`,
`s-table-header`, `s-table-header-row`, `s-table-row`, `s-text`,
`s-text-area`, `s-text-field`, `s-thumbnail`, `s-unordered-list`

Not currently used anywhere in this app (available but unneeded so far):
`s-avatar`, `s-chip`, `s-choice-list`, `s-date-field`, `s-date-picker`,
`s-email-field`, `s-icon`, `s-menu`, `s-money-field`, `s-number-field`,
`s-password-field`, `s-progress-indicator`, `s-search-field`, `s-spinner`,
`s-tooltip`, `s-url-field`.

---

## Common prop conventions (so new code matches existing code)

- **Slots** (`slot="primary-action"`, `slot="secondary-actions"`,
  `slot="breadcrumb-actions"`, `slot="aside"`) only take effect on **direct
  children of `<s-page>`** — never nest them inside a `<form>` or wrapper
  `<div>`.
- **`variant`** on `<s-button>`: `primary` (main CTA, one per section/page),
  `secondary` (default, most buttons), `tertiary` (icon-only or low-emphasis
  inline actions like "Remove icon" / "Change product").
- **`icon`** props are rarely used — the only current instance is
  `icon="delete"` on the knowledge-entry delete action. Prefer text labels
  over icon-only buttons unless space is genuinely tight.
- **`clickDelegate`** on `<s-table-row>` — always paired with an `id` on an
  inner `<s-link>`, since `<s-table-row>` itself has no `onClick`.
- **`listSlot`** on every `<s-table-header>` — required, or the column
  renders as a stacked label/value pair instead of a real column.

---

## Native HTML elements (outside Polaris's reach)

### `app/components/settings/chat-preview.tsx` (admin, React)

Renders the bubble/panel chrome as raw HTML + a CSS Module
(`app/styles/chat-widget-preview.module.css`) because it has to visually
match the storefront widget pixel-for-pixel, which Polaris components can't
do:

| Element | Count | Purpose |
|---|---|---|
| `<div>` | 12 | Stage / panel / header / message-list / input-bar layout |
| `<svg>` | 6 | Inline icons (refresh, plus, arrow-up, close, empty-state, bubble default) |
| `<p>` | 6 | Header title/subtitle, footer disclaimer, message paragraphs |
| `<button>` | 5 | Launcher bubble, reset, close, attach (disabled), send |
| `<img>` | 2 | Custom launcher icon, message-embedded image previews |
| `<video>` | 2 | Message-embedded video previews (in the live preview and, separately, on the Activity conversation-detail page) |
| `<form>` | 1 | Preview message composer |

### `app/routes/app.activity_.$conversationId.tsx` (admin, React)

Same reasoning, narrower scope: a message whose text embeds a Shopify CDN
media URL (from a `KnowledgeEntry.mediaUrl` the AI echoed back) renders an
actual `<s-image>` (wrapped in `<s-box maxInlineSize>` since `s-image` itself
has no pixel-size prop) for images, or a raw `<video controls width={240}>`
for video — Polaris has no video component, so this is the one deliberate
`video` tag inside an otherwise all-Polaris route.

### `extensions/ai-chat-widget/assets/*` (storefront, vanilla)

Everything — this runs on the merchant's storefront, outside the Shopify
admin, so no Polaris components exist there at all. HTML is string-built in
`ai-chat-widget.js` (`bubble`, `panel`, `header`, `gate` form, `messages`
list, `input` form) and styled by `ai-chat-widget.css` (34 `aicw-*` prefixed
classes, no build step, no preprocessor).
