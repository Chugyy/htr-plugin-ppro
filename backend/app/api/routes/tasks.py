#!/usr/bin/env python3
# app/api/routes/tasks.py

from fastapi import APIRouter, Depends, HTTPException
from app.api.middleware.auth import verify_api_key
from app.api.models.common import TaskStatusResponse, QueueStatusResponse
from app.core.services.queue import get_queue, get_all_queues

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/queue/status", response_model=QueueStatusResponse)
async def get_queue_status(_=Depends(verify_api_key())):
    """Get status snapshot of all active queues."""
    return QueueStatusResponse(queues=get_all_queues())


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str, _=Depends(verify_api_key())):
    """Get status of a queued task by ID."""
    for name in get_all_queues():
        queue = get_queue(name)
        task = queue.get_task(task_id)
        if task:
            return TaskStatusResponse(
                task_id=task.task_id,
                status=task.status.value,
                error=task.error,
                created_at=task.created_at,
                started_at=task.started_at,
                completed_at=task.completed_at,
            )
    raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
