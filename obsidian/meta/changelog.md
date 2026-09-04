---
tags: [meta, changelog]
updated: 2026-08-25
---

# Changelog

Chronological log of notable changes to the project. Newest first.
This is a human-curated log — not a mirror of `git log`. Record *why*, not just
*what*; the diff already covers *what*.

## 2026-08-25 — video timestamps on knowledge entries

- A knowledge entry with an attached video can now carry a start/end time, so
  the assistant can say "that's shown from 0:10 to 0:15" and hand the shopper a
  player that opens at 0:10 and stops at 0:15.
- The range travels as a `#t=start,end` media fragment on the URL, because the
  model's reply text is the only channel between the server and the players —
  there is no structured media payload in the stream.
- Both chat backends (`apps.chat-widget.chat.tsx`, `app.chat-widget.preview.tsx`)
  and all three players (storefront widget, admin preview, activity transcript)
  had to change together; the widget is vanilla JS and shares no code with the
  React side by design.

## 2026-08-25 — vault initialised

- Project brain scaffolded from the shared `.project-brain` template: vault,
  root shims (`AGENTS.md` / `CLAUDE.md` / `.cursorrules`), and the three Claude
  Code hooks that keep this vault in sync.
