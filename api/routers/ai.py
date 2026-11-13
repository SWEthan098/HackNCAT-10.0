from __future__ import annotations

from fastapi import APIRouter, Depends
from starlette.concurrency import run_in_threadpool

from auth import AuthUser, current_user
from core.errors import AppError
from schemas.ai import AIStatus, ChatRequest, ChatResponse, UsageOut
from schemas.common import AUTH_ERRORS, VALIDATION_ERRORS, ErrorResponse
from services.ai import AIProviderError, AIRequest, AIService, ChatMessage, get_ai_service

router = APIRouter(prefix="/ai", tags=["ai"])

_STATUS_BY_KIND = {
    "not_configured": (503, "ai_not_configured"),
    "auth": (502, "ai_auth_failed"),
    "rate_limited": (429, "ai_rate_limited"),
    "timeout": (504, "ai_timeout"),
    "bad_request": (400, "ai_bad_request"),
    "refused": (422, "ai_refused"),
    "upstream": (502, "ai_upstream_error"),
}


@router.get(
    "/status",
    response_model=AIStatus,
    summary="AI provider configuration",
    description="Which provider/model is active and whether its key is present. Never returns key values. "
    "Does not call the provider.",
    responses=AUTH_ERRORS,
)
def ai_status(_: AuthUser = Depends(current_user), ai: AIService = Depends(get_ai_service)):
    return ai.status()


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a chat request to the configured provider",
    description="Provider-neutral chat completion with usage, latency and cost estimate.",
    responses={
        **AUTH_ERRORS,
        **VALIDATION_ERRORS,
        429: {"model": ErrorResponse, "description": "Provider rate limit"},
        502: {"model": ErrorResponse, "description": "Provider error"},
        503: {"model": ErrorResponse, "description": "Provider not configured"},
        504: {"model": ErrorResponse, "description": "Provider timeout"},
    },
)
async def ai_chat(body: ChatRequest, _: AuthUser = Depends(current_user), ai: AIService = Depends(get_ai_service)):
    request = AIRequest(
        messages=[ChatMessage(role=m.role, content=m.content) for m in body.messages],
        system=body.system,
        max_output_tokens=body.max_output_tokens,
    )
    try:
        # Provider SDK calls are blocking; keep the event loop free.
        result = await run_in_threadpool(ai.generate, request)
    except AIProviderError as e:
        status_code, code = _STATUS_BY_KIND.get(e.kind, (502, "ai_upstream_error"))
        raise AppError(status_code, code, e.message) from None
    return ChatResponse(
        text=result.text,
        provider=result.provider,
        model=result.model,
        stop_reason=result.stop_reason,
        usage=UsageOut(
            input_tokens=result.usage.input_tokens,
            output_tokens=result.usage.output_tokens,
            total_tokens=result.usage.total_tokens,
        ),
        latency_ms=result.latency_ms,
        cost_usd=result.cost_usd,
    )
