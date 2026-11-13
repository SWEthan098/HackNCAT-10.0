"""Anthropic Claude adapter (official `anthropic` SDK, Messages API).

Defaults to Claude Opus 5.5. Server-side refusal fallback is enabled (beta
`server-side-fallback-2026-07-01`, `fallbacks="default"`): if the model declines on a
safety classifier, the API re-runs the request on a fallback model in the same call.
Thinking is always on for this model; depth is controlled with ANTHROPIC_EFFORT.
"""

from __future__ import annotations

from functools import cached_property

from core.config import Settings
from services.ai.base import AIProvider, AIProviderError, AIRequest, Usage

FALLBACK_BETA = "server-side-fallback-2026-07-01"
_EFFORTS = {"low", "medium", "high", "xhigh", "max"}


class AnthropicProvider(AIProvider):
    name = "anthropic"
    default_model = "claude-opus-5-5"

    def __init__(self, settings: Settings):
        self._settings = settings

    def is_configured(self) -> bool:
        return bool(self._settings.anthropic_api_key)

    @cached_property
    def _client(self):
        import anthropic  # lazy: only needed when this provider is selected

        return anthropic.Anthropic(
            api_key=self._settings.anthropic_api_key,
            timeout=self._settings.ai_timeout_seconds,
            max_retries=self._settings.ai_max_retries,  # SDK retries 408/409/429/5xx with backoff
        )

    def generate(self, request: AIRequest, model: str):
        if not self.is_configured():
            raise AIProviderError("not_configured", "ANTHROPIC_API_KEY is not set", self.name)
        import anthropic

        effort = self._settings.anthropic_effort if self._settings.anthropic_effort in _EFFORTS else "medium"
        kwargs = dict(
            model=model,
            max_tokens=request.max_output_tokens or self._settings.ai_max_output_tokens,
            messages=[{"role": m.role, "content": m.content} for m in request.messages],
            output_config={"effort": effort},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
        if request.system:
            kwargs["system"] = request.system
        try:
            msg = self._client.beta.messages.create(**kwargs)
        except anthropic.AuthenticationError:
            raise AIProviderError("auth", "Anthropic rejected the API key", self.name) from None
        except anthropic.NotFoundError:
            raise AIProviderError("bad_request", f"Anthropic model not found: {model}", self.name) from None
        except anthropic.RateLimitError:
            raise AIProviderError("rate_limited", "Anthropic rate limit reached", self.name) from None
        except anthropic.APITimeoutError:
            raise AIProviderError("timeout", "Anthropic request timed out", self.name) from None
        except anthropic.BadRequestError as e:
            raise AIProviderError("bad_request", f"Anthropic rejected the request: {e.message}", self.name) from None
        except anthropic.APIStatusError as e:
            raise AIProviderError("upstream", f"Anthropic error {e.status_code}", self.name) from None
        except anthropic.APIConnectionError:
            raise AIProviderError("upstream", "Could not reach Anthropic", self.name) from None

        if msg.stop_reason == "refusal":
            raise AIProviderError("refused", "The model declined this request", self.name)
        text = "".join(b.text for b in msg.content if b.type == "text")
        usage = Usage(input_tokens=msg.usage.input_tokens, output_tokens=msg.usage.output_tokens)
        return text, msg.stop_reason, usage
