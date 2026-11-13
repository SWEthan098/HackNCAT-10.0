"""Groq adapter (official `groq` SDK, OpenAI-style chat completions).

Default model verified live on 2026-11-13 against the team's key (GET /openai/v1/models + a chat
call). Chat models available then: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b.
gpt-oss models spend output tokens on reasoning, so keep AI_MAX_OUTPUT_TOKENS comfortably above
the answer length. Set AI_MODEL to pick another.
"""

from __future__ import annotations

from functools import cached_property

from core.config import Settings
from services.ai.base import AIProvider, AIProviderError, AIRequest, Usage


class GroqProvider(AIProvider):
    name = "groq"
    default_model = "openai/gpt-oss-120b"

    def __init__(self, settings: Settings):
        self._settings = settings

    def is_configured(self) -> bool:
        return bool(self._settings.groq_api_key)

    @cached_property
    def _client(self):
        import groq  # lazy: only needed when this provider is selected

        return groq.Groq(
            api_key=self._settings.groq_api_key,
            timeout=self._settings.ai_timeout_seconds,
            max_retries=self._settings.ai_max_retries,  # SDK retries 408/409/429/5xx with backoff
        )

    def generate(self, request: AIRequest, model: str):
        if not self.is_configured():
            raise AIProviderError("not_configured", "GROQ_API_KEY is not set", self.name)
        import groq

        messages = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages += [{"role": m.role, "content": m.content} for m in request.messages]
        try:
            resp = self._client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_output_tokens or self._settings.ai_max_output_tokens,
            )
        except groq.AuthenticationError:
            raise AIProviderError("auth", "Groq rejected the API key", self.name) from None
        except groq.RateLimitError:
            raise AIProviderError("rate_limited", "Groq rate limit reached", self.name) from None
        except groq.APITimeoutError:
            raise AIProviderError("timeout", "Groq request timed out", self.name) from None
        except groq.BadRequestError as e:
            raise AIProviderError("bad_request", f"Groq rejected the request: {e.message}", self.name) from None
        except groq.NotFoundError:
            raise AIProviderError("bad_request", f"Groq model not found: {model}", self.name) from None
        except groq.APIStatusError as e:
            raise AIProviderError("upstream", f"Groq error {e.status_code}", self.name) from None
        except groq.APIConnectionError:
            raise AIProviderError("upstream", "Could not reach Groq", self.name) from None

        choice = resp.choices[0]
        usage = Usage(
            input_tokens=getattr(resp.usage, "prompt_tokens", None),
            output_tokens=getattr(resp.usage, "completion_tokens", None),
        )
        return choice.message.content or "", choice.finish_reason, usage
