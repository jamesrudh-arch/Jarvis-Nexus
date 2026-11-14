FROM oven/bun:1.3-slim AS base
WORKDIR /app

# tsconfig.json is REQUIRED at runtime: module resolution for @nexus/* runs
# through tsconfig path mappings (bun does not symlink private workspaces).
COPY package.json bun.lock tsconfig.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
ENV NEXUS_DB_PATH=/data/nexus.db
ENV NEXUS_WORKSPACE_ROOT=/data/workspaces
EXPOSE 3000
CMD ["bun", "apps/nexus-api/src/main.ts"]
