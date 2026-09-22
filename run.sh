#!/usr/bin/env bash
#
# run.sh — start Farmans Cafe with minimal manual setup.
#   ./run.sh            → start with Node (development or production)
#   ./run.sh --docker   → start with Docker Compose
#
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3080}"
OS="$(uname -s)"

info()  { printf "\033[1;32m▸\033[0m %s\n" "$*"; }
warn()  { printf "\033[1;33m▸\033[0m %s\n" "$*"; }
error() { printf "\033[1;31m✖ %s\033[0m\n" "$*"; }

command_exists() { command -v "$1" >/dev/null 2>&1; }

# ── Local Postgres via Docker (used when DATABASE_URL points at localhost) ──
ensure_local_postgres() {
  local user="${POSTGRES_USER:-farman}" pass="${POSTGRES_PASSWORD:-farman}" db="${POSTGRES_DB:-farman}"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx farmans-postgres; then
    info "Postgres container already running."
    return 0
  fi
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx farmans-postgres; then
    info "Starting existing Postgres container..."
    docker start farmans-postgres >/dev/null
    return 0
  fi
  info "Starting local Postgres (docker)..."
  docker run -d --name farmans-postgres \
    -e POSTGRES_USER="$user" -e POSTGRES_PASSWORD="$pass" -e POSTGRES_DB="$db" \
    -p 127.0.0.1:5432:5432 -v pg-data:/var/lib/postgresql/data \
    --restart unless-stopped postgres:16-alpine >/dev/null || {
    warn "Could not start container (port 5432 may be taken by your own Postgres) — continuing with DATABASE_URL as-is."
    return 0
  }
  info "Waiting for Postgres..."
  for _ in $(seq 1 30); do
    docker exec farmans-postgres pg_isready -U "$user" -d "$db" >/dev/null 2>&1 && break
    sleep 1
  done
}

# ── 1. Check Docker mode ────────────────────────────────────────────
if [[ "${1:-}" == "--docker" ]]; then
  if ! command_exists docker; then
    error "Docker یافت نشد. لطفاً Docker Desktop را نصب کنید: https://docs.docker.com/get-docker/"
    exit 1
  fi
  if [[ -f .env ]]; then
    set -a; source .env; set +a
  fi
  info "اجرای پروژه با Docker Compose روی پورت ${PORT}..."
  docker compose up --build -d
  info "برنامه اجرا شد: http://localhost:${PORT}"
  info "برای مشاهده لاگ‌ها: docker compose logs -f"
  exit 0
fi

# ── 2. Check Node.js ────────────────────────────────────────────────
if ! command_exists node; then
  error "Node.js یافت نشد."
  case "$OS" in
    Darwin)
      if command_exists brew; then
        warn "در حال نصب Node.js با Homebrew..."
        brew install node
      else
        error "Homebrew یافت نشد. Node.js را دستی نصب کنید: https://nodejs.org"
        exit 1
      fi
      ;;
    Linux)
      if command_exists apt-get; then
        warn "در حال نصب Node.js با apt (نیازمند sudo)..."
        sudo apt-get update && sudo apt-get install -y nodejs npm
      else
        error "لطفاً Node.js را دستی نصب کنید: https://nodejs.org"
        exit 1
      fi
      ;;
    *)
      error "سیستم‌عامل پشتیبانی نمی‌شود ($OS). Node.js را دستی نصب کنید."
      exit 1
      ;;
  esac
fi
info "Node.js $(node --version)"

# ── 3. Install dependencies ─────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  info "نصب وابستگی‌ها (npm install)..."
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
else
  info "وابستگی‌ها از قبل نصب شده‌اند."
fi

# ── 4. Environment configuration ────────────────────────────────────
if [[ ! -f .env ]]; then
  info "ایجاد فایل .env از نمونه..."
  cp .env.example .env
  # Generate a random NextAuth secret.
  if command_exists openssl; then
    SECRET=$(openssl rand -hex 32)
    sed -i.bak "s|replace-with-a-random-secret|${SECRET}|" .env && rm -f .env.bak
  fi
  warn "فایل .env ساخته شد. برای دسترسی از گوشی، PUBLIC_APP_URL را با IP سیستم خود تنظیم کنید."
fi
set -a; source .env; set +a

# ── 4b. Database URL must be PostgreSQL (schema provider is postgresql) ────
if [[ "${DATABASE_URL:-}" == file:* ]] || [[ -z "${DATABASE_URL:-}" ]]; then
  warn "DATABASE_URL is '${DATABASE_URL:-<empty>}' but the schema requires PostgreSQL; switching to local Postgres..."
  export DATABASE_URL="postgresql://${POSTGRES_USER:-farman}:${POSTGRES_PASSWORD:-farman}@localhost:5432/${POSTGRES_DB:-farman}?schema=public"
  if grep -q '^DATABASE_URL=' .env; then
    sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env && rm -f .env.bak
  else
    printf '\nDATABASE_URL="%s"\n' "$DATABASE_URL" >> .env
  fi
  info "Wrote DATABASE_URL to .env"
fi
# If the URL points at this machine, make sure Postgres is actually running.
if [[ "$DATABASE_URL" == postgresql://*@localhost:* ]] || [[ "$DATABASE_URL" == postgresql://*@127.0.0.1:* ]]; then
  if command_exists docker; then
    ensure_local_postgres
  else
    warn "Docker not found; make sure a local Postgres is running at 5432 yourself."
  fi
fi

# ── 5. Database setup (PostgreSQL) ──────────────────────────────────
info "همگام‌سازی دیتابیس (prisma db push)..."
npx prisma generate
npx prisma db push >/dev/null 2>&1 || npx prisma db push

# NOTE: the legacy agent migrations prisma/agent-migrations/*.sql are SQLite
# syntax (PRAGMA/BEGIN IMMEDIATE) and must NOT run against Postgres. The same
# tables are already part of prisma/schema.prisma and are created by db push.

# Seed only when the database is empty.
USER_COUNT=$(npx tsx -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.user.count().then((c) => { console.log(c); return p.\$disconnect(); });
" 2>/dev/null || echo "0")
if [[ "$USER_COUNT" == "0" ]]; then
  info "دیتابیس خالی است؛ در حال بارگذاری داده‌های نمونه..."
  npm run db:seed
fi

# ── 6. Start ────────────────────────────────────────────────────────
MODE="${1:-dev}"
if [[ "$MODE" == "--prod" ]]; then
  info "ساخت نسخه تولید (production build)..."
  npm run build
  if [[ "${AGENT_ENABLED:-false}" == "true" ]]; then
    info "ساخت و اجرای worker دستیار..."
    npm run worker:build
    node worker/dist.cjs &
  fi
  info "اجرای نسخه تولید روی پورت ${PORT}..."
  npm start
else
  info "اجرای سرور توسعه روی پورت ${PORT}..."
  exec npm run dev
fi