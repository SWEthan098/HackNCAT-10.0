import pytest

from core.config import Settings
from services.ai import AIProviderError, AIService, ChatMessage
from services.ai.ai_service import get_ai_service
from services.ai.anthropic_provider import AnthropicProvider
from services.ai.base import AIProvider, Usage
from services.ai.groq_provider import GroqProvider
from services.ai.pricing import estimate_cost


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_ai_endpoints_require_auth(client):
    assert client.get("/ai/status").status_code == 401
    assert client.post("/ai/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401


def test_ai_status_reports_mock(client, token_factory):
    r = client.get("/ai/status", headers=auth_header(token_factory()))
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "mock" and body["configured"] is True
    assert set(body["available_providers"]) == {"anthropic", "groq", "mock"}
    assert "api_key" not in r.text.lower()


def test_ai_chat_with_mock_provider(client, token_factory):
    r = client.post(
        "/ai/chat",
        json={"messages": [{"role": "user", "content": "hello world"}], "system": "be brief"},
        headers=auth_header(token_factory()),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"] == "[mock:mock-echo] hello world"
    assert body["provider"] == "mock" and body["model"] == "mock-echo"
    assert body["usage"]["total_tokens"] == body["usage"]["input_tokens"] + body["usage"]["output_tokens"]
    assert body["latency_ms"] >= 0 and body["cost_usd"] == 0.0


def test_ai_chat_validation(client, token_factory):
    h = auth_header(token_factory())
    assert client.post("/ai/chat", json={"messages": []}, headers=h).status_code == 422
    bad_role = {"messages": [{"role": "system", "content": "x"}]}
    assert client.post("/ai/chat", json=bad_role, headers=h).status_code == 422


class _FailingProvider(AIProvider):
    name, default_model = "failing", "m"

    def __init__(self, kind):
        self.kind = kind

    def is_configured(self):
        return True

    def generate(self, request, model):
        raise AIProviderError(self.kind, f"boom {self.kind}", self.name)


@pytest.mark.parametrize(
    "kind,status,code",
    [
        ("not_configured", 503, "ai_not_configured"),
        ("rate_limited", 429, "ai_rate_limited"),
        ("timeout", 504, "ai_timeout"),
        ("upstream", 502, "ai_upstream_error"),
        ("refused", 422, "ai_refused"),
    ],
)
def test_provider_errors_map_to_http(client, token_factory, kind, status, code):
    from main import app

    app.dependency_overrides[get_ai_service] = lambda: AIService(Settings(ai_provider="mock"), _FailingProvider(kind))
    try:
        r = client.post(
            "/ai/chat", json={"messages": [{"role": "user", "content": "x"}]}, headers=auth_header(token_factory())
        )
    finally:
        app.dependency_overrides.pop(get_ai_service, None)
    assert r.status_code == status
    assert r.json()["error"]["code"] == code


def test_provider_selection_and_model_resolution():
    assert AIService(Settings(ai_provider="groq")).provider.name == "groq"
    assert AIService(Settings(ai_provider="anthropic")).model == "claude-opus-5-5"
    assert AIService(Settings(ai_provider="anthropic", ai_model="claude-sonnet-5-5")).model == "claude-sonnet-5-5"
    with pytest.raises(ValueError):
        AIService(Settings(ai_provider="nope"))


def test_real_providers_fail_cleanly_without_keys():
    for cls in (GroqProvider, AnthropicProvider):
        p = cls(Settings())
        assert p.is_configured() is False
        with pytest.raises(AIProviderError) as e:
            p.generate(None, p.default_model)
        assert e.value.kind == "not_configured"


def test_settings_repr_hides_secrets():
    s = Settings(groq_api_key="gsk_secret", anthropic_api_key="sk-ant-secret", supabase_service_role_key="sb_secret")
    text = repr(s) + str(s.public_summary())
    assert "gsk_secret" not in text and "sk-ant-secret" not in text and "sb_secret" not in text


def test_cost_estimates():
    s = Settings()
    assert estimate_cost("claude-opus-5-5", Usage(1_000_000, 1_000_000), s) == 24.0
    assert estimate_cost("unknown-model", Usage(10, 10), s) is None
    s2 = Settings(ai_price_input_per_mtok=0.5, ai_price_output_per_mtok=1.0)
    assert estimate_cost("anything", Usage(2_000_000, 1_000_000), s2) == 2.0


def test_service_chat_helper():
    svc = AIService(Settings(ai_provider="mock"))
    out = svc.chat([ChatMessage("user", "ping")])
    assert out.text.endswith("ping") and out.stop_reason == "end_turn"
