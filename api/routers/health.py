from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.db import supabase_admin

router = APIRouter(tags=["health"])
logger = logging.getLogger("api")


@router.get("/health", summary="Liveness check", description="Always 200 while the process is up. No auth.")
def health():
    return {"status": "ok"}


@router.get(
    "/health/ready",
    summary="Readiness check",
    description="Checks database connectivity (503 if unreachable). No auth. Outside production it also "
    "returns configuration presence flags (never secret values).",
)
def ready():
    settings = get_settings()
    checks: dict = {"database": "unknown"}
    if not settings.is_production:
        # Presence flags help locally; in production this endpoint is public, so keep it minimal.
        checks["config"] = settings.public_summary()
    ok = True
    try:
        supabase_admin().table("profiles").select("id", count="exact").limit(1).execute()
        checks["database"] = "ok"
    except Exception as e:  # report the failure class only
        logger.warning("readiness: database check failed (%s)", type(e).__name__)
        checks["database"] = f"error: {type(e).__name__}"
        ok = False
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks}, status_code=200 if ok else 503)
