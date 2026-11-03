---
tags: [meta, decision]
updated: 2026-08-25
---

# Decisions Log (ADRs)

Architecture Decision Records. Each entry captures a choice, its context, and its
consequences. Use [[templates/adr-note]] for new entries. Newest first.

---

## ADR-0001 — Documentation lives in an in-repo Obsidian vault

- **Status:** Accepted
- **Date:** 2026-08-25

**Context.** Project knowledge (why a pattern exists, what not to touch, how to add
a feature) was scattered across chat history, READMEs, and people's heads. AI agents
re-derived it every session and got it wrong.

**Decision.** All project documentation lives in `obsidian/`, a linked Obsidian vault
committed to the repo. Root `AGENTS.md` / `CLAUDE.md` / `.cursorrules` are thin shims
pointing into it. Claude Code hooks inject the pointer at session start, remind on
every prompt, and block once at Stop when code changed without a doc update.

**Consequences.** Documentation is versioned with the code and reviewed in the same
PR. Every code change carries a doc obligation. Agents get consistent context without
re-reading the whole codebase.

---

## ADR-0002 — A chat-started shopper is synced to Shopify customers, and Klaviyo if the shop connects a key

- **Status:** Accepted
- **Date:** 2026-11-03

**Context.** The project owner asked whether starting a chat saves the shopper to Klaviyo or Shopify
contacts. It didn't — the contact-gate data (name/email, phone optional; required before
`apps.chat-widget.chat.tsx` will even create a `Conversation` row) stayed entirely inside this app's own
Postgres table. Asked to build both syncs.

**Decision.**
- **Shopify customer**, always on, no setting: `shopify-customer-sync.server.ts` looks the shopper up by
  email first (`customers(query: "email:...")`) and `customerUpdate`s if found, `customerCreate`s
  (tagged `"AI Chat Widget"`) otherwise — found-then-upsert rather than letting `customerCreate` fail on
  a duplicate, since a returning shopper reusing their email on a second conversation is the common
  case, not the exception. Needs the new `write_customers` scope.
- **Klaviyo profile**, opt-in per shop: this is a multi-tenant app with no shared Klaviyo account the
  way there's a shared Gemini key, so each shop brings its own private API key
  (`WidgetSettings.klaviyoApiKey`, same bring-your-own-secret pattern as `geminiApiKey` — plaintext in
  the DB, not encrypted at rest, consistent with that existing field). `klaviyo.server.ts` posts to
  Klaviyo's `/api/profile-import/` endpoint, which upserts by identifier server-side, so (unlike
  Shopify) no separate lookup call is needed.
- Both run fire-and-forget (`waitUntil`, same `background()` shape as `telegram.server.ts`'s
  notifications) so neither sync's latency or failure ever touches the shopper-facing chat response.
  Each retries once without the phone number specifically if the receiving API's userErrors/JSON:API
  errors point at the phone field — the widget's contact form collects phone as free text with no
  format validation, so a malformed number is expected, not exceptional, and shouldn't sink the whole
  name+email sync.

**Consequences.** `write_customers` is a new scope — existing installs need to re-approve it before the
Shopify-customer half actually works (Shopify's standard `app/scopes_update` reconsent flow, already
wired in this app); **the scope change must still be deployed** (`shopify app deploy`) for both configs,
which wasn't done as part of this change — see [[status]]. A merchant who doesn't want every chat
visitor becoming a Shopify customer record has no opt-out toggle today; if that's raised, it becomes a
setting next to the Klaviyo one, not a reason to remove the Shopify sync (it was explicitly requested).
Klaviyo's `revision` header (`klaviyo.server.ts`'s `API_REVISION`) is pinned, not `"latest"` — bump it
deliberately after checking Klaviyo's changelog for breaking changes, not reflexively.

## Related

[[status]] · [[changelog]] · ADR-0003

---

## ADR-0003 — The chat-start Shopify/Klaviyo sync is create-only, never update

- **Status:** Accepted
- **Date:** 2026-11-03

**Context.** A background security review of ADR-0002's sync flagged, correctly: `syncShopifyCustomer`
looked an existing Shopify customer up by email and ran `customerUpdate` on a match, overwriting its
name and phone; `syncKlaviyoProfile` called Klaviyo's `/api/profile-import/`, which upserts
unconditionally by email, on every call. Both took their input straight from the chat widget's contact
form — `apps.chat-widget.chat.tsx`'s app-proxy auth confirms a request came from this shop's storefront,
not who's typing into the form. Nothing stops a visitor from typing any real customer's email alongside
an arbitrary name/phone, which that code path would then have written into the real customer's Shopify
record and Klaviyo profile — an unauthenticated, silent overwrite of someone else's contact details.

