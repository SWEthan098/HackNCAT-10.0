"""FastAPI entry point. Routes live in routers/, one module per feature.

Run locally:  uvicorn main:app --reload --port 8000   (Swagger at /docs in development)
"""

import os

from dotenv import load_dotenv

# Reads api/.env locally; Railway injects env vars directly. Tests set API_SKIP_DOTENV=1 so
# a developer's real credentials are never loaded into the test process.
if os.getenv("API_SKIP_DOTENV") != "1":
    load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from core.config import get_settings  # noqa: E402
from core.errors import install_error_handlers  # noqa: E402
from core.request_log import RequestLogMiddleware, configure_logging  # noqa: E402
from routers import (  # noqa: E402
    agents,
    ai,
    analyst,
    appeals,
    approvals,
    attack,
    audit,
    demo,
    health,
    incidents,
    me,
    playground,
    redteam,
    sensors,
    stats,
)

TAGS = [
    {"name": "health", "description": "Liveness and readiness. No auth."},
    {"name": "me", "description": "The signed-in user's identity and profile. Bearer auth."},
    {"name": "ai", "description": "Provider-neutral AI endpoints. Bearer auth."},
    # Kairos. Owners in CODEOWNERS / docs/KAIROS.md. FROZEN: every router is registered here once.
    {"name": "attack", "description": "Audience attack page backend. Public. Owner: Ethan."},
    {"name": "analyst", "description": "Victim agent run + AI security analyst. Owner: Ethan."},
    {"name": "sensors", "description": "Login Guard + Comms Guard. Owner: Miles."},
    {"name": "redteam", "description": "Scripted Red Team chain. Owner: Miles."},
    {"name": "playground", "description": "Audience Attack Picker. Public. Owner: Miles."},
    {"name": "incidents", "description": "Correlated incidents. Owner: Daylen."},
    {"name": "approvals", "description": "Human approvals. Owner: Daylen."},
    {"name": "appeals", "description": "Appeals against blocks. Owner: Daylen."},
    {"name": "audit", "description": "Tamper-evident audit log. Owner: Daylen."},
    {"name": "agents", "description": "Kill switch and agent freeze. Owner: Daylen."},
    {"name": "stats", "description": "KPI numbers. Owner: Daylen."},
    {"name": "demo", "description": "Demo reset. Owner: Daylen."},
]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)
    app = FastAPI(
        title="Kairos API",
        version="0.2.0",
        description="Authenticate with `Authorization: Bearer <Supabase access token>`. "
        'Errors always use `{"error": {"code", "message", "request_id"}}`.',
        openapi_tags=TAGS,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        # Auth uses a bearer header, not cookies, so credentials are not needed cross-origin.
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
        expose_headers=["X-Request-Id"],
    )
    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(me.router)
    app.include_router(ai.router)
    for module in (
        attack,
        analyst,
        sensors,
        redteam,
        playground,
        incidents,
        approvals,
        appeals,
        audit,
        agents,
        stats,
        demo,
    ):
        app.include_router(module.router)
    return app


app = create_app()
