#!/usr/bin/env bash
# PostToolUse hook (Edit|Write): enforce CLAUDE.md's "run npm run typecheck
# after any route/schema change" policy automatically.
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

case "$file" in
  *app/routes/*.tsx|*prisma/schema.prisma)
    output=$(npm run typecheck 2>&1)
    status=$?
    if [ $status -ne 0 ]; then
      jq -n --arg out "$output" \
        '{decision:"block", reason: ("npm run typecheck failed after this route/schema edit:\n\n" + $out)}'
    fi
    ;;
esac

exit 0
