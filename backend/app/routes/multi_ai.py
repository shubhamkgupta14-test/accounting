import asyncio
import json
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, SecretStr, field_validator

from app.ai_service import (
    ACCOUNTING_REFUSAL,
    AI_PROVIDER_MODELS,
    XAIError,
    local_scope_allows,
    request_provider_reply,
    stream_provider_reply,
    streamed_output_allows,
    validate_streamed_reply,
    validate_provider_key,
)
from app.core.config import settings
from app.core.multi_ai_sessions import ai_session_keys, request_session_id
from app.dependencies import get_current_user, require_roles


AIProvider = Literal["grok", "groq", "gemini"]
router = APIRouter(
    prefix="/ai",
    tags=["ai"],
    dependencies=[Depends(require_roles("superadmin", "admin"))],
)


class APIKeyRequest(BaseModel):
    provider: AIProvider
    model: str = Field(min_length=1, max_length=100)
    api_key: SecretStr = Field(min_length=10, max_length=512)


class ActiveProviderRequest(BaseModel):
    provider: AIProvider


class ProviderConfiguration(BaseModel):
    provider: AIProvider
    model: str
    expires_at: datetime


class APIKeyStatus(BaseModel):
    configured: bool
    active_provider: AIProvider | None = None
    active_model: str | None = None
    configurations: list[ProviderConfiguration] = Field(default_factory=list)


class ChatHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=settings.ai_max_message_chars)

    @field_validator("content")
    @classmethod
    def clean_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Message cannot be empty")
        return cleaned


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.ai_max_message_chars)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=settings.ai_max_history_messages)
    provider: AIProvider | None = None

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Message cannot be empty")
        return cleaned


class ChatResponse(BaseModel):
    in_scope: bool
    answer: str
    suggestions: list[str] = Field(default_factory=list, max_length=5)
    provider: AIProvider
    model: str


@router.get("/providers")
async def providers(_=Depends(get_current_user)):
    return {"providers": [
        {"id": provider, "models": list(models)}
        for provider, models in AI_PROVIDER_MODELS.items()
    ]}


@router.post("/session-key", response_model=APIKeyStatus)
async def configure_session_key(
    payload: APIKeyRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    if payload.model not in AI_PROVIDER_MODELS.get(payload.provider, ()):
        raise HTTPException(status_code=400, detail="Unsupported AI provider or model selection.")
    api_key = payload.api_key.get_secret_value().strip()
    try:
        await validate_provider_key(payload.provider, payload.model, api_key)
    except XAIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    ai_session_keys.put(
        request_session_id(request), current_user["id"], payload.provider, payload.model, api_key
    )
    return _session_status(request, current_user["id"])


@router.get("/session-key/status", response_model=APIKeyStatus)
async def session_key_status(request: Request, current_user=Depends(get_current_user)):
    return _session_status(request, current_user["id"])


@router.patch("/session-key/active", response_model=APIKeyStatus)
async def activate_provider(
    payload: ActiveProviderRequest,
    request: Request,
    current_user=Depends(get_current_user),
):
    if not ai_session_keys.activate(request_session_id(request), current_user["id"], payload.provider):
        raise HTTPException(status_code=404, detail="That AI provider is not configured for this session.")
    return _session_status(request, current_user["id"])


@router.delete("/session-key/{provider}", response_model=APIKeyStatus)
async def remove_provider_key(
    provider: AIProvider,
    request: Request,
    current_user=Depends(get_current_user),
):
    ai_session_keys.remove_provider(request_session_id(request), current_user["id"], provider)
    return _session_status(request, current_user["id"])


@router.delete("/session-key", status_code=204)
async def remove_all_session_keys(request: Request, _=Depends(get_current_user)):
    ai_session_keys.remove(request_session_id(request))


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, request: Request, current_user=Depends(get_current_user)):
    history = _bounded_history([item.model_dump() for item in payload.history])
    session_id = request_session_id(request)
    stored = _get_chat_provider(session_id, current_user["id"], payload.provider)
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_428_PRECONDITION_REQUIRED,
            detail="Add an AI provider API key in Settings for this session.",
        )
    provider, model, api_key, _ = stored
    if not local_scope_allows(payload.message, history):
        return {
            "in_scope": False,
            "answer": ACCOUNTING_REFUSAL,
            "suggestions": [],
            "provider": provider,
            "model": model,
        }
    try:
        result = await request_provider_reply(provider, model, api_key, payload.message, history)
    except XAIError as exc:
        if exc.invalid_key:
            ai_session_keys.remove_provider(session_id, current_user["id"], provider)
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {**result, "provider": provider, "model": model}


