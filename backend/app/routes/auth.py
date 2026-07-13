from datetime import datetime, timedelta, timezone
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.database import get_database
from app.core.security import create_access_token, hash_password, verify_password
from app.dependencies import get_current_user, require_roles
from app.email import send_html_email
from app.email_templates import otp_email_html
from app.schemas import LoginRequest, Role, UserCreate
from app.utils import object_id, serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/auth", tags=["auth"])
DUMMY_PASSWORD_HASH = hash_password("invalid-password-placeholder")


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


async def _authenticate_user(email: str, password: str, request: Request):
    db = get_database()
    now = datetime.now(timezone.utc)
    normalized_email = email.lower()
    rate_key = f"{normalized_email}:{request.client.host if request.client else 'unknown'}"
    rate = await db.auth_rate_limits.find_one({"_id": rate_key})
    if rate and rate.get("blocked_until") and rate["blocked_until"].replace(tzinfo=timezone.utc) > now:
        raise HTTPException(
            status_code=429, detail="Too many login attempts. Please try again later")
    user = await db.users.find_one({"email": normalized_email, "is_active": True})
    password_valid = verify_password(
        password, user["password_hash"] if user else DUMMY_PASSWORD_HASH)
    if not user or not password_valid:
        attempts = int(rate.get("attempts", 0)) + 1 if rate and rate.get("updated_at",
                                                                         now).replace(tzinfo=timezone.utc) > now - timedelta(minutes=15) else 1
        update = {"attempts": attempts, "updated_at": now}
        if attempts >= 5:
            update["blocked_until"] = now + timedelta(minutes=15)
        await db.auth_rate_limits.update_one({"_id": rate_key}, {"$set": update}, upsert=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    await db.auth_rate_limits.delete_one({"_id": rate_key})
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
async def logout(response: Response, current_user=Depends(get_current_user)):
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
    from bson import ObjectId
    db = get_database()
    result = await db.users.update_one(
        {"_id": object_id(user_id, "User")},
        {"$set": {"is_active": is_active,
                  "updated_at": datetime.now(timezone.utc)}},
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
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])}, {"password_hash": 0})
    return serialize_doc(user)


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    db = get_database()
    user = await db.users.find_one({"email": payload.email.lower(), "is_active": True})
    if not user:
        return {"message": "If the email exists, an OTP has been sent", "cooldown_seconds": settings.otp_resend_cooldown_seconds}
    latest = await db.password_reset_otps.find_one({"email": payload.email.lower(), "used": False}, sort=[("created_at", -1)])
    if latest:
        created_at = latest["created_at"].replace(tzinfo=timezone.utc)
        cooldown_until = created_at + \
            timedelta(seconds=settings.otp_resend_cooldown_seconds)
        if cooldown_until > datetime.now(timezone.utc):
            wait = int(
                (cooldown_until - datetime.now(timezone.utc)).total_seconds())
            raise HTTPException(
                status_code=429, detail=f"Please wait {wait} seconds before requesting another OTP")
    otp = f"{secrets.randbelow(900000) + 100000}"
    doc = {
        "email": payload.email.lower(),
        "otp_hash": hash_password(otp),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=settings.otp_expires_minutes),
        "used": False,
        "attempts": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.password_reset_otps.insert_one(doc)
    html = otp_email_html(settings.app_name, otp)
    if settings.env.lower() in {"prod", "production"}:
        send_html_email(
            payload.email, f"{settings.app_name} password reset OTP", html)
        return {"message": "If the email exists, an OTP has been sent", "cooldown_seconds": settings.otp_resend_cooldown_seconds}
    return {"message": "OTP generated for local/dev", "otp": otp, "html": html, "cooldown_seconds": settings.otp_resend_cooldown_seconds}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    db = get_database()
    reset = await db.password_reset_otps.find_one({"email": payload.email.lower(), "used": False}, sort=[("created_at", -1)])
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
    user = await db.users.find_one({"email": payload.email.lower(), "is_active": True})
    if not user:
        raise HTTPException(
            status_code=400, detail="OTP is invalid or expired")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(timezone.utc)}, "$inc": {"token_version": 1}})
    return {"message": "Password reset successful"}
