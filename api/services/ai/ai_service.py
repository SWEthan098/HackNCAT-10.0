"""The one entry point features use for AI. Picks the provider from AI_PROVIDER, resolves the
model, times the call, estimates cost and logs usage (never prompt or response text).

    from services.ai.ai_service import get_ai_service
    result = get_ai_service().chat([ChatMessage("user", "Hello")], system="Be brief.")
"""

from __future__ import annotations

import logging
import time
from functools import lru_cache

from core.config import Settings, get_settings
from services.ai.anthropic_provider import AnthropicProvider
from services.ai.base import AIProvider, AIProviderError, AIRequest, AIResponse, ChatMessage
from services.ai.groq_provider import GroqProvider
from services.ai.mock_provider import MockProvider
from services.ai.pricing import estimate_cost

logger = logging.getLogger("api.ai")

PROVIDERS: dict[str, type[AIProvider]] = {
    "groq": GroqProvider,
    "anthropic": AnthropicProvider,
    "mock": MockProvider,
}


class AIService:
    def __init__(self, settings: Settings, provider: AIProvider | None = None):
        self.settings = settings
        if provider is None:
            cls = PROVIDERS.get(settings.ai_provider)
            if cls is None:
                raise ValueError(f"Unknown AI_PROVIDER '{settings.ai_provider}'. Options: {', '.join(PROVIDERS)}")
            provider = cls(settings)
        self.provider = provider

    @property
    def model(self) -> str:
        return self.settings.ai_model or self.provider.default_model

    def status(self) -> dict:
        return {
            "provider": self.provider.name,
            "model": self.model,
            "configured": self.provider.is_configured(),
            "available_providers": sorted(PROVIDERS),
            "timeout_seconds": self.settings.ai_timeout_seconds,
            "max_retries": self.settings.ai_max_retries,
        }

    def generate(self, request: AIRequest) -> AIResponse:
        model = request.model or self.model
        start = time.perf_counter()
        try:
            text, stop_reason, usage = self.provider.generate(request, model)
        except AIProviderError as e:
            logger.warning("ai provider=%s model=%s failed kind=%s", self.provider.name, model, e.kind)
            raise
        latency_ms = round((time.perf_counter() - start) * 1000, 1)
        cost = estimate_cost(model, usage, self.settings)
        logger.info(
            "ai provider=%s model=%s in=%s out=%s latency_ms=%s cost_usd=%s",
            self.provider.name,
            model,
            usage.input_tokens,
            usage.output_tokens,
            latency_ms,
            cost,
        )
        return AIResponse(
            text=text,
            provider=self.provider.name,
            model=model,
            stop_reason=stop_reason,
            usage=usage,
            latency_ms=latency_ms,
            cost_usd=cost,
        )

    def chat(self, messages: list[ChatMessage], system: str | None = None, **kw) -> AIResponse:
        return self.generate(AIRequest(messages=messages, system=system, **kw))


@lru_cache
def _cached_service() -> AIService:
    return AIService(get_settings())


def get_ai_service() -> AIService:
    """FastAPI dependency. Override in tests with app.dependency_overrides[get_ai_service]."""
    return _cached_service()
