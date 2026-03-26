# app/database/crud/user.py

import asyncpg
from datetime import datetime
from typing import Optional
from app.database.db import get_db_pool


async def insert_user(
    email: str,
    password_hash: str,
    name: str,
    stripe_customer_id: str,
    plan: str = "free",
    normalized_email: str = "",
) -> dict:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, name, stripe_customer_id, plan, subscription_status, normalized_email, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
            RETURNING id, email, name, plan, subscription_status, stripe_customer_id, created_at
            """,
            email, password_hash, name, stripe_customer_id, plan, normalized_email or email.strip().lower(),
        )
        return dict(row)


async def get_user_by_email(email: str) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, password_hash, name, plan, subscription_status,
                   stripe_customer_id, current_period_end, created_at
            FROM users
            WHERE email = $1
            """,
            email,
        )
        return dict(row) if row else None


async def get_user_by_id(user_id: str) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, name, plan, subscription_status,
                   stripe_customer_id, stripe_subscription_id,
                   current_period_end, cancel_at_period_end,
                   payment_failed_at, seat_count, had_trial, created_at
            FROM users
            WHERE id = $1
            """,
            user_id,
        )
        return dict(row) if row else None


async def get_user_by_stripe_subscription_id(stripe_subscription_id: str) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, name, plan, subscription_status,
                   stripe_customer_id, stripe_subscription_id, current_period_end, created_at
            FROM users
            WHERE stripe_subscription_id = $1
            """,
            stripe_subscription_id,
        )
        return dict(row) if row else None


async def update_user_password(user_id: str, password_hash: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE users
            SET password_hash = $1, updated_at = NOW()
            WHERE id = $2
            """,
            password_hash, user_id,
        )


async def update_user_subscription(user_id: str, fields: dict) -> None:
    """Generic UPDATE for Stripe webhook fields.

    Allowed keys: plan, subscription_status, stripe_subscription_id,
    stripe_subscription_item_id, current_period_end, cancel_at_period_end,
    payment_failed_at, seat_count.
    """
    if not fields:
        return

    ALLOWED = {
        "plan", "subscription_status", "stripe_subscription_id",
        "stripe_subscription_item_id", "current_period_end",
        "cancel_at_period_end", "payment_failed_at", "seat_count",
        "had_trial",
    }
    filtered = {k: v for k, v in fields.items() if k in ALLOWED}
    if not filtered:
        return

    set_clauses = ", ".join(
        f"{col} = ${i + 1}" for i, col in enumerate(filtered)
    )
    values = list(filtered.values())
    values.append(user_id)

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            f"UPDATE users SET {set_clauses}, updated_at = NOW() WHERE id = ${len(values)}",
            *values,
        )


async def insert_password_reset_token(
    user_id: str,
    token_hash: str,
    expires_at: datetime,
) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "DELETE FROM password_reset_tokens WHERE user_id = $1",
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
                """,
                user_id, token_hash, expires_at,
            )


async def get_password_reset_token(token_hash: str) -> Optional[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT user_id, expires_at, used
            FROM password_reset_tokens
            WHERE token_hash = $1
            """,
            token_hash,
        )
        return dict(row) if row else None


async def delete_password_reset_token(token_hash: str) -> None:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM password_reset_tokens WHERE token_hash = $1",
            token_hash,
        )


async def delete_expired_password_reset_tokens() -> int:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM password_reset_tokens WHERE expires_at < NOW()"
        )
        # asyncpg returns "DELETE N" as a string
        return int(result.split()[-1])
