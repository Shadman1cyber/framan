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