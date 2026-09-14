# Proactive messages (in-widget automations)

Merchant-configured rules that let the widget open a conversation itself, based
on what the shopper is doing on the page.

**Guiding constraint:** every trigger is evaluated client-side from signals the
widget can already see. No new access scopes, no Shopify webhooks, no
scheduler, no email or SMS. That is what makes this shippable without turning
Orby into a marketing app.

## Why not the Shopify marketing-automation templates

The obvious reference point is Shopify's marketing automation library
(abandoned cart, welcome series, post-purchase, win-back, birthday). Those are
**email/SMS lifecycle campaigns**, and rebuilding them here would require:

- a scheduler — every one of them is time-delayed ("10 hours after", "14 days
  after", "60 days"); this repo has no `vercel.json` and no cron route
- an email/SMS provider — there is none in `package.json`
- commerce webhooks — only `app/uninstalled`, `app/scopes_update` and the three
  GDPR topics are registered
- scopes we don't hold — current scopes are
  `read_files,write_files,read_orders,read_products`, and abandoned-checkout
  data is Shopify protected customer data requiring approval

There is also a consent problem. The contact gate collects
`Conversation.customerEmail` / `customerPhone` **for support**, so the merchant
can reply. Using those addresses for automated marketing is a different legal
basis (GDPR / CAN-SPAM) and an App Store review risk. If outbound messaging
ever ships, consent must be captured explicitly at the gate — never inferred
from a support conversation.

Proactive in-widget messages sidestep all of it: the shopper is on the page,
right now, and nothing is sent anywhere.

## Data model

Rules live as JSON on the settings row rather than in their own table, so the
settings fetch that runs on **every storefront page load** costs no extra
query. Same reasoning as `knowledgeCollections` and `storefrontOrigins`. A
dedicated table only earns its keep once per-rule impression stats exist.

```prisma
// WidgetSettings
proactiveEnabled  Boolean  @default(false)
proactiveRules    Json     @default("[]")

// Conversation
proactiveRuleId   String?
```

`proactiveEnabled` defaults to **false**: an existing shop must opt in before
anything is shown to its shoppers. `Conversation.proactiveRuleId` is the
attribution channel — null means the shopper started the chat themselves, which
is how the merchant tells an earned conversation from a prompted one.

Types and the tolerant parser live in `app/proactive.ts`.

```ts
type ProactiveRule = {
  id: string;                    // stable — used for frequency capping
  enabled: boolean;
  priority: number;              // highest wins when several rules match
  trigger:
    | { type: "time_on_page"; seconds: number }
    | { type: "exit_intent" }
    | { type: "scroll_depth"; percent: number }
    | { type: "return_visit"; minVisits: number }
    | { type: "cart_value"; minSubtotal: number }
    | { type: "cart_idle"; seconds: number };
  audience: { pages: "any" | "home" | "product" | "collection" | "cart"; handles: string[] };
  message: string;
  frequency: "once_per_session" | "once_per_day" | "once_ever";
};
```

Parsing is deliberately tolerant: it reads data that has already been written,
and one malformed rule must never take the storefront widget down with it.
Unparseable entries are dropped rather than thrown on. Validation of *incoming*
merchant input belongs in the settings action, where an error can be shown.

Caps: `MAX_PROACTIVE_RULES = 10`, `MAX_PROACTIVE_MESSAGE_LENGTH = 200`.

## Headless caveat

`/cart.js` is an Online Store endpoint. A Hydrogen/custom storefront (see
`headless-embed.server.ts`) has no equivalent the widget can read, so
`cart_value` and `cart_idle` can never fire there. `ONLINE_STORE_ONLY_TRIGGERS`
names them; the admin UI must disable those options when `storefrontOrigins` is
non-empty, rather than offering a rule that silently does nothing.

## Behaviour — the part that decides whether this is good or obnoxious

The teaser is a **peek attached to the bubble**, not a fake assistant message
inside the panel. This is structural, not cosmetic: the contact gate blocks the
panel until name + email/phone are submitted, and no `Conversation` row exists
server-side until then.

So a proactive message must:

- **Never be persisted as a `ChatMessage`** and never be sent to Gemini. It is
  client-side copy until the shopper engages. Otherwise you manufacture
  conversations with no shopper in them and pollute the Activity feed the
  merchant reads.
- **Never fire while the panel is open** — check
  `root.classList.contains("aicw-open")`.
- **Never fire once a real conversation is underway.** If `contact` exists and
  history is non-empty, stay silent. Interrupting someone mid-question is the
  fastest way to get the app uninstalled.
- **Fire at most once per page view**, with a global cooldown on top of the
  per-rule `frequency`.
- Respect `prefers-reduced-motion` for the peek animation.

Clicking the peek opens the panel and the teaser copy replaces the welcome
message as the opening line. It does **not** seed the input — putting words in
the shopper's input box that they then have to delete reads as presumptuous.

Conversion is attributed by sending `proactiveRuleId` with the first chat
request; `apps.chat-widget.chat.tsx` writes it onto the `Conversation` row.

## Storage keys

Extends the existing `aicw-open` convention in `ai-chat-widget.js`. Every access
needs the same try/catch — private browsing throws.

| Key | Store | Purpose |
|---|---|---|
| `aicw-proactive-<ruleId>` | session or local, per `frequency` | last-shown timestamp |
| `aicw-visits` | local | visit counter for `return_visit` |
| `aicw-proactive-cooldown` | session | global anti-spam gate |

## Delivery

`apps.chat-widget.settings.tsx` returns `proactiveEnabled` and
`proactiveRules`, the latter through `publicProactiveRules()` — enabled only,
sorted by priority descending, `enabled` stripped. Disabled merchant copy never
reaches page source. That route returns a hand-picked field list; add
deliberately, never spread the settings row.

In the widget, one new section inside the existing IIFE: `initProactive(settings)`,
called after `restoreHistory()` and after the `getStoredOpenState()` restore
branch, so a restored-open panel suppresses it naturally. There is no build step
for the extension — keep it vanilla and string-built, like the rest of the file.

## Admin UI

New `app/components/settings/proactive-section.tsx`, composed into
`app.settings.tsx` alongside `WidgetSection` / `AppearanceSection` /
`TelegramSection`. Rules list as `<s-table>` with `listSlot` on every
`<s-table-header>` (without it the table falls back to the stacked
label/value layout), add/edit in a modal following `prompt-template-modal.tsx`.

Polaris web components only. Run the `polaris-component-checker` agent
afterwards — wrong prop or keyword values on `s-*` elements are easy to
introduce here.

## Non-goals for v1

- No email or SMS
- No server-side scheduling
- No Shopify webhook or scope changes
- **No mirroring into the admin chat preview.** Proactive behaviour is
  storefront-only, so `app._index.tsx` deliberately stays as-is and the
  widget-parity convention does not apply to this feature.

## Verification

There is no test suite in this repo. `playwright-capture.mjs` (gitignored) is a
working harness against a real storefront and extends naturally to asserting
that a rule fires on dwell and stays silent once a conversation is underway.
It needs the storefront password lifted on the dev store.

## Status

- [x] Migration `20260905190000_add_proactive_messages` — applied
- [x] `app/proactive.ts` — types, tolerant parser, strict validator, serializer
- [x] `apps.chat-widget.settings.tsx` — ships rules to the storefront
- [x] Widget `initProactive()` — all six triggers, peek UI, frequency caps
- [x] `proactive-section.tsx` — admin CRUD, headless trigger gating
- [x] `app.proactive.tsx` — validation of incoming merchant input
- [x] `proactiveRuleId` attribution write in `apps.chat-widget.chat.tsx`

`app/proactive.ts` is deliberately **not** `.server.ts`: the admin section
imports its constants and types, and a `.server` module pulled into client code
fails the build.

### Not yet verified against a live storefront

Typecheck, lint, `npm run build` and `validate_component_codeblocks`
(polaris-app-home) all pass, but no proactive rule has been observed firing on a
real storefront. Doing that needs two things this repo can't do on its own:

1. `npm run deploy -- --config <ai-chat-app|dev>` to push the theme extension —
   the storefront loads `ai-chat-widget.js` from Shopify's extension CDN, not
   from this working tree.
2. The dev store's password protection lifted (Online Store → Preferences →
   Restrict access), which currently redirects every automated visit to
   `/password`.

Worth exercising specifically once both are done: that the peek does **not**
appear for a shopper who has already passed the contact gate (`contact` is the
synchronous signal; `history` is populated asynchronously by `restoreHistory`),
and that `Conversation.proactiveRuleId` lands only on prompted conversations.
