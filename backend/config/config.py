#!/usr/bin/env python3
# config/config.py

from pydantic import Field
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    """Application settings for HTR Pr. Plugin Backend"""

    # Application
    app_name: str = Field("HTR Pr. Plugin Backend", env="APP_NAME")
    debug: bool = Field(True, env="DEBUG")

    # API Security
    api_key: str = Field("audio-assistant-dev-key-2026", env="API_KEY")

    # Server
    host: str = Field("127.0.0.1", env="HOST")
    port: int = Field(5001, env="PORT")

    # Paths
    temp_dir: Path = Field(Path("temp"), env="TEMP_DIR")

    # Corrector Service
    corrector_url: str = Field("http://localhost:8080", env="CORRECTOR_URL")

    # Transcription Services
    assemblyai_api_key: str = Field("", env="ASSEMBLYAI_API_KEY")

    # LLM Services
    anthropic_api_key: str = Field("", env="ANTHROPIC_API_KEY")
    openai_api_key: str = Field("", env="OPENAI_API_KEY")
    llm_primary_model: str = Field("claude-sonnet-4-5-20250929", env="LLM_PRIMARY_MODEL")
    llm_fallback_model: str = Field("gpt-4o", env="LLM_FALLBACK_MODEL")
    llm_max_retries: int = Field(3, env="LLM_MAX_RETRIES")

    class Config:
        env_file = "config/.env"
        case_sensitive = False
        env_file_encoding = "utf-8"

settings = Settings()

# Convert temp_dir to absolute path and create if doesn't exist
settings.temp_dir = settings.temp_dir.resolve()
settings.temp_dir.mkdir(parents=True, exist_ok=True)
