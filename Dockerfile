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
RUN npx prisma generate && npm run build

# ── runtime ──────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Default application port (never 3000). Override with -e PORT=...
ENV PORT=3080
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/src ./src

# Volume for the SQLite database and uploaded images.
RUN mkdir -p /app/prisma /app/uploads && chown -R nextjs:nodejs /app
VOLUME ["/app/prisma", "/app/uploads"]

USER nextjs
EXPOSE 3080

CMD ["npx", "next", "start", "-p", "3080", "-H", "0.0.0.0"]
