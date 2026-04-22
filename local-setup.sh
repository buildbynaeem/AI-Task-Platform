#!/usr/bin/env bash
# local-setup.sh — bootstrap the AI Task Platform on a Mac dev machine.
#
# Installs Node deps via pnpm, sets up a Python venv for the worker, and
# prints next-step instructions for Redis and MongoDB.
#
# Usage:
#   chmod +x local-setup.sh
#   ./local-setup.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Pretty output -------------------------------------------------------------
BLUE="\033[1;34m"; GREEN="\033[1;32m"; YELLOW="\033[1;33m"; RED="\033[1;31m"; RESET="\033[0m"
log()  { printf "${BLUE}==>${RESET} %s\n" "$*"; }
ok()   { printf "${GREEN}✔${RESET}  %s\n" "$*"; }
warn() { printf "${YELLOW}!${RESET}  %s\n" "$*"; }
die()  { printf "${RED}✘${RESET}  %s\n" "$*" >&2; exit 1; }

# Pre-flight checks ---------------------------------------------------------
log "Pre-flight checks"

command -v node >/dev/null   || die "node not found. Install Node 20+ (e.g. 'brew install node@20' or 'nvm install 20')."
command -v python3 >/dev/null || die "python3 not found. Install Python 3.11+ ('brew install python@3.11')."

NODE_MAJOR="$(node -p 'parseInt(process.versions.node.split(".")[0],10)')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node ${NODE_MAJOR} detected, but 20+ is required."
fi
ok "Node $(node -v)"

PY_OK="$(python3 -c 'import sys; print(1 if sys.version_info >= (3,11) else 0)')"
[ "$PY_OK" = "1" ] || die "Python 3.11+ required (have $(python3 --version))."
ok "$(python3 --version)"

if ! command -v pnpm >/dev/null; then
  warn "pnpm not found — installing via corepack"
  corepack enable
  corepack prepare pnpm@latest --activate
fi
ok "pnpm $(pnpm -v)"

# Node deps -----------------------------------------------------------------
log "Installing Node dependencies (pnpm workspace)"
pnpm install --frozen-lockfile || pnpm install
ok "Node dependencies installed"

# Python worker venv --------------------------------------------------------
log "Setting up Python virtualenv at worker/.venv"
if [ ! -d worker/.venv ]; then
  python3 -m venv worker/.venv
fi
# shellcheck disable=SC1091
source worker/.venv/bin/activate
pip install --upgrade pip
pip install -r worker/requirements.txt
deactivate
ok "Python deps installed in worker/.venv"

# .env ---------------------------------------------------------------------
log "Checking .env"
if [ ! -f .env ]; then
  cp .env.example .env
  warn "Created .env from .env.example — edit it now to set MONGODB_URI and JWT_SECRET."
else
  ok ".env already present (not overwritten)"
fi

# Final instructions --------------------------------------------------------
cat <<'EOF'

========================================================================
  Setup complete. Next steps
========================================================================

1) Start Redis (pick ONE):

   a) Homebrew (recommended for native dev):
        brew install redis
        brew services start redis        # leave running in background
      OR (foreground):
        redis-server --port 6379

   b) Docker (one-off):
        docker run --rm -p 6379:6379 redis:7-alpine

2) Edit .env and set MONGODB_URI + JWT_SECRET.

3) Run the stack — choose ONE workflow:

   ── Option A: full Docker Compose (matches the assignment) ──
        docker compose up --build
      App:    http://localhost:8080      (backend + SPA on the same port)
      Worker: http://localhost:8008/healthz
      Redis:  localhost:6379

   ── Option B: native dev (faster iteration) ──
        # terminal 1 — backend
        pnpm --filter @workspace/api-server run dev
        # terminal 2 — worker
        source worker/.venv/bin/activate && cd worker && python main.py
        # terminal 3 — frontend (Vite dev server)
        pnpm --filter @workspace/web run dev

4) Smoke-test the Node ↔ Python pipeline:

     curl http://localhost:8080/healthz
     curl http://localhost:8008/healthz

   Then register a user and submit a task in the UI — the worker logs
   should show "Picked up job …" and "Completed task …" within ~1s.

See LOCAL_MIGRATION.md for the full migration guide.
========================================================================
EOF
