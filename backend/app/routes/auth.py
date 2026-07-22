from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.database import get_database
from app.core.security import create_access_token, hash_password, verify_password
from app.core.multi_ai_sessions import remove_request_session_key
from app.dependencies import get_current_user, require_roles
from app.email import send_html_email
from app.email_templates import otp_email_html
from app.schemas import LoginRequest, Role, UserCreate
from app.utils import object_id, serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/auth", tags=["auth"])
DUMMY_PASSWORD_HASH = hash_password("invalid-password-placeholder")
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_PAIR_LIMIT = 5
LOGIN_ACCOUNT_LIMIT = 10
LOGIN_IP_LIMIT = 30
RESET_WINDOW_SECONDS = 15 * 60


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite.lower(),
        max_age=settings.jwt_expires_minutes * 60,
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite.lower(),
    )


class AuthResponse(BaseModel):
    user: dict


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=10, max_length=128)


class ProfileUpdate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    audit_mode: bool = False


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _rate_id(scope: str, value: str) -> str:
    digest = hashlib.sha256(value.casefold().encode("utf-8")).hexdigest()
    return f"{scope}:{digest}"


def _retry_after(rate: dict, now: datetime, window_seconds: int) -> int:
    started = rate.get("window_started", now).replace(tzinfo=timezone.utc)
    return max(1, int(window_seconds - (now - started).total_seconds()))


async def _assert_not_limited(rate_id: str, limit: int, window_seconds: int) -> None:
    now = datetime.now(timezone.utc)
    rate = await get_database().auth_rate_limits.find_one({"_id": rate_id})
    if not rate:
        return
    started = rate.get("window_started", now).replace(tzinfo=timezone.utc)
    if started <= now - timedelta(seconds=window_seconds):
        return
    if int(rate.get("attempts", 0)) >= limit:
        retry_after = _retry_after(rate, now, window_seconds)
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later",
            headers={"Retry-After": str(retry_after)},
        )


async def _record_rate_event(rate_id: str, window_seconds: int) -> None:
    db = get_database()
    now = datetime.now(timezone.utc)
    rate = await db.auth_rate_limits.find_one({"_id": rate_id})
    started = rate.get("window_started", now).replace(tzinfo=timezone.utc) if rate else now
    if not rate or started <= now - timedelta(seconds=window_seconds):
        await db.auth_rate_limits.update_one(
            {"_id": rate_id},
            {"$set": {"attempts": 1, "window_started": now, "updated_at": now}},
            upsert=True,
        )
        return
    await db.auth_rate_limits.update_one(
        {"_id": rate_id},
        {"$inc": {"attempts": 1}, "$set": {"updated_at": now}},
    )


async def _consume_rate(rate_id: str, limit: int, window_seconds: int) -> None:
    await _assert_not_limited(rate_id, limit, window_seconds)
    await _record_rate_event(rate_id, window_seconds)


async def _authenticate_user(email: str, password: str, request: Request):
    db = get_database()
    normalized_email = email.lower()
    client_ip = _client_ip(request)
    rate_ids = [
        (_rate_id("login-pair", f"{normalized_email}:{client_ip}"), LOGIN_PAIR_LIMIT),
        (_rate_id("login-account", normalized_email), LOGIN_ACCOUNT_LIMIT),
        (_rate_id("login-ip", client_ip), LOGIN_IP_LIMIT),
    ]
    for rate_id, limit in rate_ids:
        await _assert_not_limited(rate_id, limit, LOGIN_WINDOW_SECONDS)
    user = await db.users.find_one({"email": normalized_email, "is_active": True})
    password_valid = verify_password(
        password, user["password_hash"] if user else DUMMY_PASSWORD_HASH)
    if not user or not password_valid:
        for rate_id, _ in rate_ids:
            await _record_rate_event(rate_id, LOGIN_WINDOW_SECONDS)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    await db.auth_rate_limits.delete_one({"_id": rate_ids[0][0]})
    return user


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, request: Request):
    user = await _authenticate_user(payload.email, payload.password, request)

    token = create_access_token(
        str(user["_id"]), user["role"], user.get("token_version", 0))
    _set_auth_cookie(response, token)
    clean_user = serialize_doc(user)
    clean_user.pop("password_hash", None)
    return {"user": clean_user}


@router.post("/token", response_model=TokenResponse)
async def oauth2_token(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    user = await _authenticate_user(form.username, form.password, request)
    token = create_access_token(
        str(user["_id"]), user["role"], user.get("token_version", 0))
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, current_user=Depends(get_current_user)):
    remove_request_session_key(request)
    await get_database().users.update_one(
        {"_id": object_id(current_user["id"], "User")},
        {"$inc": {"token_version": 1}, "$set": {
            "updated_at": datetime.now(timezone.utc)}},
    )
    _clear_auth_cookie(response)


@router.get("/me")
async def me(current_user=Depends(get_current_user)):
    current_user.pop("password_hash", None)
    return current_user


@router.get("/users")
async def list_users(_: dict = Depends(require_roles("superadmin"))):
    docs = await get_database().users.find({}, {"password_hash": 0}).sort("created_at", -1).to_list(200)
    return serialize_many(docs)


