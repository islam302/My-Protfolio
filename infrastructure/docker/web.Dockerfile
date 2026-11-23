# syntax=docker/dockerfile:1.7
#
# Static site (apps/web) + admin panel (apps/admin) served by unprivileged nginx,
# which also reverse-proxies /api/ to the API container (same origin).
#
# Build (context = monorepo root):
#   docker build -f infrastructure/docker/web.Dockerfile \
#     --build-arg SITE_URL=https://islambadran.com --build-arg PUBLIC_API_URL=/api \
#     -t portfolio-web:local .
#
# Leave PUBLIC_API_URL empty (--build-arg PUBLIC_API_URL=) to get the original,
# API-less site (form hands off to WhatsApp/email only).
#
# Pinned by version; pin the digest too for reproducible builds, e.g.
#   nginxinc/nginx-unprivileged:1.31.7-alpine3.24@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

# ---------------------------------------------------------------------------
# 1) build: generate apps/web/dist and apps/admin/dist
# ---------------------------------------------------------------------------
FROM node:22.23.5-alpine3.24 AS build
WORKDIR /src

COPY package.json package-lock.json ./
COPY packages/validation/package.json packages/validation/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json

# The static builds only need the runtime deps of web/admin (+ @portfolio/validation → zod).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
      --workspace @portfolio/web --workspace @portfolio/admin --include-workspace-root=false

COPY packages/validation packages/validation
COPY apps/web apps/web
COPY apps/admin apps/admin

ARG SITE_URL=https://islambadran.com
ARG PUBLIC_API_URL=/api
ARG ADMIN_API_BASE=/api
ENV SITE_URL=${SITE_URL} PUBLIC_API_URL=${PUBLIC_API_URL} ADMIN_API_BASE=${ADMIN_API_BASE}

RUN npm run build -w @portfolio/web \
 && npm run build -w @portfolio/admin --if-present \
 && mkdir -p apps/admin/dist \
 # never ship dotfiles or source maps
 && find apps/web/dist apps/admin/dist \( -name '.*' -o -name '*.map' \) -prune -exec rm -rf {} +

# ---------------------------------------------------------------------------
# 2) runtime: nginx (uid 101, listens on 8080)
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24 AS runtime

# Config is root-owned and read-only for the nginx user.
USER root
# Pick up Alpine security fixes released after the base image was built.
RUN apk upgrade --no-cache && rm -f /etc/nginx/conf.d/default.conf
COPY --chown=root:root infrastructure/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chown=root:root infrastructure/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=root:root infrastructure/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build --chown=root:root /src/apps/web/dist /usr/share/nginx/html
COPY --from=build --chown=root:root /src/apps/admin/dist /usr/share/nginx/admin
USER 101
# fail the build on a broken config
RUN nginx -t

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

# The base image entrypoint is kept (it only runs /docker-entrypoint.d scripts,
# which are no-ops here because no templates are shipped).
CMD ["nginx", "-g", "daemon off;"]
