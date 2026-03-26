# tests/test_crud/conftest.py

import asyncio
import uuid

import asyncpg
import pytest

from config.config import settings


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
async def pool():
    p = await asyncpg.create_pool(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password,
        min_size=2,
        max_size=5,
    )
    yield p
    await p.close()


@pytest.fixture
async def test_user(pool):
    """Create a transient user for each test; deleted on teardown."""
    user_id = uuid.uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name)
            VALUES ($1, $2, $3, $4)
            """,
            user_id,
            f"test_{user_id}@example.com",
            "hashed",
            "Test User",
        )
    yield user_id
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)
