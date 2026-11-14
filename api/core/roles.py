"""Role checks that accept any one of several roles. OWNER: Daylen (P3).

`auth.require_role("approver")` covers a single role. Use this when either of two roles may act:

    from core.roles import require_any_role
    def kill(user: AuthUser = Depends(require_any_role("analyst", "approver"))): ...

401 without a valid token, 403 without any of the roles. Fails closed: if the role lookup
itself breaks, the request is refused.
"""

from __future__ import annotations

import logging

from fastapi import Depends

from auth import AuthUser, current_user
from core.db import get_db
from core.errors import AppError

logger = logging.getLogger("api.roles")

# Who may dismiss incidents, use the kill switch or freeze an agent.
DEFENDER_ROLES = ("analyst", "approver")


def has_any_role(db, user_id: str, roles: tuple[str, ...]) -> bool:
    """True if `user_roles` has the user with at least one of `roles` (service-role read)."""
    rows = db.table("user_roles").select("role").eq("user_id", user_id).in_("role", list(roles)).limit(1).execute().data
    return bool(rows)


def require_any_role(*roles: str):
    if not roles:
        raise ValueError("require_any_role needs at least one role")
    needed = " or ".join(f"'{r}'" for r in roles)

    def dependency(user: AuthUser = Depends(current_user), db=Depends(get_db)) -> AuthUser:
        try:
            allowed = has_any_role(db, user.id, roles)
        except AppError:
            raise
        except Exception:
            logger.exception("Role lookup failed; refusing request")
            raise AppError(503, "role_check_unavailable", "Could not check your role. Try again.") from None
        if not allowed:
            raise AppError(403, "forbidden", f"This action needs the {needed} role")
        return user

    return dependency


def user_identities(user: AuthUser) -> set[str]:
    """Names this user could appear under in an incident's events (lowercase).

    Their id (bare and as `user:<id>`), their email, and, for accounts on the fake company's
    domain, the mailbox name (j.smith@cisco.example appears in events as `j.smith`).
    """
    ids = {user.id.lower(), f"user:{user.id}".lower()}
    if user.email:
        email = user.email.lower()
        ids.add(email)
        local, _, domain = email.partition("@")
        if domain == "cisco.example" and local:
            ids.add(local)
    return ids
