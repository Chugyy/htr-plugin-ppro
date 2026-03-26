# db.py - Database Connection Pool Management

import asyncpg
from typing import Optional
from config.logger import logger
from config.config import settings


_db_pool: Optional[asyncpg.Pool] = None


async def init_db_pool():
    global _db_pool
    if _db_pool is not None:
        return _db_pool

    try:
        _db_pool = await asyncpg.create_pool(
            host=settings.db_host,
            port=settings.db_port,
            database=settings.db_name,
            user=settings.db_user,
            password=settings.db_password,
            min_size=5,
            max_size=20,
            command_timeout=60
        )
        logger.info("Database connection pool initialized")
        return _db_pool
    except Exception as e:
        logger.error(f"Failed to initialize database pool: {e}")
        raise


async def get_db_pool() -> asyncpg.Pool:
    global _db_pool
    if _db_pool is None:
        await init_db_pool()
    return _db_pool


async def close_db_pool():
    global _db_pool
    if _db_pool:
        await _db_pool.close()
        _db_pool = None
        logger.info("Database pool closed")


async def get_async_db_connection():
    return await asyncpg.connect(
        host=settings.db_host,
        port=settings.db_port,
        database=settings.db_name,
        user=settings.db_user,
        password=settings.db_password
    )


async def init_db():
    from app.database.migrations import run_pending_migrations
    logger.info("Initializing database...")
    try:
        await run_pending_migrations()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
