from contextlib import asynccontextmanager
from collections import defaultdict, deque
import hashlib
import time
import jwt

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request

from app.core.config import settings
from app.core.security import ALGORITHM
from app.core.database import close_mongo_connection, connect_to_mongo, ensure_indexes, get_database
from app.routes import accounts, admin, auth, content, journals, notifications, reports, settings as settings_routes, transactions, vouchers
# from scripts.seed import main
from datetime import datetime, UTC
from fastapi.responses import JSONResponse
STARTED_AT = datetime.now(UTC)


class RequestSizeLimitMiddleware:
    def __init__(self, app, default_limit: int, excel_limit: int):
        self.app = app
        self.default_limit = default_limit
        self.excel_limit = excel_limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        limit = self.excel_limit if "/import-excel" in path else self.default_limit
        headers = dict(scope.get("headers", []))
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > limit:
                    await self._reject(send)
                    return
            except ValueError:
                await self._reject(send)
                return
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise ValueError("request body too large")
            return message

        try:
            await self.app(scope, limited_receive, send)
        except ValueError as exc:
            if str(exc) != "request body too large":
                raise
            await self._reject(send)

    @staticmethod
    async def _reject(send):
        body = b'{"detail":"Request body too large"}'
        await send({
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})


class LocalRateLimiter:
    def __init__(self):
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def consume(self, key: str, limit: int, window_seconds: int = 60) -> int | None:
        now = time.monotonic()
        events = self._events[key]
        threshold = now - window_seconds
        while events and events[0] <= threshold:
            events.popleft()
        if len(events) >= limit:
            return max(1, int(window_seconds - (now - events[0])))
        events.append(now)
        return None


api_limiter = LocalRateLimiter()


def validate_security_configuration() -> None:
    if not settings.is_secure_environment:
        return
    if settings.jwt_secret == "accounting-local-dev-secret" or len(settings.jwt_secret) < 32:
        raise RuntimeError(
            "JWT_SECRET must be a unique value of at least 32 characters in secure environments")
    if not settings.cookie_secure:
        raise RuntimeError("COOKIE_SECURE must be enabled in stage and production")


@asynccontextmanager
async def lifespan(_: FastAPI):
    print(
        f"\nStarting up the {settings.app_name} on env:{settings.env.lower()}...\n")
    validate_security_configuration()
    await connect_to_mongo()
    await ensure_indexes()
    await content.ensure_default_content()
    # await main()
    try:
        yield
    finally:
        await close_mongo_connection()


app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

app.add_middleware(TrustedHostMiddleware,
                   allowed_hosts=settings.allowed_host_list)
app.add_middleware(
    RequestSizeLimitMiddleware,
    default_limit=settings.max_json_body_bytes,
    excel_limit=settings.max_excel_upload_bytes,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.url.path.startswith("/api"):
        token = request.cookies.get(settings.auth_cookie_name)
        authorization = request.headers.get("authorization", "")
        if not token and authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
        identity = "anonymous"
        if token:
            try:
                payload = jwt.decode(
                    token,
                    settings.jwt_secret,
                    algorithms=[ALGORITHM],
                    issuer=settings.jwt_issuer,
                    audience=settings.jwt_audience,
                    options={"require": ["sub", "exp", "iss", "aud"]},
                )
                identity = f"user:{payload['sub']}"
            except jwt.InvalidTokenError:
                identity = f"token:{hashlib.sha256(token.encode('utf-8')).hexdigest()}"
        client = request.client.host if request.client else "unknown"
        if request.url.path.startswith("/api/reports"):
            rate_scope, rate_limit = "reports", settings.report_requests_per_minute
        elif "/import-excel" in request.url.path:
            rate_scope, rate_limit = "imports", settings.import_requests_per_minute
        else:
            rate_scope, rate_limit = "api", settings.api_requests_per_minute
        retry_after = api_limiter.consume(
            f"{rate_scope}:{client}:{identity}", rate_limit)
        if retry_after is not None:
            return JSONResponse(
                {"detail": "Too many requests"},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        origin = request.headers.get("origin")
        allowed = not origin or origin in settings.cors_origin_list
        if not allowed:
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path not in {"/docs", "/redoc", "/openapi.json"}:
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if settings.is_secure_environment:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
async def health_check():
    if settings.is_secure_environment:
        try:
            await get_database().command("ping")
        except Exception:
            return JSONResponse(status_code=503, content={"status": "down"})
        return {"status": "ok"}
    now = datetime.now(UTC)
    checks = {
        "api": "ok",
        "database": "ok",
    }
    status_code = 200
    status = "ok"

    try:
        await get_database().command("ping")
    except Exception:
        checks["database"] = "down"
        status = "down"
        status_code = 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": status,
            "service": settings.app_name,
            "environment": settings.env,
            "timestamp": now.isoformat(),
            "uptime_seconds": int((now - STARTED_AT).total_seconds()),
            "checks": checks,
        },
    )


app.include_router(auth.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(journals.router, prefix="/api")
app.include_router(vouchers.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(settings_routes.router, prefix="/api")
app.include_router(content.router, prefix="/api")
