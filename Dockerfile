FROM oven/bun:1.3-slim AS base
WORKDIR /app

# install dependencies first (cached layer)
COPY package.json bun.lock ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN bun install --frozen-lockfile --production

# source (already copied for workspace resolution; keep image minimal)
ENV NODE_ENV=production
ENV NEXUS_DB_PATH=/data/nexus.db
ENV NEXUS_WORKSPACE_ROOT=/data/workspaces
EXPOSE 3000
CMD ["bun", "apps/nexus-api/src/main.ts"]
