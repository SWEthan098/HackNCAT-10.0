from __future__ import annotations

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str | None = None


class ErrorResponse(BaseModel):
    """Shape of every non-2xx response (see core/errors.py)."""

    error: ErrorBody


# Reusable OpenAPI `responses=` entries so Swagger documents error shapes.
AUTH_ERRORS = {401: {"model": ErrorResponse, "description": "Missing, invalid or expired bearer token"}}
VALIDATION_ERRORS = {422: {"model": ErrorResponse, "description": "Request body failed validation"}}
