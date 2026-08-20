# App Store submission pack — AI Chat app

Working document for the Partner Dashboard submission. Everything here is drafted
from the actual codebase; verify anything marked **[confirm]** before pasting.

App: `AI Chat app` · client_id `491b02d88d133dfacc863cc6a7bdc8bf`
Config: `shopify.app.ai-chat-app.toml` · Distribution: **Public**

---

## 1. Listing copy

**Tagline** (short pitch, ~62 char limit)

> AI shopping assistant that answers from your real catalog

**Long description**

> AI Chat app adds a Gemini-powered shopping assistant to your storefront that
> answers customer questions using your store's actual product data — never
> invented details.
>
> When a shopper asks about a product, the assistant looks it up through the
> Shopify Admin API and answers from live titles, prices, and availability. It
> can check the status of a shopper's own order, answer from a knowledge base you
> curate, and hand off to a human when it can't help.
>
> Setup takes one click. The widget installs as a theme app block — no code
> changes, no theme edits, and you can match it to your brand with a custom
> colour, icon, position, and welcome message.

**Feature bullets**

- **Answers from your real catalog.** Product questions are resolved through live
  Admin API lookups, so prices, titles, and stock are never fabricated.
- **Order status lookup.** Shoppers can check their own order — the assistant
  only returns an order when the contact details match the ones on file for that
  conversation.
- **Curated knowledge base.** Point the assistant at specific collections,
  products, images, and videos so it answers in your terms.
- **Human handoff.** When the assistant can't help, it flags the conversation for
  follow-up and captures the shopper's contact details.
- **Speaks your customers' language.** Auto-detects the shopper's language, or
  lock it to any of 16 supported languages.
- **One-click install.** Ships as a theme app block with a direct deep link into
  the theme editor. No code changes.
- **Conversation dashboard.** Review every chat, see active sessions, and track
  orders that followed a conversation.

**Pricing copy**

| Plan | Price | Contents |
|---|---|---|
| Monthly | $4.99/mo, 7-day free trial | Assistant, live product lookup, order status, human handoff, shared Gemini key |
| Pro | $12.99/mo, 7-day free trial | Everything in Monthly, plus bring-your-own Gemini API key (your own quota) and priority support |

Both plans bill through the Shopify Billing API. Merchants can switch plans from
the in-app **Plans** page at any time.

---

## 2. Protected customer data request

Required because `read_orders` exposes customer names, emails, addresses, and
order contents. Expect this to be the slowest part of review.

**Access level to request:** Level 2 (protected customer *fields* — name, email,
phone, address), because the assistant matches a shopper's contact details
against order records.

**Which fields and why**

| Field | Why the app needs it |
|---|---|
| Customer name | Collected from the shopper before a chat starts; used to address them and to label the conversation in the merchant's dashboard. |
| Customer email / phone | Collected from the shopper. Used to verify that an order belongs to the person asking before any order detail is revealed, and so the merchant can follow up on a human-handoff request. |
| Order data (status, fulfillment, tracking, line items) | Returned to the shopper for their own verified order only. |

**How the app protects it**

- Order lookup is gated: `apps.chat-widget.chat.tsx` only returns an order when
  the order's contact details match the contact captured for that conversation.
  The assistant never confirms an order exists otherwise.
- Data is stored in a dedicated Postgres schema (`chat_widget`) reachable only
  over a direct connection from the app server — not exposed via any public API.
- Transport is HTTPS end to end.
- **[confirm]** Encryption at rest and access controls on the database — describe
  your Supabase configuration.

**Retention and deletion**

- `shop/redact` deletes all conversations, messages, knowledge entries, and
  settings for the shop.
- `customers/redact` deletes conversations and messages matched by the redacted
  shopper's email or phone.
- `app/uninstalled` deletes the shop's sessions.
- **Gap:** `customers/data_request` currently logs only — there's no automated
  export. You must be prepared to fulfil these manually within 30 days, or build
  the export before submitting.

**Subprocessors — must be disclosed**

- **Google (Gemini API)** — chat message content and retrieved product/order
  context are sent to Google for inference.
- **Supabase** — database hosting.
- **Vercel** — application hosting.

Reconcile this list with `app/routes/privacy/route.tsx` before submitting; the
listing and the privacy policy must agree.

---

## 3. Open decision: `read_all_orders`

The app requests `read_orders`, which caps order access at **60 days**. The
`PastOrders` query in `apps.chat-widget.chat.tsx` will silently return nothing
for anything older.

If shoppers asking about older orders is a real use case, request
`read_all_orders` in this same application — asking later means a second review
cycle. Justification would be that the assistant answers order-history questions
across a shopper's full purchase history, not just recent orders.

---

## 4. Only you can do these

- [ ] Rotate the Partner API token that was exposed (Settings → Partner API clients)
- [ ] Deploy current `main` to production (`npx vercel deploy --prod`)
- [ ] App icon (1200×1200)
- [ ] Listing screenshots — widget on a storefront, settings page, activity dashboard
- [ ] Demo store URL + credentials for the reviewer
- [ ] Support email and support/documentation URL
- [ ] Privacy policy URL (`/privacy` is already live)
- [ ] Test the full billing flow: subscribe, decline, upgrade, downgrade, reinstall
- [ ] Submit for review

---

## 5. Self-review status

From the AI self-review checklist run against this codebase:

- 2.3.1 (no manual shop-domain entry) — **fixed**, commit `d9cc819`
- 1.2.3 (plan changes without support) — **fixed**, commit `d9cc819`
- 1.2.2 (billing error handling) — **narrowed**, commit `d9cc819`
- 1.1.4 (factual information) — **hardened**, commit `ba96302`

Remaining items are listing content and Partner Dashboard steps, not code.
