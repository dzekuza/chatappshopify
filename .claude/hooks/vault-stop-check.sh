#!/bin/bash
# Stop hook: nudge Claude to sync the obsidian/ vault, but only when this turn
# actually edited/wrote a file outside obsidian/. Fires at most once per batch of
# code edits (tracked via a per-session marker holding the timestamp of the last
# edit we already prompted about), instead of blocking every Stop unconditionally.
set -euo pipefail

input="$(cat)"
session_id="$(printf '%s' "$input" | jq -r '.session_id // empty')"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty')"

if [ -z "$session_id" ] || [ -z "$transcript" ] || [ ! -f "$transcript" ]; then
  exit 0
fi

marker="${TMPDIR:-/tmp}/claude-vault-stop-${session_id}"
last_checked=0
[ -f "$marker" ] && last_checked="$(cat "$marker" 2>/dev/null || echo 0)"

last_edit="$(python3 - "$transcript" <<'PY'
import json, sys, datetime

path = sys.argv[1]
last = 0.0
try:
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except Exception:
                continue
            if d.get("type") != "assistant":
                continue
            ts = d.get("timestamp")
            if not ts:
                continue
            try:
                t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
            except Exception:
                continue
            for c in d.get("message", {}).get("content", []) or []:
                if not isinstance(c, dict) or c.get("type") != "tool_use":
                    continue
                if c.get("name") not in ("Edit", "Write", "NotebookEdit"):
                    continue
                fp = (c.get("input", {}) or {}).get("file_path") or ""
                if "/obsidian/" in fp:
                    continue
                if t > last:
                    last = t
except FileNotFoundError:
    pass
print(last)
PY
)"

now="$(date +%s)"
should_block="$(python3 -c "print('1' if float('$last_edit') > float('$last_checked') else '0')")"
echo "$now" > "$marker"

if [ "$should_block" = "1" ]; then
  echo '{"decision":"block","reason":"This turn edited files outside obsidian/ — update the matching vault docs now: catalog notes under obsidian/frontend/ for components/hooks/utils, obsidian/meta/changelog.md for notable changes, obsidian/meta/decisions-log.md for new architectural decisions. If the vault already reflects everything done this turn, say so and stop."}'
fi

exit 0
