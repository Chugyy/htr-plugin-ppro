#!/usr/bin/env python3
# app/core/services/queue.py
#
# Generic async task queue with bounded concurrency.
# Uses asyncio.Semaphore for concurrency control and in-memory dict for task tracking.

import asyncio
import logging
import uuid
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, Optional

from config.config import settings

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass
class TaskResult:
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


class TaskQueue:
    """Bounded async task queue with concurrency control."""

    def __init__(self, name: str, max_concurrent: int, max_queue_size: int = 0):
        self.name = name
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max_queue_size = max_queue_size or settings.max_queue_size
        self._tasks: Dict[str, TaskResult] = {}
        self._pending_count = 0
        logger.info(f"[QUEUE:{name}] Initialized | max_concurrent={max_concurrent} | max_queue={self._max_queue_size}")

    @property
    def pending_count(self) -> int:
        return self._pending_count

    @property
    def running_count(self) -> int:
        return sum(1 for t in self._tasks.values() if t.status == TaskStatus.RUNNING)

    def get_task(self, task_id: str) -> Optional[TaskResult]:
        return self._tasks.get(task_id)

    def get_status(self) -> dict:
        """Queue stats snapshot."""
        return {
            "name": self.name,
            "pending": self.pending_count,
            "running": self.running_count,
            "total_tracked": len(self._tasks),
        }

    async def submit(self, coro_fn: Callable[..., Awaitable[Any]], *args, **kwargs) -> TaskResult:
        """
        Submit a coroutine to the queue. Blocks the caller until done.
        Raises RuntimeError if queue is full.
        Returns TaskResult with status done/failed.
        """
        if self._pending_count + self.running_count >= self._max_queue_size:
            raise RuntimeError(f"Queue '{self.name}' is full ({self._max_queue_size} max)")

        task_id = uuid.uuid4().hex[:12]
        task = TaskResult(task_id=task_id)
        self._tasks[task_id] = task
        self._pending_count += 1

        logger.info(f"[QUEUE:{self.name}] Task {task_id} submitted | pending={self._pending_count}")

        try:
            async with self._semaphore:
                self._pending_count -= 1
                task.status = TaskStatus.RUNNING
                task.started_at = time.time()
                logger.info(f"[QUEUE:{self.name}] Task {task_id} started")

                result = await coro_fn(*args, **kwargs)

                task.status = TaskStatus.DONE
                task.result = result
                task.completed_at = time.time()
                elapsed = task.completed_at - task.started_at
                logger.info(f"[QUEUE:{self.name}] Task {task_id} done in {elapsed:.2f}s")
                return task

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = time.time()
            logger.error(f"[QUEUE:{self.name}] Task {task_id} failed: {e}")
            raise

    def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """Remove completed/failed tasks older than max_age_seconds."""
        now = time.time()
        to_remove = [
            tid for tid, t in self._tasks.items()
            if t.status in (TaskStatus.DONE, TaskStatus.FAILED)
            and t.completed_at
            and (now - t.completed_at) > max_age_seconds
        ]
        for tid in to_remove:
            del self._tasks[tid]
        if to_remove:
            logger.info(f"[QUEUE:{self.name}] Cleaned up {len(to_remove)} old tasks")
        return len(to_remove)


# ── Global queue registry ──────────────────────────────────────────────────

_queues: Dict[str, TaskQueue] = {}


def get_queue(name: str) -> TaskQueue:
    """Get or create a named queue with settings from config."""
    if name not in _queues:
        defaults = {
            "transcription": settings.max_concurrent_transcriptions,
            "optimization": settings.max_concurrent_optimizations,
            "ffmpeg": settings.max_concurrent_ffmpeg,
        }
        max_concurrent = defaults.get(name, 2)
        _queues[name] = TaskQueue(name, max_concurrent)
    return _queues[name]


def get_all_queues() -> Dict[str, dict]:
    """Status snapshot of all active queues."""
    return {name: q.get_status() for name, q in _queues.items()}
