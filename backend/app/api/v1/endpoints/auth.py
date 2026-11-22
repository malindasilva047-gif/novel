from uuid import uuid4
from datetime import datetime, timedelta, timezone
import logging
import json
import random
from urllib.request import urlopen
from urllib.error import URLError
from ipaddress import ip_address

from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.deps import get_database
from app.services.email import send_verification_email
from app.services.google_auth import generate_unique_username, normalize_email, verify_google_credential
from app.schemas.auth import (
    ActionMessageResponse,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GoogleAuthRequest,
    GoogleAuthResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserLogin,
    UserSignup,
    UserSignupResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)

ONBOARDING_PENDING_EMAIL = "pending_email_verification"
ONBOARDING_PENDING_PROFILE = "pending_profile"
ONBOARDING_ACTIVE = "active"


def _extract_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    return request.client.host if request.client else ""


def _is_public_ip(raw_ip: str) -> bool:
    if not raw_ip:
        return False
    try:
        parsed = ip_address(raw_ip)
    except ValueError:
        return False
    return not (parsed.is_loopback or parsed.is_private or parsed.is_reserved)


def _parse_geo_payload(provider: str, payload: str) -> tuple[str, str]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return "", ""

    if provider == "ipinfo":
        country_code = str(data.get("country") or "").strip().upper()
        country_name = str(data.get("country_name") or "").strip()
        return country_name, country_code

    country_name = str(data.get("country_name") or "").strip()
    country_code = str(data.get("country_code") or "").strip().upper()
    return country_name, country_code


def _resolve_country_from_ip(raw_ip: str) -> tuple[str, str]:
    if not _is_public_ip(raw_ip):
        return "", ""

    settings = get_settings()
    provider = settings.geolocation_provider.strip().lower()
    retries = max(1, int(settings.geolocation_retries))
    timeout = max(0.5, float(settings.geolocation_timeout_seconds))

    provider_urls: list[tuple[str, str]] = []
    if provider in ("auto", "ipinfo") and settings.ipinfo_token:
        provider_urls.append(("ipinfo", f"https://ipinfo.io/{raw_ip}/json?token={settings.ipinfo_token}"))
    if provider in ("auto", "ipapi", "ipapi.co"):
        provider_urls.append(("ipapi", f"https://ipapi.co/{raw_ip}/json/"))

    if not provider_urls and settings.ipinfo_token:
        provider_urls.append(("ipinfo", f"https://ipinfo.io/{raw_ip}/json?token={settings.ipinfo_token}"))

    for service, url in provider_urls:
        for _ in range(retries):
            try:
                with urlopen(url, timeout=timeout) as response:
                    payload = response.read().decode("utf-8", errors="ignore")
                country_name, country_code = _parse_geo_payload(service, payload)
                if country_name or country_code:
                    return country_name, country_code
            except (TimeoutError, URLError, OSError):
                continue

    return "", ""


def _resolve_onboarding_state(user: dict) -> str:
    if not user.get("is_email_verified", False):
        return ONBOARDING_PENDING_EMAIL
    if not user.get("profile_completed", False):
        return ONBOARDING_PENDING_PROFILE
    return ONBOARDING_ACTIVE


