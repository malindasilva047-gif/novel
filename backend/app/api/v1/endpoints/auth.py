from uuid import uuid4
from datetime import datetime, timedelta, timezone
import random
import smtplib

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.deps import get_database
from app.services.email import send_verification_email
from app.schemas.auth import (
    ActionMessageResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserLogin,
    UserSignup,
    UserSignupResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class AdminBootstrapPayload(BaseModel):
    email: EmailStr
    bootstrap_key: str


class ResendVerificationPayload(BaseModel):
    email: EmailStr


@router.post("/signup", response_model=UserSignupResponse)
async def signup(payload: UserSignup, database: AsyncIOMotorDatabase = Depends(get_database)) -> UserSignupResponse:
    settings = get_settings()
    existing_email = await database.users.find_one({"email": payload.email})
    if existing_email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    existing_username = await database.users.find_one({"username": payload.username})
    if existing_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered")

    user_id = str(uuid4())
    verification_token = f"{random.randint(100000, 999999)}"
    user_doc = {
        "_id": user_id,
        "username": payload.username,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "is_email_verified": False,
        "bio": "",
        "profile_image": "",
        "is_admin": False,
        "followers_count": 0,
        "following_count": 0,
        "full_name": "",
        "location": "",
        "website": "",
        "favorite_genres": [],
        "reading_goal": "",
    }
    await database.users.insert_one(user_doc)
    await database.email_verification_tokens.insert_one(
        {
            "_id": f"{payload.email}::{verification_token}",
            "email": payload.email,
            "token": verification_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        }
    )
    try:
        send_verification_email(payload.email, verification_token)
    except (smtplib.SMTPException, OSError) as exc:
        if settings.smtp_username and settings.smtp_password:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not send verification email. Check SMTP configuration and try again.",
            ) from exc
    return UserSignupResponse(
        message="Signup successful. Verify your email before login.",
        verification_token=verification_token,
    )


@router.post("/register", response_model=UserSignupResponse)
async def register(payload: UserSignup, database: AsyncIOMotorDatabase = Depends(get_database)) -> UserSignupResponse:
    return await signup(payload, database)


@router.post("/login", response_model=TokenResponse)
async def login(payload: UserLogin, database: AsyncIOMotorDatabase = Depends(get_database)) -> TokenResponse:
    identifier = payload.identifier.strip()
    user = await database.users.find_one({"$or": [{"email": identifier}, {"username": identifier}]})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username/email or password")
    if user.get("is_banned", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    if not user.get("is_email_verified", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email before login")

    access_token = create_access_token(subject=user["_id"])
    return TokenResponse(access_token=access_token)


@router.post("/verify-email", response_model=ActionMessageResponse)
async def verify_email(
    payload: VerifyEmailRequest,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> ActionMessageResponse:
    token_doc = await database.email_verification_tokens.find_one(
        {
            "email": payload.email,
            "token": payload.token,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    if not token_doc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification token")

    await database.users.update_one({"email": payload.email}, {"$set": {"is_email_verified": True}})
    await database.email_verification_tokens.delete_many({"email": payload.email})
    return ActionMessageResponse(message="Email verified successfully")


@router.post("/resend-verification", response_model=UserSignupResponse)
async def resend_verification(
    payload: ResendVerificationPayload,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> UserSignupResponse:
    settings = get_settings()
    user = await database.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")
    if user.get("is_email_verified", False):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")

    verification_token = f"{random.randint(100000, 999999)}"
    await database.email_verification_tokens.delete_many({"email": payload.email})
    await database.email_verification_tokens.insert_one(
        {
            "_id": f"{payload.email}::{verification_token}",
            "email": payload.email,
            "token": verification_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        }
    )
    try:
        send_verification_email(payload.email, verification_token)
    except (smtplib.SMTPException, OSError) as exc:
        if settings.smtp_username and settings.smtp_password:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not resend verification email. Check SMTP configuration and try again.",
            ) from exc
    return UserSignupResponse(
        message="Verification code regenerated.",
        verification_token=verification_token,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(
    payload: ForgotPasswordRequest,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> ForgotPasswordResponse:
    user = await database.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")

    reset_token = str(uuid4())
    await database.password_reset_tokens.insert_one(
        {
            "_id": f"{payload.email}::{reset_token}",
            "email": payload.email,
            "token": reset_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
        }
    )
    return ForgotPasswordResponse(
        message="Password reset token generated. In production, send this by email.",
        reset_token=reset_token,
    )


@router.post("/reset-password", response_model=ActionMessageResponse)
async def reset_password(
    payload: ResetPasswordRequest,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> ActionMessageResponse:
    token_doc = await database.password_reset_tokens.find_one(
        {
            "email": payload.email,
            "token": payload.token,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        }
    )
    if not token_doc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    await database.users.update_one({"email": payload.email}, {"$set": {"password_hash": hash_password(payload.new_password)}})
    await database.password_reset_tokens.delete_many({"email": payload.email})
    return ActionMessageResponse(message="Password reset successful")


@router.post("/bootstrap-admin", response_model=ActionMessageResponse)
async def bootstrap_admin(
    payload: AdminBootstrapPayload,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> ActionMessageResponse:
    settings = get_settings()
    if payload.bootstrap_key != settings.admin_bootstrap_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid bootstrap key")

    user = await database.users.find_one({"email": payload.email})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await database.users.update_one({"email": payload.email}, {"$set": {"is_admin": True}})
    return ActionMessageResponse(message="User promoted to admin")


@router.get("/bootstrap-admin", response_model=ActionMessageResponse)
async def bootstrap_admin_help() -> ActionMessageResponse:
    return ActionMessageResponse(
        message="Use POST /api/v1/auth/bootstrap-admin with JSON body: { email, bootstrap_key }"
    )
