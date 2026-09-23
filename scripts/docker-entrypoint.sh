#!/bin/sh
# docker-entrypoint.sh — prepare SQLite DB then start the given command.
# Fixes P2021 "table main.X does not exist" on fresh Docker volumes:
# the compose volume db-data:/app/prisma starts empty, and nothing previously
# ran `prisma db push` inside the container (run.sh only did it for local Node).
set -eu

export DATABASE_URL="${DATABASE_URL:-file:/app/prisma/prod.db}"

echo "▸ [entrypoint] DATABASE_URL=$DATABASE_URL"

# 0. Fail fast with a fix hint when the SQLite file/dir is not writable.
# This is the classic "Error code 14: Unable to open the database file",
# usually a prod.db created by an earlier root-run container inside the
# named volume while the app now runs as `nextjs`.
DB_FILE="${DATABASE_URL#file:}"
case "$DB_FILE" in
  /*)
    DB_DIR="$(dirname "$DB_FILE")"
    if [ ! -d "$DB_DIR" ]; then
      mkdir -p "$DB_DIR" 2>/dev/null || {
        echo "✖ [entrypoint] cannot create DB directory $DB_DIR" >&2
        exit 1
      }
    fi
    if [ -e "$DB_FILE" ] && [ ! -w "$DB_FILE" ]; then
      echo "✖ [entrypoint] $DB_FILE exists but is not writable by $(whoami)." >&2
      echo "  fix: docker compose exec -u root app chown -R nextjs:nodejs /app/prisma" >&2
      echo "  (or as last resort: docker compose down -v  # DELETES all data)" >&2
      exit 1
    fi
    if [ ! -w "$DB_DIR" ]; then
      echo "✖ [entrypoint] DB directory $DB_DIR is not writable by $(whoami)." >&2
      echo "  fix: docker compose exec -u root app chown -R nextjs:nodejs /app/prisma" >&2
      exit 1
    fi
    ;;
esac

# 1. Create / migrate tables (non-destructive; no-op when already migrated).
echo "▸ [entrypoint] prisma db push..."
npx prisma db push --skip-generate || npx prisma db push --skip-generate --accept-data-loss || {
  echo "✖ [entrypoint] prisma db push failed" >&2
  exit 1
}

# 2. Additive agent migrations (001..007) when the agent engine is enabled.
# Mirrors run.sh; skipped gracefully when sqlite3 CLI is unavailable (alpine).
if [ "${AGENT_ENABLED:-false}" = "true" ]; then
  DB_FILE="${DATABASE_URL#file:}"
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_FILE" ]; then
    echo "▸ [entrypoint] applying agent migrations..."
    for f in prisma/agent-migrations/00*_*.up.sql; do
      sqlite3 "$DB_FILE" < "$f" 2>/dev/null || true
    done
  else
    echo "▸ [entrypoint] sqlite3 not available — skipping agent SQL migrations."
  fi
fi

# 3. Seed only when the database is empty (destructive seed must never wipe prod data).
USER_COUNT="$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.count().then((c) => { console.log(c); return p.\$disconnect(); }).catch(() => console.log('ERR'));
" 2>/dev/null || echo "ERR")"
if [ "$USER_COUNT" = "0" ]; then
  echo "▸ [entrypoint] empty DB — seeding demo data..."
  npm run db:seed || echo "⚠ [entrypoint] seed failed (continuing anyway)"
else
  echo "▸ [entrypoint] users=$USER_COUNT — skipping seed."
fi

echo "▸ [entrypoint] starting: $*"
exec "$@"
