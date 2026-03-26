#!/usr/bin/env python3
# app/main.py

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config.config import settings
from config.logger import logger
import uvicorn


async def _cleanup_temp_loop():
    """Periodically delete files older than 1 hour from the temp directory."""
    import asyncio
    import time
    MAX_AGE_SECONDS = 3600  # 1 hour
    INTERVAL = 600          # check every 10 minutes

    while True:
        await asyncio.sleep(INTERVAL)
        try:
            now = time.time()
            count = 0
            for f in settings.temp_dir.iterdir():
                if f.is_file() and (now - f.stat().st_mtime) > MAX_AGE_SECONDS:
                    f.unlink()
                    count += 1
            if count:
                logger.info(f"[CLEANUP] Deleted {count} stale file(s) from {settings.temp_dir}")
        except Exception as e:
            logger.warning(f"[CLEANUP] Error: {e}")


async def _cleanup_unverified_users_loop():
    """Periodically delete unverified users older than 7 days."""
    import asyncio
    INTERVAL = 3600  # check every hour

    while True:
        await asyncio.sleep(INTERVAL)
        try:
            from app.core.jobs.user import cleanup_unverified_users
            await cleanup_unverified_users(max_age_days=7)
        except Exception as e:
            logger.warning(f"[CLEANUP] Unverified users error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    # Startup: init DB pool + run migrations
    from app.database.db import init_db_pool, init_db, close_db_pool
    await init_db_pool()
    await init_db()
    # Start background cleanup tasks
    cleanup_temp = asyncio.create_task(_cleanup_temp_loop())
    cleanup_users = asyncio.create_task(_cleanup_unverified_users_loop())
    logger.info("Application started")
    yield
    # Shutdown
    cleanup_temp.cancel()
    cleanup_users.cancel()
    await close_db_pool()
    logger.info("Application stopped")


app = FastAPI(
    title=settings.app_name,
    description="Backend for Premiere Pro HTR Edit Plugin",
    version="2.0.0",
    debug=settings.debug,
    response_model_by_alias=True,
    lifespan=lifespan,
)

# CORS
allowed_origins = [
    "http://localhost:3000",
    "http://localhost:5001",
    settings.dashboard_url,
]
if settings.debug:
    allowed_origins.append("http://localhost:*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Existing routers (audio processing) ---
from app.api.routes import health, audio, auth, tasks, color, plugin
app.include_router(health.router)
app.include_router(auth.router)       # legacy static key auth
app.include_router(audio.router)
app.include_router(color.router)
app.include_router(plugin.router)
app.include_router(tasks.router)

# --- New SaaS routers ---
from app.api.routes import user, api_key, usage, plans, team
from app.api.routes.subscription import billing_router, webhook_router

app.include_router(user.router)
app.include_router(api_key.router)
app.include_router(billing_router)
app.include_router(webhook_router)
app.include_router(usage.router)
app.include_router(plans.router)
app.include_router(team.router)


@app.get("/")
async def root():
    return {
        "message": "HTR Edit API",
        "docs": "/docs",
        "health": "/health"
    }


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=settings.debug, factory=False)
