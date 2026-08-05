---
name: sync-chat-backends
description: Diff the storefront chat route against the admin preview chat route to catch drift in tool-calling behavior, system prompt handling, or Gemini config between the two independently-maintained backends.
---

# Sync chat backends

This repo has two chat backends that intentionally share no code but must stay
behaviorally in sync:

- `app/routes/apps.chat-widget.chat.tsx` — real storefront endpoint (app proxy
  auth, persists conversations/messages, enforces the name+contact gate).
- `app/routes/app.chat-widget.preview.tsx` — admin-only test endpoint (admin
  auth, reads unsaved settings-form values, never persists).

Both call `streamText` from `ai` with a Gemini model, a `searchProducts` tool,
and `stopWhen: stepCountIs(4)`, and both must preserve the "never invent
products or prices" constraint from the system prompt.

## When to run this

- After editing either of the two files above.
- Before committing a change to the AI tool-calling logic, the `searchProducts`
  tool definition, or `stopWhen`/step-count behavior.

## What to check

1. Read both files in full.
2. Compare, side by side:
   - The `searchProducts` tool: input schema (Zod), the GraphQL query it runs,
     result shaping.
   - `streamText` config: model selection, `stopWhen`, any `system` prompt
     scaffolding added around the merchant-configurable `systemPrompt`.
   - Any guardrail instructions injected around the merchant's system prompt
     (e.g. "never invent products/prices").
3. Flag any difference that isn't explained by the two routes' different auth
   or persistence needs (session/shop lookup, contact-gate logic, and DB
   writes are expected to differ — tool-calling behavior is not).
4. If a difference is found, report the exact lines in both files and ask
   whether it was intentional before editing.

Do not silently "fix" one file to match the other — confirm with the user
first, since the divergence may be deliberate for an in-progress preview
experiment.
