#!/usr/bin/env python3
# app/database/crud/bug_report.py

import json
import uuid
from typing import Optional

from app.database.db import get_db_pool


async def insert_bug_report(
    user_id: Optional[uuid.UUID],
    feature: str,
    error_message: str,
    error_stack: Optional[str],
    frontend_logs: Optional[str],
    project_state: Optional[dict],
    system_info: Optional[dict],
    request_ids: Optional[list[str]],
) -> int:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO bug_reports
                (user_id, feature, error_message, error_stack, frontend_logs,
                 project_state, system_info, request_ids)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
            RETURNING id
            """,
            user_id,
            feature,
            error_message,
            error_stack,
            frontend_logs,
            json.dumps(project_state) if project_state else None,
            json.dumps(system_info) if system_info else None,
            request_ids,
        )
    return int(row["id"])


async def get_bug_report(report_id: int) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id, feature, error_message, error_stack,
                   frontend_logs, project_state, system_info, request_ids, created_at
            FROM bug_reports WHERE id = $1
            """,
            report_id,
        )
    if not row:
        return None
    result = dict(row)
    # Convert UUID to string for Pydantic
    if result.get("user_id"):
        result["user_id"] = str(result["user_id"])
    # asyncpg returns JSONB as Python dict/str — ensure it's dict
    for key in ("project_state", "system_info"):
        val = result.get(key)
        if isinstance(val, str):
            result[key] = json.loads(val)
    return result
