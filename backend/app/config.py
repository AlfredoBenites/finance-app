"""Loads backend settings from environment variables.

Secrets live in the repo-root .env.local (gitignored). We point pydantic-settings
at that file so `uvicorn` can be run from the backend/ folder and still find it.
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[2] is the repo root, where .env.local lives.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
