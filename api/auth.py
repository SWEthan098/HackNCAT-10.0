"""Verify Supabase access tokens sent by the frontend as `Authorization: Bearer <jwt>`.

Supports both Supabase signing modes:
- Legacy shared secret (HS256): verified with SUPABASE_JWT_SECRET.
- Asymmetric signing keys (ES256/RS256): verified against the project's JWKS endpoint.
The token header's `alg` decides which path is used.
"""

import os
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

AUDIENCE = "authenticated"
bearer = HTTPBearer(auto_error=False)


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    return jwt.PyJWKClient(f"{url}/auth/v1/.well-known/jwks.json")


def verify_token(token: str) -> dict:
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":
        secret = os.environ.get("SUPABASE_JWT_SECRET")
        if not secret:
            raise jwt.InvalidTokenError("SUPABASE_JWT_SECRET is not set")
        return jwt.decode(token, secret, algorithms=["HS256"], audience=AUDIENCE)
    if alg in ("ES256", "RS256"):
        key = _jwks_client().get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=[alg], audience=AUDIENCE)
    raise jwt.InvalidTokenError(f"Unsupported alg: {alg}")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """FastAPI dependency: returns the verified JWT claims (`sub` is the user id)."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    try:
        return verify_token(creds.credentials)
    except (jwt.PyJWTError, KeyError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
