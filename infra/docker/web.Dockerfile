# syntax=docker/dockerfile:1.7
# Multi-stage build for the React + Vite frontend.
# Stage 1 (builder): build the static bundle.
# Stage 2 (runtime): nginx-alpine serving the built assets as a non-root user.

ARG NODE_VERSION=20
ARG NGINX_VERSION=1.27-alpine

############################
# Stage 1 - builder
############################
FROM node:${NODE_VERSION}-alpine AS builder

ENV PNPM_HOME=/pnpm \
    PATH="/pnpm:$PATH" \
    CI=true \
    PORT=22333 \
    BASE_PATH=/
RUN corepack enable

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY artifacts/web/package.json artifacts/web/package.json
COPY lib lib

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @workspace/web...

COPY artifacts/web artifacts/web
RUN pnpm --filter @workspace/web run build

############################
# Stage 2 - runtime (nginx, non-root)
############################
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime

# nginxinc/nginx-unprivileged runs as uid 101 by default and listens on 8080.
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 /repo/artifacts/web/dist/public /usr/share/nginx/html

EXPOSE 8080
# CMD inherited from upstream image.