**Decision.** Both syncs are create-only. `syncShopifyCustomer` keeps its email lookup but, on a match,
returns instead of calling `customerUpdate` — `updateCustomer` was deleted outright. `syncKlaviyoProfile`
gained a lookup it didn't need before (`profileExistsByEmail`, `GET /api/profiles/?filter=equals(email,…)`),
specifically to decide whether it's safe to call `/api/profile-import/` at all — on a match, the import is
skipped, not attempted. In both modules, a lookup that throws (bad API key, rate limit, network error)
aborts the whole sync rather than falling through to a create — an inconclusive "does this exist?" is
treated as "don't risk it," not as "assume not found."

**Consequences.** A shopper who already has a Shopify customer record or Klaviyo profile under the email
they give the widget no longer gets their name/phone refreshed from chat — intentional; there's no way
to tell that shopper apart from someone typing in a stranger's email without verifying the request
against Shopify's app-proxy `logged_in_customer_id` (only present when the visitor is logged into a
storefront account), which this change doesn't add. If "update an existing customer/profile from chat"
is wanted later, it needs that verification — comparing against `logged_in_customer_id` — not a reversion
to the email-lookup-then-update shape this ADR removed.

## Related

[[status]] · [[changelog]] · ADR-0003 · ADR-0004

---

## ADR-0004 — Klaviyo identity check moved into the create call; Shopify sync made opt-in

- **Status:** Accepted
- **Date:** 2026-11-03

**Context.** A second security review, of the commit that landed ADR-0003's fix, found two more real
issues before the code reached production:

1. **Identity-check/upsert mismatch in `klaviyo.server.ts`.** ADR-0003's fix pre-checked
   `GET /api/profiles/?filter=equals(email,…)` by email, then called the upsert endpoint
   `/api/profile-import/` if nothing matched. But Klaviyo resolves profile identity across every
   identifier on the payload — email *and* phone_number — while the pre-check only looked at email. A
   request carrying a stranger's real phone number alongside a fabricated email would pass the
   email-only check, then still match (and, through the upsert endpoint, update) that stranger's real
   profile by phone. The two checks — ours and Klaviyo's — were looking at different identity fields, a
   classic parser-differential gap.
2. **No opt-in for the Shopify customer sync.** `syncShopifyCustomer` ran unconditionally for every
   shop the moment this shipped — no setting, no consent. The chat widget is a public,
   unauthenticated endpoint; without a merchant-controlled gate, anyone could script requests against it
   to mass-create junk Shopify customer records (and, via the same shape of request against the Klaviyo
   side, inflate a merchant's Klaviyo bill — Klaviyo prices by profile count).
3. (Also fixed) `klaviyo.server.ts` logged the raw Klaviyo error response body on failure, which can
   include the submitted value in a validation error's `detail` field (e.g. an invalid phone number
   echoed back) — PII ending up in Vercel's log aggregation.

**Decision.**
- `klaviyo.server.ts` now calls `POST /api/profiles/` (plain create, not `/api/profile-import/`)
  directly and treats its 409 response as "already exists, skip" — no separate pre-check. This makes
  Klaviyo's own identity resolution (which already covers every identifier) the single source of truth
  for "does this already exist", closing the email-vs-phone gap structurally rather than by trying to
  replicate Klaviyo's matching logic ourselves.
- Error logging now strips `detail` and the raw response body everywhere, keeping only `code`/`title`
  (and `source.pointer`, a field path, not a value, used internally to detect a phone-specific
  rejection).
- Added `WidgetSettings.syncCustomersToShopify` (`Boolean @default(false)`) — the Shopify customer sync
  (ADR-0002/ADR-0003) now only runs for shops that turn it on in Settings, in the same "Customer sync"
  card as the Klaviyo API key field. Klaviyo already had an equivalent opt-in gate structurally (no key
  = no sync); this gives Shopify the same.

**Consequences.** Every existing shop defaults to the Shopify sync being off — a merchant has to
deliberately enable it, which is the intended behavior change, not a bug to "fix" by flipping the
default. The abuse-volume concern the review also raised (no rate limiting on conversation creation, so
even an opted-in shop's sync could be spammed by scripted requests with unique fake emails) is **not**
addressed by this ADR — it would need a distributed rate limiter (e.g. Upstash), a new dependency and
architecture decision not taken here. The existing free-plan monthly conversation cap
(`countConversationsThisMonth`/`FREE_PLAN_MONTHLY_CONVERSATIONS`) partially bounds this on free-plan
shops only; paid plans have unlimited conversations and no such cap. Flagged in [[status]] as an open
risk, not solved.
