# app/database/crud/team.py

import asyncpg
from datetime import datetime
from typing import Optional
from app.database.db import get_db_pool


async def create_team(owner_id: str, seat_count: int) -> dict:
    """INSERT teams + team_members (owner) in a single transaction."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            team = await conn.fetchrow(
                """
                INSERT INTO teams (owner_id, seat_count)
                VALUES ($1, $2)
                RETURNING id, owner_id, seat_count, created_at
                """,
                owner_id, seat_count
            )
            await conn.fetchrow(
                """
                INSERT INTO team_members (team_id, user_id, role)
                VALUES ($1, $2, 'owner')
                RETURNING id, joined_at
                """,
                team["id"], owner_id
            )
    return dict(team)


async def get_team_by_owner(owner_id: str) -> Optional[dict]:
    """SELECT team by owner_id. Returns None if not found."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, owner_id, seat_count, created_at
            FROM teams
            WHERE owner_id = $1
            """,
            owner_id
        )
    return dict(row) if row else None


async def get_team_with_member_count(team_id: int) -> Optional[dict]:
    """SELECT team + member count aggregate."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT t.id, t.owner_id, t.seat_count, t.created_at,
                   COUNT(tm.id)::int AS member_count
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id
            WHERE t.id = $1
            GROUP BY t.id
            """,
            team_id
        )
    return dict(row) if row else None


async def list_team_members(team_id: int, month: Optional[datetime] = None) -> list[dict]:
    """SELECT members with usage aggregate for a given month (default: current month)."""
    if month is None:
        month = datetime.utcnow()
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT
                tm.user_id,
                u.name,
                u.email,
                tm.role,
                tm.joined_at,
                COUNT(us.id)::int AS usage_this_month
            FROM team_members tm
            JOIN users u ON u.id = tm.user_id
            LEFT JOIN usage us ON us.user_id = tm.user_id
                AND date_trunc('month', us.created_at) = date_trunc('month', $2::timestamptz)
            WHERE tm.team_id = $1
            GROUP BY tm.user_id, u.name, u.email, tm.role, tm.joined_at
            ORDER BY tm.joined_at ASC
            """,
            team_id, month
        )
    return [dict(row) for row in rows]


async def add_team_member(team_id: int, user_id: str, role: str = "member") -> dict:
    """INSERT team_members row."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO team_members (team_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING id, team_id, user_id, role, joined_at
            """,
            team_id, user_id, role
        )
    return dict(row)


async def remove_team_member(team_id: int, user_id: str) -> bool:
    """DELETE team_members row. Returns True if deleted, False if not found.
    Does NOT check owner guard — caller is responsible."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            DELETE FROM team_members
            WHERE team_id = $1 AND user_id = $2
            RETURNING id
            """,
            team_id, user_id
        )
    return row is not None


async def update_team_seat_count(team_id: int, seat_count: int) -> None:
    """UPDATE teams.seat_count."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE teams SET seat_count = $2 WHERE id = $1",
            team_id, seat_count
        )


async def get_team_member(team_id: int, user_id: str) -> Optional[dict]:
    """SELECT single team_members row."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, team_id, user_id, role, joined_at
            FROM team_members
            WHERE team_id = $1 AND user_id = $2
            """,
            team_id, user_id
        )
    return dict(row) if row else None


async def create_team_invite(
    team_id: int, email: str, token_hash: str, expires_at: datetime
) -> dict:
    """INSERT team_invites row."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO team_invites (team_id, email, token_hash, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id, team_id, email, expires_at, created_at
            """,
            team_id, email, token_hash, expires_at
        )
    return dict(row)


async def get_team_invite_by_token(token_hash: str) -> Optional[dict]:
    """SELECT unused, non-expired invite by token_hash."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, team_id, email, expires_at, used_at
            FROM team_invites
            WHERE token_hash = $1
              AND used_at IS NULL
              AND expires_at > NOW()
            """,
            token_hash
        )
    return dict(row) if row else None


async def mark_invite_used(invite_id: int) -> None:
    """UPDATE team_invites.used_at = NOW()."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE team_invites SET used_at = NOW() WHERE id = $1",
            invite_id
        )


async def get_pending_invites(team_id: int) -> list[dict]:
    """SELECT all unused, non-expired invites for a team."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, team_id, email, expires_at, created_at
            FROM team_invites
            WHERE team_id = $1
              AND used_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            """,
            team_id
        )
    return [dict(row) for row in rows]


async def deactivate_user_api_keys(user_id: str) -> int:
    """UPDATE api_keys SET is_active=false for user. Returns count of deactivated keys."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            UPDATE api_keys
            SET is_active = FALSE
            WHERE user_id = $1 AND is_active = TRUE
            RETURNING id
            """,
            user_id
        )
    return len(rows)
