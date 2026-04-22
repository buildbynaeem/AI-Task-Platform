# Local Migration Guide — AI Task Processing Platform

This guide walks you through running the platform on your local Mac after
downloading it as a ZIP from Replit.

## What you'll be running

| Service     | Source                  | Container port | Host port | Purpose                                     |
| ----------- | ----------------------- | -------------- | --------- | ------------------------------------------- |
| `backend`   | `artifacts/api-server/` | 8080           | **8080**  | Node + Express API + serves the built SPA   |
| `worker`    | `worker/`               | 8008           | **8008**  | Python BullMQ consumer                      |
| `redis`     | `redis:7-alpine`        | 6379           | **6379**  | BullMQ queue backing store                  |
| `frontend`  | `artifacts/web/`        | 8080 (nginx)   | **5173**  | Static React SPA (also bundled into backend)|

> **Note on the directory layout.** During Replit development this project
> uses a pnpm monorepo, so the source lives under `artifacts/api-server`,
> `artifacts/web`, and `worker/`. The `docker-compose.yml` exposes them as
> the assignment-friendly service names `backend`, `frontend`, and `worker`.
>
> **Note on the frontend stack.** The original spec mentioned Next.js. The
> Replit workspace template only ships a React + Vite scaffold, so the SPA
> is built with React + Vite + TypeScript + Tailwind + Shadcn UI — same
> capabilities, simpler build. Everything else (auth, queue, worker, Mongo
> models) is unchanged.

---

## 1. Download the project

1. In Replit, open **⋮ → Download as ZIP** for the workspace.
2. Unzip it on your Mac:
   ```bash
   unzip ai-task-platform.zip -d ~/code/ai-task-platform
   cd ~/code/ai-task-platform
   ```

---

## 2. Prerequisites

Install the following (all available via Homebrew):

```bash
# Required
brew install node@20         # or use nvm
brew install python@3.11
brew install --cask docker   # Docker Desktop (for docker compose)

# Optional but convenient
brew install redis           # only needed for native dev (Option B below)
brew install mongosh         # to poke at MongoDB
```

Make sure Docker Desktop is running (whale icon in the menu bar) before you
run `docker compose`.

---

## 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and provide:

| Variable          | What to set                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `MONGODB_URI`     | A MongoDB Atlas connection string, **or** `mongodb://mongo:27017` if you uncomment the local `mongo` service in `docker-compose.yml`. |
| `MONGODB_DB_NAME` | Defaults to `taskplatform` — leave it alone unless you have a reason.       |
| `JWT_SECRET`      | A 32-byte random hex string. Generate with `openssl rand -hex 32`.          |
| `REDIS_URL`       | Defaults to `redis://redis:6379` (the in-compose service). Don't change it for Docker mode. |
| `BULL_QUEUE_NAME` | Defaults to `task-queue` — must match between backend and worker.           |

The `.env` file is read automatically by `docker compose`.

---

## 4. Run the stack

You have two options. Pick whichever fits your workflow.

### Option A — Docker Compose (recommended, matches the assignment)

One-liner setup:

```bash
chmod +x local-setup.sh
./local-setup.sh        # installs Node + Python deps and validates env
docker compose up --build
```

Compose brings up everything in dependency order:

```
redis  → backend (waits for redis healthy)
       → worker  (waits for redis healthy)
       → frontend (waits for backend healthy)
```

When it's up:

| URL                                | What you should see                              |
| ---------------------------------- | ------------------------------------------------ |
| http://localhost:8080              | The React app (auth page)                        |
| http://localhost:8080/api/healthz  | `{"status":"ok","checks":{"mongo":true,"redis":true}}` |
| http://localhost:8008/healthz      | Worker health JSON                               |
| http://localhost:5173              | Same SPA via the standalone nginx frontend image |

To tear down: `docker compose down` (add `-v` to also remove the named volumes).

### Option B — Native dev (fastest iteration)

```bash
./local-setup.sh                          # installs Node + Python deps
brew services start redis                 # background Redis on :6379
# In .env, set REDIS_URL=redis://127.0.0.1:6379

# Terminal 1 — backend
pnpm --filter @workspace/api-server run dev

# Terminal 2 — worker
source worker/.venv/bin/activate
cd worker && python main.py

# Terminal 3 — Vite frontend (hot reload)
pnpm --filter @workspace/web run dev
```

The Vite dev server runs on port **22333** in this mode and proxies API
calls to the backend on **8080**.

---

## 5. Verify the Node ↔ Python pipeline

The whole point of the platform is the API enqueues a job → worker picks it up
→ Mongo gets updated. To confirm end-to-end:

### A. Health checks

```bash
curl -s localhost:8080/api/healthz | jq
# {"status":"ok","checks":{"mongo":true,"redis":true}}

curl -s localhost:8008/healthz | jq
# {"status":"ok","checks":{"redis":true,"mongo":true,"worker":true}}
```

If either `mongo: false` or `redis: false`, fix that first — `MONGODB_URI`
or `REDIS_URL` in `.env` is wrong.

### B. End-to-end task flow

