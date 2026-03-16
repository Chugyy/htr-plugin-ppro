#!/usr/bin/env python3
# app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import health, audio, auth, tasks
from config.config import settings
from config.logger import logger
import uvicorn

app = FastAPI(
    title=settings.app_name,
    description="Backend for Premiere Pro HTR Pr. Plugin",
    version="1.0.0",
    debug=settings.debug,
    response_model_by_alias=True
)

# CORS (for frontend localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(audio.router)
app.include_router(tasks.router)

@app.get("/")
async def root():
    return {
        "message": "HTR Pr. Plugin API",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    uvicorn.run ("app.main:app", host=settings.host, port=settings.port, reload=settings.debug, factory=False)