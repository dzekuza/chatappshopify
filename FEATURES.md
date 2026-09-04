# Features

## AI shopping assistant
- Storefront chat widget powered by Google Gemini (`gemini-2.5-flash` by default, model configurable per shop).
- Live product lookup via a Shopify Admin GraphQL tool — the assistant only surfaces real products and prices from the merchant's own catalog, never invented ones.
- Order status lookup and human handoff (Monthly/Pro plans).
- Merchant-configurable system prompt, welcome message, and response language (auto-detect or a fixed language from a supported list).

## Widget customization
- Header title, primary color, corner style (rounded/square), and launcher position (e.g. bottom-right).
- Custom launcher icon upload, stored via Shopify's file storage.
- Live preview of the widget inside the admin, using the in-progress (even unsaved) settings before publishing.
- One-click "Add to theme" deep link into the theme editor's app-embed picker.

## Knowledge base
- Attach store knowledge to the assistant: product collections, images, and videos, surfaced to the AI as additional context.
- Per-shop collection selection so the assistant's product knowledge matches what the merchant wants exposed.

## Conversations & activity
- Every storefront conversation is persisted (shopper contact info, message history) and viewable in an admin activity log.
- Per-conversation detail view for reviewing the full exchange.
- A name + contact gate before a shopper can start chatting, so every conversation is attributable.

## Plans & billing
- **Free** — AI shopping assistant widget, live product lookup, 50 conversations/month, no trial required.
- **Monthly ($4.99/mo, 7-day trial)** — everything in Free plus unlimited conversations, order status lookup, and human handoff, using the app's shared Gemini API key.
- **Pro ($12.99/mo, 7-day trial)** — everything in Monthly plus bring-your-own Gemini API key (unlimited usage on the merchant's own quota) and priority support.

## Compliance & privacy
- Mandatory GDPR webhooks: customer data request, customer redact, shop redact.
- Public privacy policy route.
- Widget settings and conversation data isolated per shop.
