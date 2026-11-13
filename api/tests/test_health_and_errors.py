def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
    assert r.headers.get("x-request-id")


def test_unknown_route_uses_error_shape(client):
    r = client.get("/does-not-exist")
    assert r.status_code == 404
    body = r.json()
    assert body["error"]["code"] == "not_found"
    assert "request_id" in body["error"]


def test_docs_available_outside_production(client):
    assert client.get("/docs").status_code == 200
    spec = client.get("/openapi.json").json()
    assert {"/health", "/me", "/me/profile", "/ai/status", "/ai/chat"} <= set(spec["paths"])


def test_cors_allows_configured_origin_only(client):
    ok = client.options(
        "/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    bad = client.options("/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert bad.headers.get("access-control-allow-origin") is None


def test_docs_disabled_in_production(monkeypatch):
    from core.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("ENABLE_DOCS", raising=False)
    get_settings.cache_clear()
    try:
        from fastapi.testclient import TestClient

        from main import create_app

        with TestClient(create_app()) as c:
            assert c.get("/docs").status_code == 404
            assert c.get("/health").status_code == 200
    finally:
        get_settings.cache_clear()


def test_readiness_hides_config_in_production(monkeypatch):
    from core.config import get_settings

    class _OK:
        def table(self, _n):
            class _Q:
                def select(self, *a, **k):
                    return self

                def limit(self, _n):
                    return self

                def execute(self):
                    return None

            return _Q()

    monkeypatch.setattr("routers.health.supabase_admin", lambda: _OK())
    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    try:
        from fastapi.testclient import TestClient

        from main import create_app

        with TestClient(create_app()) as c:
            body = c.get("/health/ready").json()
        assert body == {"status": "ok", "checks": {"database": "ok"}}
    finally:
        get_settings.cache_clear()
