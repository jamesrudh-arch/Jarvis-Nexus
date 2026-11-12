# JARVIS NEXUS — production container (Next.js standalone + Prisma/SQLite on a volume)
FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Standalone server + static assets + public models + prisma schema + seed database
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/db ./db
# /data is the Railway persistent volume mount point
CMD ["sh", "-c", "mkdir -p /data && if [ ! -f /data/custom.db ]; then cp db/custom.db /data/custom.db; fi && node server.js"]
