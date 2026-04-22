# AI Task Processing Platform

## Overview

A full-stack task processing platform. Users sign up, submit text-processing tasks
(uppercase / lowercase / reverse / wordcount), and watch them complete in real time.
Tasks are queued on Redis with BullMQ and consumed by a Python worker that updates
MongoDB.

## Architecture

```
┌────────────┐  HTTPS  ┌────────────┐  BullMQ  ┌────────────┐
│   web      │ ──────► │ api-server │ ───────► │ Redis      │
│ React+Vite │         │ Express+TS │          │            │
└────────────┘         └─────┬──────┘          └─────┬──────┘
                             │                       │
                       Mongoose                  bullmq (py)
                             ▼                       ▼
                       ┌──────────┐         ┌────────────────┐
                       │ MongoDB  │ ◄────── │  Python worker │
                       │ Atlas    │ pymongo │  uvicorn :8008 │
                       └──────────┘         └────────────────┘
```

## Stack

- **Monorepo**: pnpm workspaces (Node 20+, TypeScript 5.9)
- **Frontend** (`artifacts/web`): React + Vite + TypeScript + Tailwind, Auth via JWT in localStorage, dashboard polls every 2.5s.
- **API server** (`artifacts/api-server`): Express 5, Mongoose, jsonwebtoken, bcryptjs, helmet, cors, express-rate-limit, BullMQ producer, esbuild bundle.
- **Worker** (`worker/`): Python 3.11, FastAPI/uvicorn for `/healthz`, `bullmq` consumer, `pymongo`.
- **Queue**: Redis 7 (`task-queue`).
- **DB**: MongoDB (`taskplatform` database, `users` and `tasks` collections).

## Key environment variables

| Var                 | Used by              | Notes                                                      |
| ------------------- | -------------------- | ---------------------------------------------------------- |
| `MONGODB_URI`       | api-server, worker   | mongodb+srv://… ; database name is appended via `MONGODB_DB_NAME` |
| `MONGODB_DB_NAME`   | api-server, worker   | Defaults to `taskplatform`. Both clients **must** agree.   |
| `REDIS_URL`         | api-server, worker   | Defaults to `redis://127.0.0.1:6379` in dev                |
| `BULL_QUEUE_NAME`   | api-server, worker   | `task-queue`                                               |
| `JWT_SECRET`        | api-server           | 32+ byte random string                                     |
| `PORT`              | api-server, web      | API: 8080 in prod, web (Vite/nginx): 8080/22333            |
| `WORKER_PORT`       | worker               | 8008                                                       |

## Health endpoints

- `GET /healthz` and `GET /api/healthz` (api-server) — checks Mongo + Redis
- `GET /healthz` (worker) — checks Mongo + Redis + worker thread
- `GET /healthz` (web/nginx) — static `200 OK`

## Local dev workflows

- `Redis` — `redis-server --port 6379` for local queue
- `Worker` — `cd worker && python main.py`
- `artifacts/api-server: API Server` — `pnpm --filter @workspace/api-server run dev`
- `artifacts/web: web` — `pnpm --filter @workspace/web run dev` (Vite on 22333)

## Production / containers

See `infra/README.md`. Three multi-stage Dockerfiles (`infra/docker/`) and a
complete set of Kubernetes manifests (`infra/k8s/`) — Namespace, ConfigMap,
Secret placeholder, Redis StatefulSet, Deployments + Services + HPAs for api
and worker, web Deployment + Service, nginx Ingress (`/api`→api, `/`→web), and
NetworkPolicies. All containers run as non-root with `allowPrivilegeEscalation:
false` and seccomp `RuntimeDefault`.

## Notes / gotchas

- Both Mongo clients must specify the database name explicitly. Mongoose
  defaults to `test` and pymongo defaults to whatever path is in the URI; we
  pass `dbName` / `client[name]` to keep them in sync.
- The API mounts `/healthz` twice (`/healthz` and `/api/healthz`) so it's
  reachable through both the bare service URL and the `/api` Ingress prefix.
- The frontend uses relative `/api/*` URLs prefixed with Vite `BASE_URL`, so
  the same build works under `/` or any sub-path proxy.
- Next.js was not used because the workspace template only ships a React+Vite
  scaffold; the resulting frontend is functionally equivalent.
