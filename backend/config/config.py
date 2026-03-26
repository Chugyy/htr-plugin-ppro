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
    production: bool = Field(False, env="PRODUCTION")

    # Database
    db_host: str = Field("localhost", env="DB_HOST")
    db_port: int = Field(5432, env="DB_PORT")
    db_name: str = Field("htr_plugin", env="DB_NAME")
    db_user: str = Field("postgres", env="DB_USER")
    db_password: str = Field("", env="DB_PASSWORD")

    # JWT
    jwt_secret_key: str = Field("change-me-in-production", env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field("HS256", env="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(168, env="JWT_EXPIRATION_HOURS")  # 7 days

    # Stripe
    stripe_secret_key: str = Field("", env="STRIPE_SECRET_KEY")
    stripe_publishable_key: str = Field("", env="STRIPE_PUBLISHABLE_KEY")
    stripe_webhook_secret: str = Field("", env="STRIPE_WEBHOOK_SECRET")
    stripe_price_starter_monthly: str = Field("", env="STRIPE_PRICE_STARTER_MONTHLY")
    stripe_price_starter_annual: str = Field("", env="STRIPE_PRICE_STARTER_ANNUAL")
    stripe_price_pro_monthly: str = Field("", env="STRIPE_PRICE_PRO_MONTHLY")
    stripe_price_pro_annual: str = Field("", env="STRIPE_PRICE_PRO_ANNUAL")
    stripe_price_agency_monthly: str = Field("", env="STRIPE_PRICE_AGENCY_MONTHLY")

    # SMTP
    smtp_host: str = Field("", env="SMTP_HOST")
    smtp_port: int = Field(587, env="SMTP_PORT")
    smtp_user: str = Field("", env="SMTP_USER")
    smtp_password: str = Field("", env="SMTP_PASSWORD")
    smtp_from_email: str = Field("noreply@hittherecord.com", env="SMTP_FROM_EMAIL")
    smtp_from_name: str = Field("HTR Edit", env="SMTP_FROM_NAME")

    # URLs
    dashboard_url: str = Field("http://localhost:3000", env="DASHBOARD_URL")
    api_url: str = Field("http://localhost:5001", env="API_URL")

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
    rate_limit_transcription: int = Field(50, env="RATE_LIMIT_TRANSCRIPTION_PER_MIN")
    rate_limit_correction: int = Field(100, env="RATE_LIMIT_CORRECTION_PER_MIN")
    rate_limit_optimization: int = Field(50, env="RATE_LIMIT_OPTIMIZATION_PER_MIN")
    rate_limit_upload: int = Field(100, env="RATE_LIMIT_UPLOAD_PER_MIN")

    # Student program
    student_emails: str = Field("", env="STUDENT_EMAILS")  # comma-separated emails
    student_coupon_id: str = Field("STUDENT_6M_FREE", env="STUDENT_COUPON_ID")

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
