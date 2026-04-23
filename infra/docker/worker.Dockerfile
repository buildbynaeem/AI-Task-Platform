# syntax=docker/dockerfile:1.7
# Multi-stage build for the Python BullMQ worker.
# Stage 1 (builder): install Python deps into a virtualenv.
# Stage 2 (runtime): slim image with just the venv and source, run as non-root.

ARG PYTHON_VERSION=3.11

############################
# Stage 1 - builder
############################
FROM python:${PYTHON_VERSION}-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build
COPY worker/requirements.txt ./requirements.txt
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --upgrade pip \
 && /opt/venv/bin/pip install -r requirements.txt

############################
# Stage 2 - runtime
############################
FROM python:${PYTHON_VERSION}-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    WORKER_PORT=8080

# Create unprivileged user for the runtime container.
RUN groupadd --system --gid 1001 worker \
 && useradd  --system --uid 1001 --gid worker --home /home/worker --shell /sbin/nologin worker \
 && mkdir -p /home/worker /app \
 && chown -R worker:worker /home/worker /app

COPY --from=builder /opt/venv /opt/venv
WORKDIR /app
COPY --chown=worker:worker worker/ /app/

USER worker
EXPOSE 8080

CMD ["python", "main.py"]
