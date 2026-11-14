"""Test fixtures: no network, no real credentials.

- Tokens are signed locally with a throwaway ES256 key (and an HS256 secret), and the JWKS
  lookup is patched to return that key, so the real verification code path runs.
- Supabase is replaced by an in-memory fake through FastAPI dependency overrides.
- AI uses the deterministic mock provider.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
import uuid
from datetime import UTC, datetime

os.environ.update(
    {
        "API_SKIP_DOTENV": "1",
        "ENVIRONMENT": "test",
        "SUPABASE_URL": "https://example-test.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-service-role-key",
        "SUPABASE_JWT_SECRET": "test-hs256-secret-that-is-long-enough-123",
        "AI_PROVIDER": "mock",
        "ALLOWED_ORIGINS": "http://localhost:3000",
    }
)
for _k in ("GROQ_API_KEY", "ANTHROPIC_API_KEY", "AI_MODEL"):
    os.environ.pop(_k, None)

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import auth  # noqa: E402
from core.db import get_db  # noqa: E402

_EC_KEY = ec.generate_private_key(ec.SECP256R1())
_OTHER_EC_KEY = ec.generate_private_key(ec.SECP256R1())


class _FakeJWKS:
    def get_signing_key_from_jwt(self, token):
        class _K:
            key = _EC_KEY.public_key()

        return _K()


# --- In-memory stand-in for the subset of supabase-py the API uses ------------------------
class _Result:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Rpc:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _Result(self._data)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _cmp(value):
    """Compare timestamps as times (ISO strings differ in format), everything else as is."""
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    return value


class _Query:
    def __init__(self, table: _FakeTable, op: str, payload=None, **opts):
        self.table, self.op, self.payload, self.opts = table, op, payload, opts
        self.filters, self._order, self._limit, self._count, self._negate = [], [], None, None, False

    def select(self, *_a, count=None, **_k):
        self._count = count or self._count
        return self

    @property
    def not_(self):
        self._negate = True
        return self

    def _where(self, test):
        self.filters.append((lambda row: not test(row)) if self._negate else test)
        self._negate = False
        return self

    def eq(self, col, val):
        return self._where(lambda r: r.get(col) == val)

    def neq(self, col, val):
        return self._where(lambda r: r.get(col) != val)

    def in_(self, col, values):
        return self._where(lambda r: r.get(col) in list(values))

    def is_(self, col, val):
        return self._where(lambda r: r.get(col) is (None if val in ("null", None) else val))

    def gte(self, col, val):
        return self._where(lambda r: r.get(col) is not None and _cmp(r[col]) >= _cmp(val))

    def gt(self, col, val):
        return self._where(lambda r: r.get(col) is not None and _cmp(r[col]) > _cmp(val))

    def lte(self, col, val):
        return self._where(lambda r: r.get(col) is not None and _cmp(r[col]) <= _cmp(val))

    def lt(self, col, val):
        return self._where(lambda r: r.get(col) is not None and _cmp(r[col]) < _cmp(val))

    def order(self, col, desc=False, **_k):
        self._order.append((col, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _match(self, row):
        return all(test(row) for test in self.filters)

    def execute(self):
        table, rows = self.table, self.table.rows
        if self.op == "select":
            hit = [r for r in rows if self._match(r)]
            for col, desc in reversed(self._order):
                hit.sort(key=lambda r: _cmp(r.get(col)), reverse=desc)
            total = len(hit)
            if self._limit is not None:
                hit = hit[: self._limit]
            return _Result([dict(r) for r in hit], count=total if self._count else None)
        if self.op == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            new = [table.new_row(p) for p in payloads]
            rows.extend(new)
            return _Result([dict(r) for r in new])
        if self.op == "upsert":
            key = self.opts.get("on_conflict") or table.pk
            existing = next((r for r in rows if r.get(key) == self.payload.get(key)), None)
            if existing and self.opts.get("ignore_duplicates"):
                return _Result([])
            if existing:
                existing.update(self.payload)
                return _Result([dict(existing)])
            row = table.new_row(self.payload)
            rows.append(row)
            return _Result([dict(row)])
        if self.op == "update":
            hit = [r for r in rows if self._match(r)]
            for r in hit:
                r.update(self.payload)
            return _Result([dict(r) for r in hit])
        if self.op == "delete":
            hit = [r for r in rows if self._match(r)]
            table.rows[:] = [r for r in rows if not self._match(r)]
            return _Result([dict(r) for r in hit])
        raise NotImplementedError(self.op)


class _FakeTable:
    def __init__(self, defaults: dict | None = None, *, pk: str = "id", auto: bool = True):
        self.rows: list[dict] = []
        self.defaults, self.pk, self.auto = defaults or {}, pk, auto

    def new_row(self, payload: dict) -> dict:
        """What the database would fill in: id, created_at and column defaults."""
        base = {"id": str(uuid.uuid4()), "created_at": _now_iso()} if self.auto else {}
        return {**base, **{k: (v() if callable(v) else v) for k, v in self.defaults.items()}, **payload}

    def select(self, *_a, count=None, **_k):
        return _Query(self, "select").select(count=count)

    def insert(self, payload):
        return _Query(self, "insert", payload)

    def upsert(self, payload, **opts):
        return _Query(self, "upsert", payload, **opts)

    def update(self, payload):
        return _Query(self, "update", payload)

    def delete(self):
        return _Query(self, "delete")


def _audit_hash(prev, row) -> str:
    body = [prev or "", row["id"], row["created_at"], row["actor"], row["action"], row["detail"]]
    return hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()


class FakeDB:
    def __init__(self):
        profile = {"display_name": None, "avatar_url": None, "created_at": None, "updated_at": None}
        self.tables = {
            "profiles": _FakeTable(profile, auto=False),
            "user_roles": _FakeTable(auto=False),
            "events": _FakeTable({"incident_id": None, "raw_features": None, "mitre": list}),
            "incidents": _FakeTable(
                {
                    "updated_at": _now_iso,
                    "risk": 0,
                    "level": "low",
                    "status": "new",
                    "summary": None,
                    "triage_label": None,
                    "mitre": list,
                }
            ),
            "approvals": _FakeTable(
                {"status": "pending", "actions": list, "decided_by": None, "decided_at": None, "expires_at": None}
            ),
            "appeals": _FakeTable({"event_id": None, "incident_id": None, "status": "open"}),
            "audit_log": _FakeTable(auto=False),
            "entity_state": _FakeTable(
                {"locked": False, "frozen": False, "sessions_revoked_at": None, "updated_by": None},
                pk="entity",
                auto=False,
            ),
            "attempts": _FakeTable({"message": None, "blocked_by": None, "technique": None, "breach": False}),
            "public_feed": _FakeTable({"technique": None}),
        }

    def table(self, name):
        return self.tables[name]

    def grant_role(self, user_id: str, role: str) -> None:
        self.tables["user_roles"].rows.append({"user_id": user_id, "role": role})

    def rpc(self, name, params=None):
        """Stand-ins for the SQL functions in supabase/migrations/..._audit_chain.sql."""
        log = self.tables["audit_log"].rows
        if name == "audit_append":
            prev = log[-1]["hash"] if log else None
            row = {
                "id": (log[-1]["id"] + 1) if log else 1,
                "created_at": _now_iso(),
                "actor": params["p_actor"],
                "action": params["p_action"],
                "detail": params.get("p_detail") or {},
                "prev_hash": prev,
            }
            row["hash"] = _audit_hash(prev, row)
            log.append(row)
            return _Rpc(dict(row))
        if name == "audit_verify":
            bad, prev = None, None
            for row in sorted(log, key=lambda r: r["id"]):
                if row["prev_hash"] != prev or row["hash"] != _audit_hash(row["prev_hash"], row):
                    bad = row["id"]
                    break
                prev = row["hash"]
            return _Rpc([{"ok": bad is None, "entries_checked": len(log), "first_bad_id": bad}])
        raise NotImplementedError(name)


# --- Fixtures ----------------------------------------------------------------------------
@pytest.fixture
def fake_db():
    return FakeDB()


@pytest.fixture
def client(monkeypatch, fake_db):
    monkeypatch.setattr(auth, "_jwks_client", lambda url: _FakeJWKS())
    from main import app

    app.dependency_overrides[get_db] = lambda: fake_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_token(
    sub: str | None = None,
    *,
    alg: str = "ES256",
    exp_in: int = 3600,
    aud: str = "authenticated",
    email: str = "user@example.com",
    wrong_key: bool = False,
) -> str:
    now = int(time.time())
    claims = {
        "sub": sub or str(uuid.uuid4()),
        "aud": aud,
        "role": "authenticated",
        "email": email,
        "iat": now,
        "exp": now + exp_in,
    }
    if alg == "HS256":
        return jwt.encode(claims, os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256")
    key = _OTHER_EC_KEY if wrong_key else _EC_KEY
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "test"})


@pytest.fixture
def token_factory():
    return make_token
