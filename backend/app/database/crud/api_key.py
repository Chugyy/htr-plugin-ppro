# app/database/crud/api_key.py

import secrets
from typing import Optional
from uuid import UUID

import asyncpg

from app.database.db import get_db_pool


async def create_api_key(user_id: UUID, name: str, key: str) -> dict:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO api_keys (user_id, name, key)
            VALUES ($1, $2, $3)
            RETURNING id, name, key, is_active, created_at, last_used_at
            """,
            user_id, name, key,
        )
        return dict(row)


async def list_api_keys(user_id: UUID) -> list[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, key, is_active, created_at, last_used_at
            FROM api_keys
            WHERE user_id = $1 AND is_active = TRUE
            ORDER BY created_at DESC
            """,
            user_id,
        )
        return [dict(row) for row in rows]


async def delete_api_key(api_key_id: int, user_id: UUID) -> bool:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE api_keys
            SET is_active = FALSE
            WHERE id = $1 AND user_id = $2 AND is_active = TRUE
            RETURNING id
            """,
            api_key_id, user_id,
        )
        return row is not None


async def get_api_key_by_key(key: str) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            UPDATE api_keys
            SET last_used_at = NOW()
            WHERE key = $1 AND is_active = TRUE
            RETURNING id, user_id, name, key, is_active, created_at, last_used_at
            """,
            key,
        )
        return dict(row) if row else None


async def get_active_api_key_count(user_id: UUID) -> int:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM api_keys
            WHERE user_id = $1 AND is_active = TRUE
            """,
            user_id,
        )
