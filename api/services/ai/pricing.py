"""Per-model prices in USD per million tokens, used only for cost estimates.

Anthropic prices are first-party list prices (checked 2026-11). Groq prices change often and
are not hardcoded: set AI_PRICE_INPUT_PER_MTOK / AI_PRICE_OUTPUT_PER_MTOK to track them.
An unknown price yields cost_usd = None rather than a guess.
"""

from __future__ import annotations

from core.config import Settings
from services.ai.base import Usage

PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
    "mock-echo": (0.0, 0.0),
}


def estimate_cost(model: str, usage: Usage, settings: Settings) -> float | None:
    if settings.ai_price_input_per_mtok is not None and settings.ai_price_output_per_mtok is not None:
        price_in, price_out = settings.ai_price_input_per_mtok, settings.ai_price_output_per_mtok
    elif model in PRICES_PER_MTOK:
        price_in, price_out = PRICES_PER_MTOK[model]
    else:
        return None
    if usage.input_tokens is None or usage.output_tokens is None:
        return None
    return round((usage.input_tokens * price_in + usage.output_tokens * price_out) / 1_000_000, 6)
