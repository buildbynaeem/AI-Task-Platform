# AI TaskFlow Platform

A production-grade, distributed AI task processing system built with the MERN stack and a Python background worker.

## 🏗 Architecture

The platform uses a producer-consumer architecture to handle text transformations asynchronously:

- **Frontend**: Next.js (App Router) with Tailwind CSS and Shadcn/UI. Runs on port `3000`.
- **Backend API**: Node.js/Express server in TypeScript. Enqueues tasks to Redis and manages MongoDB. Runs on port `5000`.
- **Worker**: Python background processor. Consumes tasks from Redis, processes them, and updates MongoDB. Health check on port `8080`.
- **Database**: MongoDB for persistent storage of users and tasks.
- **Message Broker**: Redis (using BullMQ) for reliable task queuing.

## 🚀 Local Development

### Prerequisites
- Node.js 20+ & pnpm
- Python 3.11+
- Docker & Docker Compose
- MongoDB & Redis (or use the provided `docker-compose.yml`)

### Quick Start
1. **Setup Environment**:
   ```bash
   cp .env.example .env
   # Update .env with your local MongoDB and Redis credentials if not using Docker
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   cd worker && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
   ```

3. **Run Locally**:
   ```bash
   pnpm dev
   ```
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend: [http://localhost:5000](http://localhost:5000)

### Run with Docker Compose
To run the entire stack (including DBs) in a production-like containerized environment:
```bash
docker compose up --build
```

## ☸️ Kubernetes Deployment

The project is fully prepared for Kubernetes deployment using the manifests in the `/infra/k8s` directory.

### Deployment Steps
1. **Create Namespace**:
   ```bash
   kubectl apply -f infra/k8s/00-namespace.yaml
   ```

2. **Configure Secrets & Config**:
   Create a secret for sensitive data (see `infra/README.md` for details):
   ```bash
   kubectl create secret generic app-secrets --namespace ai-task-platform --from-literal=MONGODB_URI="..." --from-literal=JWT_SECRET="..."
   ```

3. **Deploy Infrastructure**:
   ```bash
   kubectl apply -f infra/k8s/
   kubectl apply -f infra/k8s/monitoring/
   ```

## 🔒 Security & Best Practices
- **Non-Root Containers**: All Docker images are built to run as unprivileged users.
- **Multi-Stage Builds**: Optimized Dockerfiles to minimize image size and attack surface.
- **Network Policies**: Zero-trust network policies to restrict inter-pod communication.
- **Resource Limits**: Defined CPU and Memory limits for all deployments to ensure cluster stability.
- **Health Probes**: Comprehensive Liveness and Readiness probes for all services.