1. Open http://localhost:8080 in a browser.
2. Click **Create account**, register `you@example.com` / `password123`.
3. On the dashboard, submit a task:
   - Title: `hello`
   - Operation: `Uppercase`
   - Input: `hello world`
4. Within ~1 second the row should flip to **Success** with result
   `HELLO WORLD`.

While that's happening, watch the worker logs:

```bash
docker compose logs -f worker        # Option A
# or in Option B, just look at the python main.py terminal
```

You should see:
```
INFO worker :: Picked up job <id> task=<id> op=uppercase
INFO worker :: Completed task <id>
```

That confirms: **frontend → backend (HTTP) → Redis (BullMQ) → Python worker → MongoDB → frontend (poll)**.

### C. CLI smoke test (optional, no UI)

```bash
TOKEN=$(curl -s -X POST localhost:8080/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"cli@example.com","password":"password123"}' | jq -r .token)

curl -s -X POST localhost:8080/api/tasks \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"cli","operation":"reverse","input":"abcdef"}' | jq

sleep 2
curl -s localhost:8080/api/tasks -H "authorization: Bearer $TOKEN" | jq '.tasks[0]'
# .status should be "success" and .result should be "fedcba"
```

---

## 6. File checklist (already in the repo)

| File                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `docker-compose.yml`                  | Local orchestration of backend / worker / redis / frontend |
| `.env.example`                        | Template for required env vars                         |
| `.dockerignore`                       | Repo-root ignore — keeps `node_modules`, `.venv`, build outputs out of images |
| `local-setup.sh`                      | One-shot Mac bootstrap (Node deps, Python venv, env)   |
| `infra/docker/api-server.Dockerfile`  | Multi-stage build for the backend, runs as `node` user |
| `infra/docker/worker.Dockerfile`      | Multi-stage build for the Python worker, runs as uid 1001 |
| `infra/docker/web.Dockerfile`         | Multi-stage build for the frontend, runs as nginx uid 101 |
| `worker/requirements.txt`             | `bullmq`, `pymongo`, `redis`, `fastapi`, `uvicorn`     |
| `artifacts/api-server/package.json`   | `bullmq`, `mongoose`, `cors`, `helmet`, `bcryptjs`, `jsonwebtoken`, `express`, `express-rate-limit`, `pino`, `ioredis` |
| `artifacts/web/package.json`          | React + Vite + Tailwind + TanStack Query               |
| `infra/k8s/`                          | Kubernetes manifests if you want to deploy beyond local |
| `infra/README.md`                     | Production / Kubernetes notes                          |

### Security posture (assignment requirement)

All three Dockerfiles are **multi-stage** and run as **non-root**:

| Image       | Stage 1 (builder)            | Stage 2 (runtime)              | Runtime user             |
| ----------- | ---------------------------- | ------------------------------ | ------------------------ |
| `backend`   | `node:20-alpine` + pnpm + esbuild | `node:20-alpine` (slim)   | `node` (uid 1000)        |
| `worker`    | `python:3.11-slim` + venv     | `python:3.11-slim` (slim venv copy) | `worker` (uid 1001)      |
| `frontend`  | `node:20-alpine` + pnpm + Vite| `nginxinc/nginx-unprivileged` | `nginx` (uid 101)        |

The Kubernetes manifests under `infra/k8s/` additionally set
`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, drop all Linux
capabilities, and apply the `RuntimeDefault` seccomp profile.

---

## 7. Troubleshooting

| Symptom                                                                 | Likely cause / fix                                                         |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `backend` container restarts and `healthz` shows `mongo:false`          | Bad `MONGODB_URI` in `.env`. Atlas IP allowlist must include your IP.      |
| `worker` logs `Redis ping failed`                                       | `REDIS_URL` in `.env` is wrong. For Docker mode it must be `redis://redis:6379`. |
| Tasks created but never leave `pending`                                 | Worker not connected. Check `docker compose logs worker`.                  |
| `JWT secret too short` error on register                                | `JWT_SECRET` empty in `.env`. Generate one: `openssl rand -hex 32`.        |
| Port `8080` already in use                                              | Stop whatever owns it: `lsof -nP -iTCP:8080 -sTCP:LISTEN`.                 |
| Docker build is slow on first run                                       | Normal — pnpm + esbuild + Vite cold caches. Subsequent builds are cached.  |
| Apple Silicon: `no matching manifest for linux/arm64/v8`                | All base images used (`node:20-alpine`, `python:3.11-slim`, `redis:7-alpine`, `nginxinc/nginx-unprivileged`) are multi-arch. If you ever swap one, prefer arm64-friendly images. |

---

## 8. Where to go next

- **Production**: see `infra/README.md` for the Kubernetes manifests
  (Deployments, HPAs, NetworkPolicies, Ingress).
- **Architecture**: see `replit.md` for the high-level system diagram and
  the env-var matrix.
- **Code**: backend entry point is `artifacts/api-server/src/index.ts`,
  worker entry point is `worker/main.py`, frontend dashboard is
  `artifacts/web/src/pages/Dashboard.tsx`.