@router.post("/chat/stream")
async def stream_chat(payload: ChatRequest, request: Request, current_user=Depends(get_current_user)):
    history = _bounded_history([item.model_dump() for item in payload.history])
    session_id = request_session_id(request)
    stored = _get_chat_provider(session_id, current_user["id"], payload.provider)
    if not stored:
        detail = (
            f"{payload.provider.title()} is not configured for this session. Add its API key in Settings."
            if payload.provider else "Add an AI provider API key in Settings for this session."
        )
        raise HTTPException(status_code=status.HTTP_428_PRECONDITION_REQUIRED, detail=detail)
    provider, model, api_key, _ = stored

    async def events():
        yield _stream_event({"type": "start", "provider": provider, "model": model})
        if not local_scope_allows(payload.message, history):
            yield _stream_event({
                "type": "done",
                "response": {
                    "in_scope": False, "answer": ACCOUNTING_REFUSAL, "suggestions": [],
                    "provider": provider, "model": model,
                },
            })
            return

        raw = ""
        emitted = ""
        try:
            async for chunk in stream_provider_reply(
                provider, model, api_key, payload.message, history
            ):
                raw += chunk
                visible = _partial_answer(raw)
                if visible and not streamed_output_allows(visible):
                    yield _stream_event({
                        "type": "done",
                        "response": {
                            "in_scope": False, "answer": ACCOUNTING_REFUSAL,
                            "suggestions": [], "provider": provider, "model": model,
                        },
                    })
                    return
                # Retain a small tail so a prohibited phrase spanning provider
                # chunks can be rejected before any part of that phrase is sent.
                safe_visible = visible[:-24] if len(visible) > 24 else ""
                if safe_visible.startswith(emitted) and len(safe_visible) > len(emitted):
                    delta = safe_visible[len(emitted):]
                    emitted = safe_visible
                    yield _stream_event({"type": "delta", "delta": delta})
            result = validate_streamed_reply(raw, provider.title())
            yield _stream_event({
                "type": "done",
                "response": {**result, "provider": provider, "model": model},
            })
        except asyncio.CancelledError:
            raise
        except XAIError as exc:
            if exc.invalid_key:
                ai_session_keys.remove_provider(session_id, current_user["id"], provider)
            yield _stream_event({
                "type": "error", "provider": provider, "code": exc.code,
                "message": str(exc), "retryable": exc.retryable,
            })

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _get_chat_provider(session_id: str, user_id: str, provider: AIProvider | None):
    if provider:
        return ai_session_keys.get_provider(session_id, user_id, provider)
    return ai_session_keys.get_active(session_id, user_id)


def _stream_event(event: dict) -> str:
    return json.dumps(event, separators=(",", ":")) + "\n"


def _partial_answer(raw: str) -> str:
    """Decode the complete portion of the answer JSON string for safe rendering."""
    match = re.search(r'"answer"\s*:\s*"', raw)
    if not match:
        return ""
    source = raw[match.end():]
    result: list[str] = []
    index = 0
    escapes = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
    while index < len(source):
        char = source[index]
        if char == '"':
            break
        if char != "\\":
            result.append(char)
            index += 1
            continue
        if index + 1 >= len(source):
            break
        escaped = source[index + 1]
        if escaped == "u":
            digits = source[index + 2:index + 6]
            if len(digits) < 4 or not all(value in "0123456789abcdefABCDEF" for value in digits):
                break
            result.append(chr(int(digits, 16)))
            index += 6
            continue
        if escaped not in escapes:
            break
        result.append(escapes[escaped])
        index += 2
    return "".join(result)


def _session_status(request: Request, user_id: str) -> dict:
    state = ai_session_keys.status(request_session_id(request), user_id)
    active_provider = state["active_provider"]
    active_model = next(
        (item["model"] for item in state["configurations"] if item["provider"] == active_provider),
        None,
    )
    return {
        "configured": bool(state["configurations"]),
        "active_provider": active_provider,
        "active_model": active_model,
        "configurations": state["configurations"],
    }


def _bounded_history(history: list[dict[str, str]]) -> list[dict[str, str]]:
    bounded = history[-settings.ai_default_history_messages:]
    total = 0
    selected: list[dict[str, str]] = []
    for item in reversed(bounded):
        length = len(item["content"])
        if total + length > settings.ai_max_context_chars:
            break
        selected.append(item)
        total += length
    return list(reversed(selected))
