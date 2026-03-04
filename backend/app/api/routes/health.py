#!/usr/bin/env python3
# app/api/routes/health.py

from fastapi import APIRouter

router = APIRouter(tags=["health"])

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}