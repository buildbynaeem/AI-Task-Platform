"""AI Task Processing Worker.

Consumes BullMQ jobs from Redis queue `task-queue` and processes them,
updating the corresponding MongoDB task document with status and logs.
Exposes a /healthz HTTP endpoint for Kubernetes liveness/readiness probes.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import uvicorn
from bson import ObjectId
from bullmq import Worker
from dotenv import load_dotenv
from fastapi import FastAPI, Response
from pymongo import MongoClient
from pymongo.collection import Collection
from redis.asyncio import Redis

from processor import process_operation

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("worker")

MONGODB_URI = os.environ.get("MONGODB_URI")
if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI environment variable is required")

MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "taskplatform")
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")
QUEUE_NAME = os.environ.get("BULL_QUEUE_NAME", "task-queue")
HEALTHZ_PORT = int(os.environ.get("WORKER_PORT", "8080"))

# MongoDB - explicitly pin to MONGODB_DB_NAME to avoid mismatch with API server.
mongo_client: MongoClient = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
mongo_db = mongo_client[MONGODB_DB_NAME]
tasks: Collection = mongo_db["tasks"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _append_log(task_id: str, level: str, message: str) -> None:
    tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$push": {"logs": {"at": _now(), "level": level, "message": message}}},
    )


async def handle_job(job: Any, _job_token: str) -> dict[str, Any]:
    data = job.data or {}
    task_id = data.get("taskId")
    operation = data.get("operation")
    text_input = data.get("input", "")

    log.info("Picked up job %s task=%s op=%s", job.id, task_id, operation)

    if not task_id or not operation:
        raise ValueError("job missing required fields taskId/operation")

    tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$set": {"status": "running", "startedAt": _now()},
            "$push": {
                "logs": {
                    "at": _now(),
                    "level": "info",
                    "message": f"Worker {os.getpid()} picked up job, running '{operation}'",
                }
            },
        },
    )

    try:
        result = process_operation(operation, text_input)
        tasks.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {
                    "status": "success",
                    "result": str(result),
                    "finishedAt": _now(),
                },
                "$push": {
                    "logs": {
                        "at": _now(),
                        "level": "info",
                        "message": f"Completed successfully (result length={len(str(result))})",
                    }
                },
            },
        )
        log.info("Completed task %s", task_id)
        return {"taskId": task_id, "result": str(result)}
    except Exception as exc:  # noqa: BLE001
        log.exception("Failed task %s", task_id)
        tasks.update_one(
            {"_id": ObjectId(task_id)},
            {
                "$set": {
                    "status": "failed",
                    "error": str(exc),
                    "finishedAt": _now(),
                },
                "$push": {
                    "logs": {
                        "at": _now(),
                        "level": "error",
                        "message": f"Job failed: {exc}",
                    }
                },
            },
        )
        raise


# ---------------------------------------------------------------------------
# Healthz HTTP server (FastAPI + uvicorn) for Kubernetes probes.
# ---------------------------------------------------------------------------
worker_state: dict[str, Any] = {"worker": None, "redis_ok": False, "mongo_ok": False}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Try to connect to Redis with retries
    redis_connected = False
    for i in range(10):
        try:
            redis = Redis.from_url(REDIS_URL)
            await redis.ping()
            worker_state["redis_ok"] = True
            log.info("Redis ping OK at %s", REDIS_URL)
            await redis.aclose()
            redis_connected = True
            break
        except Exception as exc:  # noqa: BLE001
            log.warn("Redis ping failed (attempt %d/10): %s", i + 1, exc)
            await asyncio.sleep(3)
    
    if not redis_connected:
        log.error("Failed to connect to Redis after 10 attempts")

    # Try to connect to Mongo with retries
    mongo_connected = False
    for i in range(10):
        try:
            mongo_client.admin.command("ping")
            worker_state["mongo_ok"] = True
            log.info("Mongo ping OK")
            mongo_connected = True
            break
        except Exception as exc:  # noqa: BLE001
            log.warn("Mongo ping failed (attempt %d/10): %s", i + 1, exc)
            await asyncio.sleep(3)
    
    if not mongo_connected:
        log.error("Failed to connect to Mongo after 10 attempts")

    worker = Worker(
        QUEUE_NAME,
        handle_job,
        {"connection": REDIS_URL, "concurrency": 4},
    )
    worker_state["worker"] = worker
    log.info("BullMQ worker started on queue '%s'", QUEUE_NAME)

    try:
        yield
    finally:
        log.info("Shutting down worker...")
        try:
            await worker.close()
        except Exception:  # noqa: BLE001
            log.exception("Error closing worker")
        mongo_client.close()


app = FastAPI(lifespan=lifespan)


@app.get("/healthz")
async def healthz(response: Response):
    redis_ok = False
    try:
        redis = Redis.from_url(REDIS_URL)
        redis_ok = bool(await redis.ping())
        await redis.aclose()
    except Exception:  # noqa: BLE001
        redis_ok = False

    mongo_ok = False
    try:
        mongo_client.admin.command("ping")
        mongo_ok = True
    except Exception:  # noqa: BLE001
        mongo_ok = False

    worker_running = worker_state.get("worker") is not None
    ok = redis_ok and mongo_ok and worker_running
    response.status_code = 200 if ok else 503
    return {
        "status": "ok" if ok else "degraded",
        "checks": {"redis": redis_ok, "mongo": mongo_ok, "worker": worker_running},
    }


def _install_signal_handlers(loop: asyncio.AbstractEventLoop) -> None:
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, lambda: None)
        except NotImplementedError:
            pass


def main() -> None:
    config = uvicorn.Config(app, host="0.0.0.0", port=HEALTHZ_PORT, log_level="info")
    server = uvicorn.Server(config)
    asyncio.run(server.serve())


if __name__ == "__main__":
    main()
