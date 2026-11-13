"""Verify Supabase access tokens sent by the frontend as `Authorization: Bearer <jwt>`.

Supports both Supabase signing modes:
- Legacy shared secret (HS256): verified with SUPABASE_JWT_SECRET.
- Asymmetric signing keys (ES256/RS256): verified against the project's JWKS endpoint.
The token header's `alg` decides which path is used. Signature, expiry and audience are
always checked; the error returned to the client never includes the token.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from core.config import get_settings

AUDIENCE = "authenticated"
bearer = HTTPBearer(auto_error=False, description="Supabase access token")
logger = logging.getLogger("api.auth")


@dataclass(frozen=True)
class AuthUser:
    id: str
    email: str | None
    role: str | None
    claims: dict


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=600)


def verify_token(token: str) -> dict:
    settings = get_settings()
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience=AUDIENCE)
    if alg in ("ES256", "RS256"):
        if not settings.supabase_url:
            raise jwt.InvalidTokenError("SUPABASE_URL is not set")
        key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=[alg], audience=AUDIENCE)
    raise jwt.InvalidTokenError(f"Unsupported alg: {alg}")


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, message, headers={"WWW-Authenticate": "Bearer"})


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> AuthUser:
    """FastAPI dependency: the verified Supabase user. Raises 401 otherwise."""
    if creds is None:
        raise _unauthorized("Missing bearer token")
    try:
        claims = verify_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired") from None
    except (jwt.PyJWTError, KeyError) as e:
        logger.info("Rejected token: %s", type(e).__name__)
        raise _unauthorized("Invalid token") from None
    sub = claims.get("sub")
    if not sub:
        raise _unauthorized("Invalid token")
    return AuthUser(id=sub, email=claims.get("email"), role=claims.get("role"), claims=claims)
