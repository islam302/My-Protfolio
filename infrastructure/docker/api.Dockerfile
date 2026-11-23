# syntax=docker/dockerfile:1.7
#
# Inquiry/admin API (apps/api, Fastify) — production image.
#
# Build (from the repo root, the build context must be the monorepo root):
#   docker build -f infrastructure/docker/api.Dockerfile -t portfolio-api:local .
#
# Base image is pinned by exact version. For fully reproducible builds also pin
# the digest, e.g.
#   node:22.23.5-alpine3.24@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
# (digest of node:22-alpine observed on 2026-11-23). Tags are literal FROM lines
# so Dependabot can bump them.

# ---------------------------------------------------------------------------
# 1) deps: production dependencies for @portfolio/api only
# ---------------------------------------------------------------------------
FROM node:26.13.1-alpine3.24 AS deps
WORKDIR /app

# Copy only manifests first (layer cache). Every workspace manifest is copied so
# the lockfile stays in sync for `npm ci`; no source code of other apps enters
# the image.
COPY package.json package-lock.json ./
COPY packages/validation/package.json packages/validation/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json

# --ignore-scripts: no install-time scripts from third-party packages.
# Cache mount keeps the npm cache out of the image layers.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      --workspace @portfolio/api --include-workspace-root=false \
 # workspace links for apps that are not shipped would dangle — drop them
 && rm -f node_modules/@portfolio/web node_modules/@portfolio/admin

# ---------------------------------------------------------------------------
# 2) runtime
# ---------------------------------------------------------------------------
FROM node:26.13.1-alpine3.24 AS runtime

# tini = PID 1 (signal forwarding + zombie reaping).
# Remove npm/npx/corepack/yarn: not needed at runtime (migrations and the admin
# CLI are run with `node` directly) and they are a frequent source of CVEs.
# apk upgrade picks up Alpine security fixes released after the base image.
RUN apk upgrade --no-cache \
 && apk add --no-cache tini \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Root-owned, read-only for the runtime user (uid 1000 "node").
COPY --from=deps --chown=root:root /app/node_modules ./node_modules
COPY --chown=root:root package.json ./
COPY --chown=root:root packages/validation/package.json packages/validation/package.json
COPY --chown=root:root packages/validation/src packages/validation/src
COPY --chown=root:root apps/api/package.json apps/api/package.json
COPY --chown=root:root apps/api/src apps/api/src
COPY --chown=root:root apps/api/migrations apps/api/migrations

WORKDIR /app/apps/api
USER node

EXPOSE 3000

# Liveness: /api/health (no DB). Readiness (/api/health/ready) is for orchestrators.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
