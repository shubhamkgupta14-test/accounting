from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request

from app.core.config import settings
from app.core.database import close_mongo_connection, connect_to_mongo, ensure_indexes, get_database
from app.routes import accounts, admin, auth, content, journals, notifications, reports, settings as settings_routes, transactions, vouchers
# from scripts.seed import main
from datetime import datetime, UTC
from fastapi.responses import JSONResponse
from app.core.config import Settings
from urllib.parse import urlparse

STARTED_AT = datetime.now(UTC)


@asynccontextmanager
async def lifespan(_: FastAPI):
    print(
        f"\n🚀 Starting up the {settings.app_name} on env:{settings.env.lower()}...\n")
    if settings.env.lower() in {"prod", "production"}:
        if settings.jwt_secret == "accounting-local-dev-secret" or len(settings.jwt_secret) < 32:
            raise RuntimeError(
                "JWT_SECRET must be a unique value of at least 32 characters in production")
        if not settings.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be enabled in production")
    await connect_to_mongo()
    await ensure_indexes()
    await content.ensure_default_content()
    # await main()
    try:
        yield
    finally:
        await close_mongo_connection()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware,
                   allowed_hosts=settings.allowed_host_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        origin = request.headers.get("origin")
        allowed = not origin or origin in settings.cors_origin_list
        if origin and settings.env.lower() not in {"prod", "production"}:
            parsed_origin = urlparse(origin)
            allowed = allowed or (
                parsed_origin.scheme in {"http", "https"}
                and parsed_origin.hostname in {"localhost", "127.0.0.1"}
            )
        if not allowed:
            from fastapi.responses import JSONResponse
            return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
async def health_check():
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