def _base_profile_fields() -> dict:
    return {
        "bio": "",
        "profile_image": "",
        "full_name": "",
        "location": "",
        "country": "",
        "phone": "",
        "date_of_birth": "",
        "gender": "",
        "website": "",
        "favorite_genres": [],
        "reading_goal": "",
        "preferred_language": "",
        "profile_completed": False,
        "onboarding_status": ONBOARDING_PENDING_PROFILE,
    }


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
    mailjet_enabled = bool(settings.mailjet_api_key and settings.mailjet_secret_key)
    email_send_failed = False
    if mailjet_enabled:
        email_sent = send_verification_email(payload.email, verification_token)
        if not email_sent:
            logger.error("Signup verification email send failed for %s", payload.email)
            email_send_failed = True
            if settings.strict_email_delivery:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Could not send verification email. Try again later.",
                )
    # Auto-verify only when Mailjet is not configured at all
    auto_verified = (not mailjet_enabled) or email_send_failed
    user_doc = {
        "_id": user_id,
        "username": payload.username,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "is_email_verified": auto_verified,
        "is_admin": False,
        "followers_count": 0,
        "following_count": 0,
        **_base_profile_fields(),
        "onboarding_status": ONBOARDING_PENDING_EMAIL if not auto_verified else ONBOARDING_PENDING_PROFILE,
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
    if auto_verified and email_send_failed:
        message = "Signup successful. Email service is temporarily unavailable, so your account was auto-verified."
    else:
        message = "Signup successful. You can now log in." if auto_verified else "Signup successful. Verify your email before login."
    return UserSignupResponse(
        message=message,
        verification_token=verification_token,
        auto_verified=auto_verified,
    )


@router.post("/register", response_model=UserSignupResponse)
async def register(payload: UserSignup, database: AsyncIOMotorDatabase = Depends(get_database)) -> UserSignupResponse:
    return await signup(payload, database)


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin,
    request: Request,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> TokenResponse:
    identifier = payload.identifier.strip()
    user = await database.users.find_one({"$or": [{"email": identifier}, {"username": identifier}]})
    password_hash = user.get("password_hash", "") if user else ""
    if not user or not password_hash or not verify_password(payload.password, password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username/email or password")
    if user.get("is_banned", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")
    if not user.get("is_email_verified", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Please verify your email before login")

    client_ip = _extract_client_ip(request)
    country_name, country_code = _resolve_country_from_ip(client_ip)
    login_updates: dict[str, object] = {
        "last_login_at": datetime.now(timezone.utc),
        "last_login_ip": client_ip,
    }
    if country_name and not user.get("country"):
        login_updates["country"] = country_name
    if country_code:
        login_updates["country_code"] = country_code
    await database.users.update_one({"_id": user["_id"]}, {"$set": login_updates})

    onboarding_status = _resolve_onboarding_state(user)
    if user.get("onboarding_status") != onboarding_status:
        await database.users.update_one({"_id": user["_id"]}, {"$set": {"onboarding_status": onboarding_status}})

    access_token = create_access_token(subject=user["_id"])
    return TokenResponse(
        access_token=access_token,
        onboarding_status=onboarding_status,
        onboarding_required=onboarding_status != ONBOARDING_ACTIVE,
    )


@router.post("/google", response_model=GoogleAuthResponse)
async def google_login(
    payload: GoogleAuthRequest,
    request: Request,
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> GoogleAuthResponse:
    settings = get_settings()
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google sign-in is not configured")

    try:
        claims = verify_google_credential(payload.credential, settings.google_oauth_client_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google credential") from exc

    email = normalize_email(str(claims.get("email", "")))
    google_sub = str(claims.get("sub", "")).strip()
    email_verified = bool(claims.get("email_verified"))
    if not email or not google_sub or not email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account email is not verified")

    user = await database.users.find_one({"$or": [{"google_sub": google_sub}, {"email": email}]})
    created_new = False
    client_ip = _extract_client_ip(request)
    country_name, country_code = _resolve_country_from_ip(client_ip)

    if user is None:
        display_name = str(claims.get("name") or email.split("@", 1)[0]).strip()
        user_id = str(uuid4())
        user = {
            "_id": user_id,
            **_base_profile_fields(),
            "username": await generate_unique_username(database, display_name),
            "email": email,
            "password_hash": hash_password(f"google::{google_sub}::{uuid4().hex}"),
            "is_email_verified": True,
            "profile_image": str(claims.get("picture") or ""),
            "is_admin": False,
            "followers_count": 0,
            "following_count": 0,
            "full_name": display_name,
            "auth_provider": "google",
            "google_sub": google_sub,
            "created_at": datetime.now(timezone.utc),
            "last_login_at": datetime.now(timezone.utc),
            "last_login_ip": client_ip,
            "country": country_name,
            "country_code": country_code,
            "onboarding_status": ONBOARDING_PENDING_PROFILE,
        }
        await database.users.insert_one(user)
        created_new = True
    else:
        if user.get("is_banned", False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended")

        updates: dict[str, object] = {
            "is_email_verified": True,
            "google_sub": google_sub,
            "last_login_at": datetime.now(timezone.utc),
            "last_login_ip": client_ip,
        }
        if not user.get("profile_image") and claims.get("picture"):
            updates["profile_image"] = str(claims["picture"])
        if not user.get("full_name") and claims.get("name"):
            updates["full_name"] = str(claims["name"])
        if not user.get("auth_provider"):
            updates["auth_provider"] = "google"
        if country_name and not user.get("country"):
            updates["country"] = country_name
        if country_code:
            updates["country_code"] = country_code
        updates["onboarding_status"] = _resolve_onboarding_state(user)
        await database.users.update_one({"_id": user["_id"]}, {"$set": updates})

    access_token = create_access_token(subject=user["_id"])
    onboarding_status = _resolve_onboarding_state(user)
    return GoogleAuthResponse(
        access_token=access_token,
        is_new_user=created_new,
        onboarding_status=onboarding_status,
        onboarding_required=onboarding_status != ONBOARDING_ACTIVE,
    )


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

    await database.users.update_one(
        {"email": payload.email},
        {
            "$set": {
                "is_email_verified": True,
                "onboarding_status": ONBOARDING_PENDING_PROFILE,
            }
        },
    )
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
    mailjet_enabled = bool(settings.mailjet_api_key and settings.mailjet_secret_key)
    if mailjet_enabled:
        try:
            send_verification_email(payload.email, verification_token)
        except Exception as exc:
            logger.exception("Resend verification email send failed for %s", payload.email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Could not resend verification email. Try again later.",
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
