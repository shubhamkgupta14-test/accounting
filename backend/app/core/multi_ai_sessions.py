from dataclasses import dataclass, field
from datetime import UTC, datetime
import hashlib
import threading
import time

from fastapi import HTTPException, Request, status

from app.core.config import settings


@dataclass(slots=True)
class _ProviderKey:
    api_key: str
    model: str
    idle_expires_at: float
    absolute_expires_at: float


@dataclass(slots=True)
class _AISession:
    user_id: str
    providers: dict[str, _ProviderKey] = field(default_factory=dict)
    active_provider: str | None = None


class MultiAISessionKeyVault:
    """Process-local storage for short-lived, user-supplied AI provider keys."""

    def __init__(self) -> None:
        self._sessions: dict[str, _AISession] = {}
        self._lock = threading.Lock()

    def put(self, session_id: str, user_id: str, provider: str, model: str, api_key: str) -> datetime:
        now = time.time()
        absolute_ttl = max(60, settings.jwt_expires_minutes * 60)
        idle_ttl = max(60, settings.ai_key_idle_minutes * 60)
        entry = _ProviderKey(
            api_key=api_key,
            model=model,
            idle_expires_at=min(now + idle_ttl, now + absolute_ttl),
            absolute_expires_at=now + absolute_ttl,
        )
        with self._lock:
            self._purge_expired_locked(now)
            session = self._sessions.get(session_id)
            if not session or session.user_id != user_id:
                session = _AISession(user_id=user_id)
                self._sessions[session_id] = session
            previous = session.providers.get(provider)
            if previous:
                previous.api_key = ""
            session.providers[provider] = entry
            session.active_provider = provider
        return datetime.fromtimestamp(entry.idle_expires_at, UTC)

    def get_active(self, session_id: str, user_id: str) -> tuple[str, str, str, datetime] | None:
        now = time.time()
        with self._lock:
            self._purge_expired_locked(now)
            session = self._sessions.get(session_id)
            if not session or session.user_id != user_id or not session.active_provider:
                return None
            provider = session.active_provider
            entry = session.providers.get(provider)
            if not entry:
                self._select_next_provider_locked(session)
                if not session.active_provider:
                    return None
                provider = session.active_provider
                entry = session.providers[provider]
            idle_ttl = max(60, settings.ai_key_idle_minutes * 60)
            entry.idle_expires_at = min(now + idle_ttl, entry.absolute_expires_at)
            return provider, entry.model, entry.api_key, datetime.fromtimestamp(entry.idle_expires_at, UTC)

    def status(self, session_id: str, user_id: str) -> dict:
        now = time.time()
        with self._lock:
            self._purge_expired_locked(now)
            session = self._sessions.get(session_id)
            if not session or session.user_id != user_id:
                return {"active_provider": None, "configurations": []}
            return {
                "active_provider": session.active_provider,
                "configurations": [
                    {
                        "provider": provider,
                        "model": entry.model,
                        "expires_at": datetime.fromtimestamp(entry.idle_expires_at, UTC),
                    }
                    for provider, entry in session.providers.items()
                ],
            }

    def activate(self, session_id: str, user_id: str, provider: str) -> bool:
        now = time.time()
        with self._lock:
            self._purge_expired_locked(now)
            session = self._sessions.get(session_id)
            if not session or session.user_id != user_id or provider not in session.providers:
                return False
            session.active_provider = provider
            return True

    def remove_provider(self, session_id: str, user_id: str, provider: str) -> None:
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.user_id != user_id:
                return
            entry = session.providers.pop(provider, None)
            if entry:
                entry.api_key = ""
            if session.active_provider == provider:
                self._select_next_provider_locked(session)
            if not session.providers:
                self._sessions.pop(session_id, None)

    def remove(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session:
                self._clear_session_locked(session)

    def clear(self) -> None:
        with self._lock:
            for session in self._sessions.values():
                self._clear_session_locked(session)
            self._sessions.clear()

    @staticmethod
    def _select_next_provider_locked(session: _AISession) -> None:
        session.active_provider = next(iter(session.providers), None)

    @staticmethod
    def _clear_session_locked(session: _AISession) -> None:
        for entry in session.providers.values():
            entry.api_key = ""
        session.providers.clear()
        session.active_provider = None

    def _purge_expired_locked(self, now: float) -> None:
        empty_sessions: list[str] = []
        for session_id, session in self._sessions.items():
            expired = [
                provider for provider, entry in session.providers.items()
                if entry.idle_expires_at <= now or entry.absolute_expires_at <= now
            ]
            for provider in expired:
                entry = session.providers.pop(provider)
                entry.api_key = ""
            if session.active_provider not in session.providers:
                self._select_next_provider_locked(session)
            if not session.providers:
                empty_sessions.append(session_id)
        for session_id in empty_sessions:
            self._sessions.pop(session_id, None)


ai_session_keys = MultiAISessionKeyVault()


def request_session_id(request: Request) -> str:
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def remove_request_session_key(request: Request) -> None:
    try:
        ai_session_keys.remove(request_session_id(request))
    except HTTPException:
        return
