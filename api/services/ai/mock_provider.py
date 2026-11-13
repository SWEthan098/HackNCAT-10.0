"""Deterministic offline provider for tests, CI and building UI before a key exists.

Select it with AI_PROVIDER=mock. It never makes a network call.
"""

from __future__ import annotations

from services.ai.base import AIProvider, AIRequest, Usage


class MockProvider(AIProvider):
    name = "mock"
    default_model = "mock-echo"

    def __init__(self, settings=None):
        pass

    def is_configured(self) -> bool:
        return True

    def generate(self, request: AIRequest, model: str):
        last = request.messages[-1].content if request.messages else ""
        text = f"[mock:{model}] {last}"
        words_in = sum(len(m.content.split()) for m in request.messages) + len((request.system or "").split())
        return text, "end_turn", Usage(input_tokens=words_in, output_tokens=len(text.split()))
