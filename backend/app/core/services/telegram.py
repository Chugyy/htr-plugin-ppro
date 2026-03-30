#!/usr/bin/env python3
# app/core/services/telegram.py

"""
Lightweight Telegram Bot API client for bug report notifications.
Uses urllib (no extra dependency).
"""

import json
import urllib.request
from config.config import settings
from config.logger import logger


def send_bug_report_notification(
    report_id: int,
    feature: str,
    error_message: str,
    system_info: dict | None = None,
    project_state: dict | None = None,
) -> None:
    """Send a Telegram notification for a new bug report. Silent on failure."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return

    ppro_version = (system_info or {}).get("hostVersion", "?")
    plugin_version = (system_info or {}).get("pluginVersion", "?")
    os_info = (system_info or {}).get("os", "?")
    sequence = (project_state or {}).get("sequenceName", "?")

    text = (
        f"🐛 *Bug Report #{report_id}*\n"
        f"\n"
        f"*Feature:* `{feature}`\n"
        f"*Error:* {_escape_md(error_message[:200])}\n"
        f"*Sequence:* {_escape_md(sequence)}\n"
        f"*PPro:* {ppro_version} | *Plugin:* {plugin_version} | *OS:* {os_info}\n"
        f"\n"
        f"📋 `GET /bug-reports/{report_id}`"
    )

    try:
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": settings.telegram_chat_id,
            "text": text,
            "parse_mode": "Markdown",
        }).encode("utf-8")

        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            resp.read()

        logger.info(f"[TELEGRAM] Bug report #{report_id} notification sent")
    except Exception as e:
        logger.warning(f"[TELEGRAM] Failed to send notification: {e}")


def _escape_md(text: str) -> str:
    """Escape Markdown special characters for Telegram."""
    for ch in ("_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!"):
        text = text.replace(ch, f"\\{ch}")
    return text