@router.get("/users/page")
async def page_users(
    params: PageParams = Depends(), search: str | None = None,
    role: Role | None = None, is_active: bool | None = None,
    sort_by: Literal["created_at", "email", "first_name", "role"] = "created_at", sort_order: SortOrder = "desc",
    _: dict = Depends(require_roles("superadmin")),
):
    query: dict = {}
    pattern = safe_search(search)
    if pattern:
        query["$or"] = [{field: {"$regex": pattern, "$options": "i"}} for field in ("first_name", "last_name", "email")]
    if role: query["role"] = role
    if is_active is not None: query["is_active"] = is_active
    db = get_database()
    total = await db.users.count_documents(query)
    docs = await db.users.find(query, {"password_hash": 0}).sort(sort_by, sort_direction(sort_order)).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    return page_response(docs, params, total)


@router.post("/users", status_code=201)
async def create_user(payload: UserCreate, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")
    doc = {
        "first_name": payload.first_name,
        "last_name": payload.last_name,
        "email": payload.email.lower(),
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    created = await db.users.find_one({"_id": result.inserted_id}, {"password_hash": 0})
    return serialize_doc(created)


@router.patch("/users/{user_id}/status")
async def set_user_status(user_id: str, is_active: bool, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    result = await db.users.update_one(
        {"_id": object_id(user_id, "User")},
        {"$set": {"is_active": is_active,
                  "updated_at": datetime.now(timezone.utc)},
         "$inc": {"token_version": 1}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    user = await db.users.find_one({"_id": object_id(user_id, "User")}, {"password_hash": 0})
    return serialize_doc(user)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, current_user=Depends(require_roles("superadmin"))):
    from bson import ObjectId
    if user_id == current_user["id"]:
        raise HTTPException(
            status_code=400, detail="You cannot delete your own user")
    result = await get_database().users.delete_one({"_id": object_id(user_id, "User")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")


@router.post("/change-password")
async def change_password(payload: PasswordChange, response: Response, current_user=Depends(get_current_user)):
    db = get_database()
    user = await db.users.find_one({"_id": object_id(current_user["id"], "User")})
    if not user or not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(
            status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(timezone.utc)}, "$inc": {"token_version": 1}})
    token = create_access_token(
        str(user["_id"]), user["role"], int(user.get("token_version", 0)) + 1)
    _set_auth_cookie(response, token)
    return {"message": "Password updated"}


@router.patch("/profile")
async def update_profile(payload: ProfileUpdate, current_user=Depends(get_current_user)):
    from bson import ObjectId
    db = get_database()
    existing = await db.users.find_one({"email": payload.email.lower(), "_id": {"$ne": ObjectId(current_user["id"])}})
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists")
    await db.users.update_one(
        {"_id": ObjectId(current_user["id"])},
        {"$set": {
            "first_name": payload.first_name,
            "last_name": payload.last_name,
            "email": payload.email.lower(),
            "audit_mode": payload.audit_mode,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])}, {"password_hash": 0})
    return serialize_doc(user)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    db = get_database()
    normalized_email = payload.email.lower()
    await _consume_rate(
        _rate_id("forgot-ip", _client_ip(request)), 20, 60 * 60)
    await _consume_rate(
        _rate_id("forgot-account", normalized_email), 5, 60 * 60)
    generic = {
        "message": "If the email exists, an OTP has been sent",
        "cooldown_seconds": settings.otp_resend_cooldown_seconds,
    }
    # Perform the same expensive password-hash work for existing and unknown
    # accounts so recovery timing does not provide a cheap enumeration signal.
    otp = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = hash_password(otp)
    user = await db.users.find_one({"email": normalized_email, "is_active": True})
    if not user:
        return generic
    latest = await db.password_reset_otps.find_one({"email": normalized_email, "used": False}, sort=[("created_at", -1)])
    if latest:
        created_at = latest["created_at"].replace(tzinfo=timezone.utc)
        cooldown_until = created_at + \
            timedelta(seconds=settings.otp_resend_cooldown_seconds)
        if cooldown_until > datetime.now(timezone.utc):
            return generic
    await db.password_reset_otps.update_many(
        {"email": normalized_email, "used": False},
        {"$set": {"used": True, "superseded_at": datetime.now(timezone.utc)}},
    )
    doc = {
        "email": normalized_email,
        "otp_hash": otp_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expires_minutes),
        "used": False,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.password_reset_otps.insert_one(doc)
    html = otp_email_html(settings.app_name, otp)
    if settings.is_test_or_dev:
        return {**generic, "message": "OTP generated for dev/test", "otp": otp}
    send_html_email(
        payload.email, f"{settings.app_name} password reset OTP", html)
    return generic


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request):
    db = get_database()
    normalized_email = payload.email.lower()
    await _consume_rate(
        _rate_id("reset-ip", _client_ip(request)), 20, RESET_WINDOW_SECONDS)
    await _consume_rate(
        _rate_id("reset-account", normalized_email), 10, RESET_WINDOW_SECONDS)
    reset = await db.password_reset_otps.find_one({"email": normalized_email, "used": False}, sort=[("created_at", -1)])
    if not reset or reset["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400, detail="OTP is invalid or expired")
    if not verify_password(payload.otp, reset["otp_hash"]):
        attempts = int(reset.get("attempts", 0)) + 1
        await db.password_reset_otps.update_one({"_id": reset["_id"]}, {"$set": {"attempts": attempts, "used": attempts >= 5}})
        raise HTTPException(
            status_code=400, detail="OTP is invalid or expired")
    claimed = await db.password_reset_otps.update_one(
        {"_id": reset["_id"], "used": False},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(
            status_code=400, detail="OTP is invalid or expired")
    user = await db.users.find_one({"email": normalized_email, "is_active": True})
    if not user:
        raise HTTPException(
            status_code=400, detail="OTP is invalid or expired")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(timezone.utc)}, "$inc": {"token_version": 1}})
    return {"message": "Password reset successful"}
