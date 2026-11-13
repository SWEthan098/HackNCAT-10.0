"""The authenticated user's own account and profile.

All queries use the service-role client, so every one is scoped to `user.id` from the
verified JWT. Never take a user id from the request body or path here.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from supabase import Client

from auth import AuthUser, current_user
from core.db import get_db
from core.errors import AppError
from schemas.common import AUTH_ERRORS, VALIDATION_ERRORS
from schemas.profile import MeResponse, Profile, ProfileUpdate

router = APIRouter(prefix="/me", tags=["me"])


def get_or_create_profile(db: Client, user_id: str) -> dict:
    """Return the user's profile, creating it idempotently if the signup trigger never ran."""
    res = db.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if res.data:
        return res.data[0]
    # on_conflict + ignore_duplicates makes this safe under concurrent requests.
    db.table("profiles").upsert({"id": user_id}, on_conflict="id", ignore_duplicates=True).execute()
    res = db.table("profiles").select("*").eq("id", user_id).limit(1).execute()
    if not res.data:
        raise AppError(500, "profile_unavailable", "Profile could not be created")
    return res.data[0]


@router.get(
    "",
    response_model=MeResponse,
    summary="Current user and profile",
    description="Returns the verified identity from the bearer token plus the matching `profiles` row "
    "(created on first access if missing).",
    responses=AUTH_ERRORS,
)
def read_me(user: AuthUser = Depends(current_user), db: Client = Depends(get_db)):
    profile = get_or_create_profile(db, user.id)
    return MeResponse(id=user.id, email=user.email, role=user.role, profile=Profile(**profile))


@router.patch(
    "/profile",
    response_model=Profile,
    summary="Update own profile",
    description="Updates only the provided fields of the caller's own profile.",
    responses={**AUTH_ERRORS, **VALIDATION_ERRORS},
)
def update_profile(body: ProfileUpdate, user: AuthUser = Depends(current_user), db: Client = Depends(get_db)):
    changes = body.model_dump(exclude_unset=True)
    get_or_create_profile(db, user.id)
    if not changes:
        return Profile(**get_or_create_profile(db, user.id))
    changes["updated_at"] = datetime.now(UTC).isoformat()
    res = db.table("profiles").update(changes).eq("id", user.id).execute()
    if not res.data:
        raise AppError(404, "profile_not_found", "Profile not found")
    return Profile(**res.data[0])
