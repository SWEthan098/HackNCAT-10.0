from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessageIn] = Field(min_length=1, max_length=50)
    system: str | None = Field(default=None, max_length=10_000)
    max_output_tokens: int | None = Field(default=None, ge=1, le=8192)


class UsageOut(BaseModel):
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None


class ChatResponse(BaseModel):
    text: str
    provider: str
    model: str
    stop_reason: str | None
    usage: UsageOut
    latency_ms: float
    cost_usd: float | None = Field(description="Estimate; null when the model's price is unknown")


class AIStatus(BaseModel):
    provider: str
    model: str
    configured: bool
    available_providers: list[str]
    timeout_seconds: float
    max_retries: int
