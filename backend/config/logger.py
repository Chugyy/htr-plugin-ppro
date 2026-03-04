#!/usr/bin/env python3
# config/logger.py

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Import settings (but handle circular import)
try:
    from config.config import settings
    LOG_LEVEL = logging.DEBUG if settings.debug else logging.INFO
    APP_NAME = settings.app_name
except ImportError:
    LOG_LEVEL = logging.INFO
    APP_NAME = "HTR Pr. Plugin Backend"

LOG_FORMAT = "%(asctime)s — %(name)s — %(levelname)s — %(message)s"
LOG_FILE = Path("logs/app.log")

# Create logs directory if it doesn't exist
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

formatter = logging.Formatter(LOG_FORMAT)

# Handler pour fichier
file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5
)
file_handler.setFormatter(formatter)

# Handler pour console/terminal
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(formatter)

# Logger principal
logger = logging.getLogger(APP_NAME)
logger.setLevel(LOG_LEVEL)
logger.addHandler(file_handler)
logger.addHandler(console_handler)

# Prevent duplicate logs
logger.propagate = False
