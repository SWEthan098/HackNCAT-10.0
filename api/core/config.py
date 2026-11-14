"""Centralized, typed configuration read from environment variables.

Locally, values come from api/.env (loaded in main.py). On Railway they are injected directly.
Never log the secret fields; `Settings.public_summary()` is the only safe view.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _optional_float(name: str) -> float | None:
    raw = os.getenv(name, "").strip()
    try:
        return float(raw) if raw else None
    except ValueError:
        return None


@dataclass(frozen=True)
class Settings:
    environment: str = "development"
    log_level: str = "INFO"
    enable_docs: bool = True
    allowed_origins: list[str] = field(default_factory=list)

    # Supabase (server side only)
    supabase_url: str = ""
    supabase_service_role_key: str = field(default="", repr=False)
    supabase_jwt_secret: str = field(default="", repr=False)

    # AI
    ai_provider: str = "groq"
    ai_model: str = ""
    ai_timeout_seconds: float = 30.0
    ai_max_retries: int = 2
    ai_max_output_tokens: int = 1024
    ai_price_input_per_mtok: float | None = None
    ai_price_output_per_mtok: float | None = None
    groq_api_key: str = field(default="", repr=False)
    anthropic_api_key: str = field(default="", repr=False)
    anthropic_effort: str = "medium"

    # Kairos: True forces the scripted Red Team chain + analyst onto deterministic mocks.
    # /attack ALWAYS uses the real model (honest offline state if it is unreachable).
    demo_mode: bool = False

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def public_summary(self) -> dict:
        """Configuration safe to expose: presence flags only, never secret values."""
        return {
            "environment": self.environment,
            "docs_enabled": self.enable_docs,
            "supabase_url_set": bool(self.supabase_url),
            "service_role_key_set": bool(self.supabase_service_role_key),
            "ai_provider": self.ai_provider,
            "ai_model": self.ai_model or None,
            "groq_api_key_set": bool(self.groq_api_key),
            "anthropic_api_key_set": bool(self.anthropic_api_key),
            "demo_mode": self.demo_mode,
        }


@lru_cache
def get_settings() -> Settings:
    environment = os.getenv("ENVIRONMENT", "development").strip().lower() or "development"
    origins = [o.strip().rstrip("/") for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    return Settings(
        environment=environment,
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        # Swagger is on in development and off in production unless explicitly enabled.
        enable_docs=_bool("ENABLE_DOCS", environment != "production"),
        allowed_origins=origins,
        supabase_url=os.getenv("SUPABASE_URL", "").strip().rstrip("/"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip(),
        supabase_jwt_secret=os.getenv("SUPABASE_JWT_SECRET", "").strip(),
        ai_provider=os.getenv("AI_PROVIDER", "groq").strip().lower() or "groq",
        ai_model=os.getenv("AI_MODEL", "").strip(),
        ai_timeout_seconds=_float("AI_TIMEOUT_SECONDS", 30.0),
        ai_max_retries=max(0, min(_int("AI_MAX_RETRIES", 2), 5)),
        ai_max_output_tokens=max(1, _int("AI_MAX_OUTPUT_TOKENS", 1024)),
        ai_price_input_per_mtok=_optional_float("AI_PRICE_INPUT_PER_MTOK"),
        ai_price_output_per_mtok=_optional_float("AI_PRICE_OUTPUT_PER_MTOK"),
        groq_api_key=os.getenv("GROQ_API_KEY", "").strip(),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", "").strip(),
        anthropic_effort=os.getenv("ANTHROPIC_EFFORT", "medium").strip().lower() or "medium",
        demo_mode=_bool("DEMO_MODE", False),
    )
