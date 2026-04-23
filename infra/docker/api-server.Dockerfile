# syntax=docker/dockerfile:1.7
# Multi-stage build for the Node.js / Express API server.
# Stage 1 (builder): install dependencies and bundle the server with esbuild.
# Stage 2 (runtime): minimal Alpine image running the bundled output as a non-root user.

ARG NODE_VERSION=20

############################
# Stage 1 - builder
############################
FROM node:${NODE_VERSION}-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    CI=true
RUN corepack enable

WORKDIR /repo

# Copy workspace manifests first so the dep layer is cacheable.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY lib lib

# Install workspace dependencies (frozen lockfile in CI).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @workspace/api-server...

# Bring in the api-server source and build it.
COPY backend backend
RUN pnpm --filter @workspace/api-server run build

############################
# Stage 2 - runtime
############################
FROM node:${NODE_VERSION}-alpine AS runtime

ENV NODE_ENV=production \
    PORT=5000

# Run as the unprivileged "node" user that ships with the official image.
WORKDIR /app
# esbuild produces a self-contained bundle, so we only need dist/ at runtime.
COPY --from=builder --chown=node:node /repo/backend/dist ./dist
COPY --from=builder --chown=node:node /repo/backend/package.json ./package.json

USER node
EXPOSE 5000

# /healthz is served by Express; rely on Kubernetes for probes.
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
