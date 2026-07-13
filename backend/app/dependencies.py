import logging

from fastapi import Cookie, Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from bson import ObjectId

from app.core.config import settings
from app.core.database import get_database
from app.core.security import ALGORITHM
from app.utils import serialize_doc

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=False)


async def get_current_user(
    session: str | None = Cookie(
        default=None, alias=settings.auth_cookie_name),
    bearer_token: str | None = Security(oauth2_scheme),
):
    token = bearer_token or session
    if not token:
        logger.warning("No bearer token or auth cookie received for protected route")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(token, settings.jwt_secret,
                             algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        logger.debug("Decoded auth token for user %s", user_id)
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid auth token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"}) from exc
    if not user_id:
        logger.warning("Auth token missing subject")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    db = get_database()
    if not ObjectId.is_valid(user_id):
        logger.warning(
            "Auth token subject is not a valid ObjectId: %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(user_id), "is_active": True})
    if not user:
        logger.warning("No active user found for token subject %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if int(payload.get("ver", 0)) != int(user.get("token_version", 0)):
        logger.warning("Token version mismatch for user %s: token=%s db=%s",
                       user_id, payload.get("ver", 0), user.get("token_version", 0))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    clean_user = serialize_doc(user)
    clean_user.pop("password_hash", None)
    return clean_user


def require_roles(*roles: str):
    async def checker(current_user=Depends(get_current_user)):
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user

    return checker
