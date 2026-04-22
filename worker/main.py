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
from fastapi import FastAPI, Response
from pymongo import MongoClient
from pymongo.collection import Collection
from redis.asyncio import Redis

from processor import process_operation

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
log = logging.getLogger("worker")

MONGODB_URI = os.environ["MONGODB_URI"]
MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME", "taskplatform")
REDIS_URL = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379")
QUEUE_NAME = os.environ.get("BULL_QUEUE_NAME", "task-queue")
HEALTHZ_PORT = int(os.environ.get("WORKER_PORT", "8008"))

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
    redis = Redis.from_url(REDIS_URL)
    try:
        await redis.ping()
        worker_state["redis_ok"] = True
        log.info("Redis ping OK at %s", REDIS_URL)
    except Exception as exc:  # noqa: BLE001
        log.error("Redis ping failed: %s", exc)
        worker_state["redis_ok"] = False
    finally:
        await redis.aclose()

    try:
        mongo_client.admin.command("ping")
        worker_state["mongo_ok"] = True
        log.info("Mongo ping OK")
    except Exception as exc:  # noqa: BLE001
        log.error("Mongo ping failed: %s", exc)
        worker_state["mongo_ok"] = False

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
