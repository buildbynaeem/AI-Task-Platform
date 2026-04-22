# Infrastructure

Container images and Kubernetes manifests for the **AI Task Processing Platform**.

The platform has four runtime components:

| Component   | Image                                | Container port | Purpose                                                              |
| ----------- | ------------------------------------ | -------------- | -------------------------------------------------------------------- |
| `web`       | `infra/docker/web.Dockerfile`        | 8080           | React + Vite SPA served by an unprivileged nginx                     |
| `api-server`| `infra/docker/api-server.Dockerfile` | 8080           | Express + TypeScript API (JWT auth, BullMQ producer)                 |
| `worker`    | `infra/docker/worker.Dockerfile`     | 8008           | Python BullMQ consumer (uvicorn `/healthz`, processes Mongo updates) |
| `redis`     | upstream `redis:7.4-alpine`          | 6379           | BullMQ queue backing store                                           |

MongoDB is **external** (e.g. MongoDB Atlas) — only the connection string
is needed inside the cluster, supplied via the `app-secrets` Secret.

## Building images

All build contexts are the **repo root**. Run from the project root:

```bash
docker build -f infra/docker/api-server.Dockerfile -t ghcr.io/your-org/ai-task-platform-api:$(git rev-parse --short HEAD) .
docker build -f infra/docker/worker.Dockerfile     -t ghcr.io/your-org/ai-task-platform-worker:$(git rev-parse --short HEAD) .
docker build -f infra/docker/web.Dockerfile        -t ghcr.io/your-org/ai-task-platform-web:$(git rev-parse --short HEAD) .
```

Each image:

- uses a multi-stage build (deps/build stage + minimal runtime stage)
- runs as a non-root user with `allowPrivilegeEscalation: false`
- exposes a health endpoint that Kubernetes probes consume

## Deploying

```bash
# 1. Create namespace + config
kubectl apply -f infra/k8s/00-namespace.yaml
kubectl apply -f infra/k8s/01-configmap.yaml

# 2. Provision real secrets (do NOT commit real values).
#    The 02-secrets.yaml in this repo is a placeholder.
kubectl create secret generic app-secrets \
  --namespace ai-task-platform \
  --from-literal=MONGODB_URI="mongodb+srv://USER:PASS@cluster.example.net/" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Apply everything else
kubectl apply -f infra/k8s/
```

Update the image references in `20-api-server.yaml`, `30-worker.yaml`, and
`40-web.yaml` to point at the registry/tag you actually pushed.

## Manifest layout

```
infra/k8s/
├── 00-namespace.yaml
├── 01-configmap.yaml          # Non-secret app config (Redis URL, queue name, DB name)
├── 02-secrets.yaml            # Placeholder Secret — do not commit real values
├── 10-redis.yaml              # Headless Service + StatefulSet
├── 20-api-server.yaml         # Deployment + Service + HPA (CPU + memory)
├── 30-worker.yaml             # Deployment + Service + HPA (CPU + memory)
├── 40-web.yaml                # Deployment + Service
├── 50-ingress.yaml            # nginx Ingress: /api → api-server, / → web
└── 60-network-policy.yaml     # Default-deny + targeted allow rules
```

## Health endpoints

- API:    `GET /healthz`  → `{ status, checks: { mongo, redis } }`
- Worker: `GET /healthz`  → `{ status, checks: { redis, mongo, worker } }`
- Web:    `GET /healthz`  → `ok` (served by nginx)

The API server also exposes `/api/healthz` so it can be reached through
the same `/api/*` Ingress path used by the frontend.

## Notes

- The `web` image is based on `nginxinc/nginx-unprivileged` so it runs as
  uid `101` and binds to port `8080` without needing root.
- HPAs use both CPU and memory targets and tuned scale-up/scale-down
  behavior. The worker scales more aggressively because queue depth is
  bursty.
- `60-network-policy.yaml` requires a CNI plugin that enforces
  `NetworkPolicy` (Calico, Cilium, etc.). Skip it on clusters without one.
