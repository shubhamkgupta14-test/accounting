from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import os

import jwt

from app.core.config import settings

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 210_000


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        scheme, iterations, salt, digest = hashed_password.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        computed = _pbkdf2(plain_password, base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(base64.b64decode(digest), computed)
    except (ValueError, TypeError):
        return False


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = _pbkdf2(password, salt, PBKDF2_ITERATIONS)
    return "$".join([
        "pbkdf2_sha256",
        str(PBKDF2_ITERATIONS),
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    ])


def _pbkdf2(password: str, salt: bytes, iterations: int) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


def create_access_token(subject: str, role: str, token_version: int = 0) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": subject, "role": role, "ver": token_version, "iat": datetime.now(timezone.utc), "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)
