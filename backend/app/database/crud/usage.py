# app/database/crud/usage.py

import uuid
from typing import Optional

from app.database.db import get_db_pool

FEATURES = ("transcription", "correction", "derushing", "normalization", "color_correction")


async def track_usage(user_id: uuid.UUID, api_key_id: int, feature: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO usage (user_id, api_key_id, feature) VALUES ($1, $2, $3)",
            user_id, api_key_id, feature,
        )


async def get_current_usage(
    user_id: uuid.UUID,
    api_key_id: Optional[int] = None,
) -> dict:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        if api_key_id is None:
            rows = await conn.fetch(
                """
                SELECT feature, COUNT(*) AS used
                FROM usage
                WHERE user_id = $1
                  AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
                GROUP BY feature
                """,
                user_id,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT feature, COUNT(*) AS used
                FROM usage
                WHERE user_id = $1
                  AND api_key_id = $2
                  AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
                GROUP BY feature
                """,
                user_id, api_key_id,
            )

    counts = {row["feature"]: int(row["used"]) for row in rows}
    return {feature: counts.get(feature, 0) for feature in FEATURES}


async def count_feature_usage(user_id: uuid.UUID, feature: str) -> int:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT COUNT(*) AS used
            FROM usage
            WHERE user_id = $1
              AND feature = $2
              AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
            """,
            user_id, feature,
        )
    return int(row["used"])


async def record_stripe_event(event_id: str, event_type: str) -> bool:
    """Insert stripe event for idempotency. Returns False if already processed."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "INSERT INTO stripe_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING",
            event_id,
        )
    # asyncpg returns "INSERT 0 N" — N=0 means conflict, N=1 means inserted
    return result == "INSERT 0 1"


async def check_stripe_event_processed(event_id: str) -> bool:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT event_id FROM stripe_events WHERE event_id = $1",
            event_id,
        )
    return row is not None
