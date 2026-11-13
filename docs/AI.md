# AI provider architecture

Owner: JLee ([TEAM.md](../TEAM.md)). All AI calls go through the FastAPI backend. API keys live only in `api/.env` (locally) or Railway
variables (production). Nothing AI-related is in the frontend except calls to `/ai/*`.

```
api/services/ai/
  base.py                ChatMessage, AIRequest, AIResponse, Usage, AIProviderError, AIProvider
  groq_provider.py       official `groq` SDK (chat completions)
  anthropic_provider.py  official `anthropic` SDK (Messages API)
  mock_provider.py       deterministic, offline (tests, CI, building UI without a key)
  pricing.py             USD per million tokens for cost estimates
  ai_service.py          provider selection, model resolution, latency, cost, usage logging
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | `groq` | `groq`, `anthropic` or `mock` |
| `AI_MODEL` | provider default | Groq: `openai/gpt-oss-120b` (also available: `openai/gpt-oss-20b`, `qwen/qwen3.8-27b`). Anthropic: `claude-opus-5-5`. |
| `GROQ_API_KEY` / `ANTHROPIC_API_KEY` | empty | Only the selected provider's key is needed |
| `ANTHROPIC_EFFORT` | `medium` | Claude thinking effort: `low`, `medium`, `high`, `xhigh`, `max` |
| `AI_TIMEOUT_SECONDS` | `30` | Per-request timeout (SDK) |
| `AI_MAX_RETRIES` | `2` | SDK retries with backoff on 408/409/429/5xx and connection errors (capped at 5) |
| `AI_MAX_OUTPUT_TOKENS` | `1024` | Default response cap; a request may override up to 8192. gpt-oss models count their reasoning here, so raise it for long answers |
| `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK` | empty | Prices for models without a built-in price (Groq). Empty = cost reported as unknown |

Check the active configuration at `GET /ai/status` or on the dashboard's **System status** page.

## Using it in a feature

```python
from fastapi import APIRouter, Depends
from auth import AuthUser, current_user
from services.ai import AIService, ChatMessage, get_ai_service

router = APIRouter(prefix="/triage", tags=["triage"])

@router.post("")
def triage(body: TriageIn, user: AuthUser = Depends(current_user), ai: AIService = Depends(get_ai_service)):
    result = ai.chat([ChatMessage("user", body.text)], system="Classify the ticket. Reply with one word.")
    return {"label": result.text.strip(), "tokens": result.usage.total_tokens}
```

Catch `AIProviderError` (or let `/ai/chat`'s mapping pattern in `routers/ai.py` guide you):
`not_configured` 503, `rate_limited` 429, `timeout` 504, `bad_request` 400, `refused` 422,
`auth`/`upstream` 502.

## Behaviour per provider

- **Groq**: OpenAI-style chat completions. Usage from `prompt_tokens` / `completion_tokens`.
- **Anthropic**: Messages API through `client.beta.messages.create` with
  `betas=["server-side-fallback-2026-07-01"]` and `fallbacks="default"`: if Claude declines a request
  on a safety classifier, the API re-runs it on a fallback model inside the same call. A request that
  is still refused raises `refused`. Claude Opus 5.5 always thinks; depth is set with
  `output_config.effort` (`ANTHROPIC_EFFORT`). Do not send `temperature` or `budget_tokens` to it.
- **Mock**: echoes the last message as `[mock:mock-echo] …`, with word counts as token usage.

## Tracking

Every call logs `provider, model, input/output tokens, latency_ms, cost_usd` (never prompt or
response text). `AIResponse` returns the same numbers to the caller.

## Choosing a provider

Do this when the challenge is known, not before. Compare on the real task:

| | Groq | Anthropic Claude |
| --- | --- | --- |
| Strength | very low latency and cost on open-weight models | stronger reasoning, coding, analysis, long documents, tool use, multi-step agents |
| Context | depends on model (check Groq's model page) | 1M tokens on current Opus/Sonnet/Haiku |
| Price (per 1M tokens, input/output) | check console.groq.com (changes often); set `AI_PRICE_*` to track cost | Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 (Anthropic list prices, 2026-11) |
| Rate limits | per-model, see your Groq console | per-tier, see your Anthropic console |

A common split: Groq for high-volume, latency-sensitive calls (classification, extraction), Claude
for the reasoning-heavy step. Only add a second provider to a feature when a measurement shows it
helps.

## Extending

Add RAG, document processing, web research, agents, structured outputs, tool calling or multimodal
inputs as new services next to `ai_service.py` that reuse `AIService`; extend `AIRequest` (for example
with `tools` or `response_schema`) and implement it in each adapter. Keep features provider-neutral.

## Verification status

- 2026-11-13: provider selection, error mapping, cost estimates and the `/ai/chat` endpoint are
  covered by pytest with the mock provider.
- 2026-11-13: **Groq verified live** with the team key. The key lists 11 models; live chat calls
  succeeded on `openai/gpt-oss-120b` (~1.5 s), `openai/gpt-oss-20b` (~0.6 s) and `qwen/qwen3.8-27b`
  (~0.5 s). `llama-3.3-70b-versatile` is not available to this key. Re-list models with
  `GET https://api.groq.com/openai/v1/models` when choosing for the challenge.
- Anthropic: not verified live (no key).
