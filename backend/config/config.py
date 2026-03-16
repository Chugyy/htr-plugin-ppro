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

    # Audio Optimization
    max_concurrent_ffmpeg: int = Field(4, env="MAX_CONCURRENT_FFMPEG")
    chunk_duration_seconds: int = Field(60, env="CHUNK_DURATION_SECONDS")

    # Queue & Concurrency
    max_concurrent_transcriptions: int = Field(2, env="MAX_CONCURRENT_TRANSCRIPTIONS")
    max_concurrent_optimizations: int = Field(2, env="MAX_CONCURRENT_OPTIMIZATIONS")
    max_queue_size: int = Field(10, env="MAX_QUEUE_SIZE")

    # Rate Limiting
    rate_limit_transcription: int = Field(5, env="RATE_LIMIT_TRANSCRIPTION_PER_MIN")
    rate_limit_correction: int = Field(20, env="RATE_LIMIT_CORRECTION_PER_MIN")
    rate_limit_optimization: int = Field(5, env="RATE_LIMIT_OPTIMIZATION_PER_MIN")
    rate_limit_upload: int = Field(10, env="RATE_LIMIT_UPLOAD_PER_MIN")

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
