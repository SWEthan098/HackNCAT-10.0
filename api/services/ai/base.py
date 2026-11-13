"""Provider-neutral AI types. Features depend on these, never on a provider SDK.

Adding a provider = one new module implementing `AIProvider` + one line in ai_service.PROVIDERS.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class AIRequest:
    messages: list[ChatMessage]
    system: str | None = None
    max_output_tokens: int | None = None
    model: str | None = None  # per-request override; defaults to settings / provider default


@dataclass(frozen=True)
class Usage:
    input_tokens: int | None = None
    output_tokens: int | None = None

    @property
    def total_tokens(self) -> int | None:
        if self.input_tokens is None and self.output_tokens is None:
            return None
        return (self.input_tokens or 0) + (self.output_tokens or 0)


@dataclass(frozen=True)
class AIResponse:
    text: str
    provider: str
    model: str
    stop_reason: str | None
    usage: Usage = field(default_factory=Usage)
    latency_ms: float = 0.0
    cost_usd: float | None = None


class AIProviderError(Exception):
    """Normalized provider failure. `kind` drives the HTTP status the API returns."""

    def __init__(self, kind: str, message: str, provider: str):
        super().__init__(message)
        self.kind = kind  # not_configured | auth | rate_limited | timeout | bad_request | refused | upstream
        self.message = message
        self.provider = provider


class AIProvider(ABC):
    name: str
    default_model: str

    @abstractmethod
    def is_configured(self) -> bool:
        """True when credentials are present. Must not make a network call."""

    @abstractmethod
    def generate(self, request: AIRequest, model: str) -> tuple[str, str | None, Usage]:
        """Return (text, stop_reason, usage). Raise AIProviderError on failure."""
