import uuid


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_missing_bearer_token(client):
    r = client.get("/me")
    assert r.status_code == 401
    assert r.json()["error"] == {
        "code": "unauthorized",
        "message": "Missing bearer token",
        "request_id": r.headers["x-request-id"],
    }


def test_garbage_token(client):
    r = client.get("/me", headers=auth_header("not-a-jwt"))
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Invalid token"


def test_token_signed_with_wrong_key(client, token_factory):
    r = client.get("/me", headers=auth_header(token_factory(wrong_key=True)))
    assert r.status_code == 401


def test_expired_token(client, token_factory):
    r = client.get("/me", headers=auth_header(token_factory(exp_in=-60)))
    assert r.status_code == 401
    assert r.json()["error"]["message"] == "Token expired"


def test_wrong_audience(client, token_factory):
    r = client.get("/me", headers=auth_header(token_factory(aud="anon")))
    assert r.status_code == 401


def test_error_never_echoes_token(client):
    secret_looking = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl"
    r = client.get("/me", headers=auth_header(secret_looking))
    assert secret_looking not in r.text


def test_valid_es256_token_creates_and_returns_profile(client, token_factory, fake_db):
    uid = str(uuid.uuid4())
    r = client.get("/me", headers=auth_header(token_factory(uid, email="a@example.com")))
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == uid and body["email"] == "a@example.com" and body["role"] == "authenticated"
    assert body["profile"]["id"] == uid
    # Idempotent: a second call does not create a duplicate.
    client.get("/me", headers=auth_header(token_factory(uid)))
    assert len([p for p in fake_db.tables["profiles"].rows if p["id"] == uid]) == 1


def test_valid_hs256_token(client, token_factory):
    r = client.get("/me", headers=auth_header(token_factory(alg="HS256")))
    assert r.status_code == 200


def test_profiles_are_isolated_per_user(client, token_factory, fake_db):
    a, b = str(uuid.uuid4()), str(uuid.uuid4())
    client.patch("/me/profile", json={"display_name": "Alice"}, headers=auth_header(token_factory(a)))
    rb = client.get("/me", headers=auth_header(token_factory(b)))
    assert rb.json()["profile"]["display_name"] is None
    ra = client.get("/me", headers=auth_header(token_factory(a)))
    assert ra.json()["profile"]["display_name"] == "Alice"


def test_update_profile_validation(client, token_factory):
    h = auth_header(token_factory())
    assert client.patch("/me/profile", json={"display_name": "x" * 81}, headers=h).status_code == 422
    assert client.patch("/me/profile", json={"avatar_url": "http://insecure"}, headers=h).status_code == 422
    # Unknown fields (e.g. trying to set id) are rejected, not silently applied.
    r = client.patch("/me/profile", json={"id": str(uuid.uuid4())}, headers=h)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_update_profile_trims_and_persists(client, token_factory):
    uid = str(uuid.uuid4())
    h = auth_header(token_factory(uid))
    r = client.patch("/me/profile", json={"display_name": "  Cole  "}, headers=h)
    assert r.status_code == 200
    assert r.json()["display_name"] == "Cole"
    assert r.json()["updated_at"] is not None
