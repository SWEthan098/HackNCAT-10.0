"""Reusable Supabase access.

The service-role client bypasses Row Level Security. Every query made with it MUST be
scoped to the authenticated user (e.g. `.eq("id", user.id)`). Never return it to callers
outside the API, and never expose the key to the frontend.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from core.config import get_settings
from core.errors import AppError


@lru_cache
def supabase_admin() -> Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise AppError(503, "database_not_configured", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set")
    return create_client(s.supabase_url, s.supabase_service_role_key)


def get_db() -> Client:
    """FastAPI dependency. Override in tests with app.dependency_overrides[get_db]."""
    return supabase_admin()
