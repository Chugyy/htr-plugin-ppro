#!/usr/bin/env python3
# app/api/routes/plugin.py

from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(prefix="/plugin", tags=["plugin"])

PLUGIN_DIR = Path(__file__).resolve().parents[3] / "static"
PLUGIN_FILE = PLUGIN_DIR / "htr-plugin.ccx"


@router.get("/download")
async def download_plugin():
    """Serve the latest .ccx plugin file."""
    if not PLUGIN_FILE.exists():
        return {"error": "Plugin file not found"}, 404

    return FileResponse(
        path=PLUGIN_FILE,
        filename="htr-plugin.ccx",
        media_type="application/octet-stream",
    )
