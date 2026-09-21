# ── deps ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL is only needed at runtime; prisma generate works without a live DB.
RUN npx prisma generate && npm run build && npm run worker:build

# ── runtime ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Default application port (never 3000). Override with -e PORT=...
ENV PORT=3080
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 \
  && apk add --no-cache sqlite3

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

# Database is PostgreSQL (see docker-compose.yml); the cache is Redis.
# /app/prisma holds schema files (not a volume). The entrypoint's
# `prisma db push` still bootstraps tables on fresh volumes, and the
# sqlite3 CLI + worker build are kept for `file:` DATABASE_URL fallback.
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app \
  && chmod +x /app/scripts/docker-entrypoint.sh
VOLUME ["/app/uploads"]

USER nextjs
EXPOSE 3080

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["sh", "-c", "npx next start -p ${PORT:-3080} -H 0.0.0.0"]
