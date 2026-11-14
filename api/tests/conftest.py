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


# --- In-memory stand-in for the subset of supabase-py the routers use -------------------
class _Result:
    def __init__(self, data):
        self.data = data


class _Rpc:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _Result(self._data)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


class _Query:
    def __init__(self, table: _FakeTable, op: str, payload=None, **opts):
        self.table, self.op, self.payload, self.opts, self.filters = table, op, payload, opts, []

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def limit(self, _n):
        return self

    def _match(self, row):
        return all(row.get(c) == v for c, v in self.filters)

    def execute(self):
        rows = self.table.rows
        if self.op == "select":
            return _Result([dict(r) for r in rows if self._match(r)])
        if self.op == "upsert":
            existing = next((r for r in rows if r["id"] == self.payload["id"]), None)
            if existing and self.opts.get("ignore_duplicates"):
                return _Result([])
            if existing:
                existing.update(self.payload)
                return _Result([dict(existing)])
            row = {"display_name": None, "avatar_url": None, "created_at": None, "updated_at": None, **self.payload}
            rows.append(row)
            return _Result([dict(row)])
        if self.op == "insert":
            row = {"id": str(uuid.uuid4()), "created_at": _now_iso(), **self.table.defaults, **self.payload}
            rows.append(row)
            return _Result([dict(row)])
        if self.op == "update":
            hit = [r for r in rows if self._match(r)]
            for r in hit:
                r.update(self.payload)
            return _Result([dict(r) for r in hit])
        raise NotImplementedError(self.op)


class _FakeTable:
    def __init__(self, defaults: dict | None = None):
        self.rows: list[dict] = []
        self.defaults = defaults or {}

    def insert(self, payload):
        return _Query(self, "insert", payload)

    def select(self, *_a, **_k):
        return _Query(self, "select")

    def upsert(self, payload, **opts):
        return _Query(self, "upsert", payload, **opts)

    def update(self, payload):
        return _Query(self, "update", payload)


class FakeDB:
    def __init__(self):
        self.tables = {
            "profiles": _FakeTable(),
            "user_roles": _FakeTable(),
            "events": _FakeTable({"incident_id": None, "raw_features": None}),
            "incidents": _FakeTable(),
            "audit_log": _FakeTable(),
        }

    def rpc(self, name, params=None):
        """Stand-in for the SQL functions the engine calls."""
        if name != "audit_append":
            raise NotImplementedError(name)
        log = self.tables["audit_log"].rows
        prev = log[-1]["hash"] if log else None
        row = {
            "id": len(log) + 1,
            "created_at": _now_iso(),
            "actor": params["p_actor"],
            "action": params["p_action"],
            "detail": params.get("p_detail") or {},
            "prev_hash": prev,
        }
        row["hash"] = hashlib.sha256(json.dumps([prev or "", row], sort_keys=True).encode()).hexdigest()
        log.append(row)
        return _Rpc(dict(row))

    def grant_role(self, user_id: str, role: str) -> None:
        self.tables["user_roles"].rows.append({"user_id": user_id, "role": role})

    def table(self, name):
        return self.tables[name]


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
