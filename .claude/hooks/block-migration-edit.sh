#!/usr/bin/env bash
# PreToolUse hook (Edit|Write): enforce CLAUDE.md's "never modify applied
# migrations — always create new ones" policy. Only the newest migration
# folder (potentially still unapplied/in-progress) may be edited.
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

case "$file" in
  */prisma/migrations/*/migration.sql|prisma/migrations/*/migration.sql)
    migrations_dir="prisma/migrations"
    newest=$(ls -1 "$migrations_dir" 2>/dev/null | sort | tail -1)
    edited_dir=$(basename "$(dirname "$file")")
    if [ -n "$newest" ] && [ "$edited_dir" != "$newest" ]; then
      jq -n --arg dir "$edited_dir" --arg newest "$newest" \
        '{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason: ("Refusing to edit applied migration " + $dir + "/migration.sql — never modify applied migrations, create a new one instead with `npx prisma migrate dev --name <name>`. (Newest migration on disk: " + $newest + ".)")}}'
      exit 0
    fi
    ;;
esac

exit 0
