#!/usr/bin/env python3
# app/api/routes/plugin.py

import logging
from fastapi import APIRouter, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import Response
from config.config import settings
from app.database.db import get_db_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plugin", tags=["plugin"])

UPLOAD_SECRET = "htr-plugin-upload-2026"


@router.get("/download")
async def download_plugin():
    """Serve the latest .ccx plugin file from DB."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT filename, file_data FROM plugin_versions ORDER BY uploaded_at DESC LIMIT 1"
        )

    if not row:
        raise HTTPException(status_code=404, detail="No plugin version available")

    return Response(
        content=bytes(row["file_data"]),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{row["filename"]}"'},
    )


@router.get("/latest")
async def get_latest_version():
    """Return info about the latest plugin version (without file data)."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, version, filename, file_size, uploaded_at FROM plugin_versions ORDER BY uploaded_at DESC LIMIT 1"
        )

    if not row:
        raise HTTPException(status_code=404, detail="No plugin version available")

    return {
        "version": row["version"],
        "filename": row["filename"],
        "fileSize": row["file_size"],
        "uploadedAt": row["uploaded_at"].isoformat(),
    }


@router.post("/upload")
async def upload_plugin(
    file: UploadFile = File(...),
    version: str = Form(...),
    secret: str = Header(alias="X-Upload-Secret"),
):
    """Upload a new .ccx plugin version. Protected by a shared secret."""
    if secret != UPLOAD_SECRET:
        raise HTTPException(status_code=403, detail="Invalid upload secret")

    content = await file.read()
    filename = file.filename or "htr-plugin.ccx"
    file_size = len(content)

    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO plugin_versions (version, filename, file_data, file_size) VALUES ($1, $2, $3, $4)",
            version, filename, content, file_size,
        )

    logger.info(f"[PLUGIN] Uploaded v{version} ({file_size / 1024:.1f} KB)")
    return {"version": version, "filename": filename, "fileSize": file_size}
