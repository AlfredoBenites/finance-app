"""Loads backend settings from environment variables.

Locally, secrets live in the repo-root .env.local (gitignored). We point
pydantic-settings at that file so `uvicorn` can be run from the backend/ folder
and still find it.

On a deployed server there is no .env.local — the values come from real
environment variables instead (see deploy/finance-api.service). A missing env
file is not an error, and real environment variables take precedence over it,
so the same code runs in both places without a switch.
"""
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[2] is the repo root, where .env.local lives.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    finnhub_api_key: str = ""  # stock quotes; crypto uses CoinGecko (no key)

    # Comma-separated list of sites allowed to call this API from a browser,
    # e.g. "https://myapp.com,https://www.myapp.com". Local development is
    # always allowed on top of this (see main.py), so it stays empty in dev.
    frontend_origins: str = ""

    # Serve the interactive /docs page. Handy locally; off in production so the
    # API surface isn't advertised (every endpoint still requires a token).
    enable_docs: bool = True

    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> List[str]:
        """frontend_origins parsed into a list, ignoring blanks/whitespace."""
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]


settings = Settings()
