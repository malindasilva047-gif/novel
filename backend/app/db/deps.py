from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.db.mongodb import db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_optional_database() -> AsyncIOMotorDatabase | None:
    return db.database


def get_database() -> AsyncIOMotorDatabase:
    if db.database is None:
        detail = "Database is not connected"
        if db.connection_error:
            detail = f"Database is unavailable: {db.connection_error}"
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
    return db.database


async def get_current_user(token: str = Depends(oauth2_scheme), database: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = await database.users.find_one({"_id": user_id})
    if user is None:
        raise credentials_exception
    if user.get("is_banned", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    return user
