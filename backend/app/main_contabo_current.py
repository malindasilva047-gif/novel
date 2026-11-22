from collections import defaultdict
import base64
from datetime import datetime, timedelta, timezone
from functools import lru_cache
import hashlib
from io import BytesIO
import secrets
import hmac
import json
import logging
import math
import os
import re
import sqlite3
import warnings
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from uuid import uuid4

from fastapi import BackgroundTasks, Body, Depends, FastAPI, File, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
try:
    import mysql.connector as mysql_connector
except ModuleNotFoundError:
    mysql_connector = None
from pydantic import BaseModel, Field

from .database import (
    get_connection,
    USE_SQLITE,
)

DB_INIT_EXCEPTIONS = (sqlite3.Error, FileNotFoundError, OSError, ValueError)
if mysql_connector is not None:
    DB_INIT_EXCEPTIONS = (mysql_connector.Error, sqlite3.Error, FileNotFoundError, OSError, ValueError)

app = FastAPI(title="Novel Mobile Backend")
LOGGER = logging.getLogger(__name__)
UPLOAD_ROOT = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key-change-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
_runtime_env = os.getenv("ENV", "").strip().lower()
_is_production_runtime = _runtime_env in {"prod", "production"} or bool(
    os.getenv("VERCEL") or os.getenv("VERCEL_ENV")
)
if _is_production_runtime and JWT_SECRET == "dev-secret-key-change-in-production":
    raise RuntimeError("Set a unique JWT_SECRET before running the backend in production.")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin_Supun")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Ux3@f=7x2")
ADMIN_TOKEN_EXPIRES_HOURS = int(os.getenv("ADMIN_TOKEN_EXPIRES_HOURS", "24"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
# Support multiple acceptable client IDs via comma-separated env var for flexibility
# e.g. GOOGLE_CLIENT_IDS=android-client-id,web-client-id
GOOGLE_CLIENT_IDS = list(dict.fromkeys(
    client_id.strip()
    for configured_ids in (os.getenv("GOOGLE_CLIENT_IDS", ""), GOOGLE_CLIENT_ID)
    for client_id in configured_ids.split(",")
    if client_id.strip()
))

# CORS: explicit origins required when allow_credentials=True (browsers reject "*")
# Extra hosts: set Vercel env CORS_ORIGINS=https://host1,https://host2
_DEFAULT_CORS = [
    "https://novel-v7-web.vercel.app",
    "https://novel-v7.vercel.app",
    "https://novel-v7-admin.vercel.app",
    "https://novel-v7-admin-panel.vercel.app",
    "https://novel-v7-p8ec.vercel.app",  # admin panel production
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
_extra = [s.strip() for s in os.getenv("CORS_ORIGINS", "").split(",") if s.strip()]
_CORS_ORIGINS = list(dict.fromkeys(_DEFAULT_CORS + _extra))
# Allow Vercel previews and Cloudflare quick tunnels, plus local development.
_CORS_ORIGIN_REGEX = r"https://.*\.(vercel\.app|trycloudflare\.com)|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=_CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

# --- Request path logging (do not rewrite paths; Vercel FastAPI preserves them) ---
@app.middleware("http")
async def log_request_path(request, call_next):
    path = request.scope.get("path") or ""
    try:
        LOGGER.info("ASGI path=%s method=%s", path, request.scope.get("method"))
    except Exception:
        pass
    return await call_next(request)


app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


class LibraryCreateRequest(BaseModel):
    book_id: int
    reading_status: str
    updated_text: str = ""
    chapters: int = 0
    primary_genre: str = ""
    secondary_genre: str = ""
    last_chapter_number: int | None = None
    last_paragraph_index: int | None = None
    chapters_read: int | None = None
    reading_progress_percent: int | None = Field(default=None, ge=0, le=100)


class LibraryUpdateRequest(BaseModel):
    reading_status: str | None = None
    updated_text: str | None = None
    chapters: int | None = None
    primary_genre: str | None = None
    secondary_genre: str | None = None
    last_chapter_number: int | None = None
    last_paragraph_index: int | None = None
    chapters_read: int | None = None
    reading_progress_percent: int | None = Field(default=None, ge=0, le=100)


class ReadingListCreateRequest(BaseModel):
    name: str
    description: str = ""
    story_count: int = 0
    cover_path: str = ""
    sort_order: int = 999


class StoryCreateRequest(BaseModel):
    model_config = {"extra": "ignore"}

    title: str | None = "Untitled Story"
    author: str | None = "Author"
    description: str | None = ""
    genre: str | None = ""
    cover_path: str | None = ""
    tags: list[str] | None = []
    content_warnings: str | None = ""
    status_text: str | None = "Draft"
    language: str | None = None
    audience: str | None = None


class StoryUpdateRequest(BaseModel):
    model_config = {"extra": "ignore"}

    title: str | None = None
    author: str | None = None
    description: str | None = None
    genre: str | None = None
    cover_path: str | None = None
    tags: list[str] | None = None
    content_warnings: str | None = None
    status_text: str | None = None
    language: str | None = None
    audience: str | None = None
    writer_settings: dict[str, Any] | None = None


class ReviewCreateRequest(BaseModel):
    rating: int
    comment: str = ""
    title: str | None = None
    plot_rating: int | None = None
    style_rating: int | None = None
    tech_rating: int | None = None


class PushTokenRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)


class SearchHistoryRequest(BaseModel):
    term: str
    scope: str


class AuthorNotificationPreferenceRequest(BaseModel):
    enabled: bool


class ChapterCommentCreateRequest(BaseModel):
    body: str
    paragraph_index: int | None = None


class ChapterCreateRequest(BaseModel):
    title: str
    content: str
    chapter_number: int | None = None
    notes: str | None = None
    submission_status: str | None = None
    scheduled_for: str | None = None


class ChapterUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    chapter_number: int | None = None
    notes: str | None = None
    submission_status: str | None = None
    scheduled_for: str | None = None


class ChapterReorderRequest(BaseModel):
    """Ordered list of chapter ids for this story (Inkitt-style reorder)."""
    chapter_ids: list[int]


class ChapterPublishAllRequest(BaseModel):
    """Optional: only these chapter ids; empty = all eligible drafts."""
    chapter_ids: list[int] | None = None
    min_words: int = 60


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    cover_url: str | None = None
    bio: str | None = None
    gender: str | None = None
    birth_date: str | None = None
    country: str | None = None
    facebook_url: str | None = None
    youtube_url: str | None = None
    instagram_url: str | None = None
    twitter_url: str | None = None
    website_url: str | None = None
    profile_complete: bool | None = None


class LinkEmailRequest(BaseModel):
    email: str | None = None
    username: str | None = None
    password: str


class CategoryCreateRequest(BaseModel):
    name: str
    topic_count: int = 0
    tab_group: str
    sort_order: int = 0
    image_path: str | None = None


class CategoryUpdateRequest(BaseModel):
    name: str | None = None
    topic_count: int | None = None
    tab_group: str | None = None
    sort_order: int | None = None
    image_path: str | None = None


class AdminBookCreateRequest(BaseModel):
    title: str
    author: str
    description: str
    cover_path: str = ""
    accent_hex: str = "#808080"
    section_name: str = "recently_updated"
    status_text: str = "Published"
    rating: float = 0.0
    genre: str = ""
    cta_label: str = "Read now"
    sort_order: int = 999
    chapters: list[dict] | None = None


class AdminBookUpdateRequest(BaseModel):
    title: str | None = None
    author: str | None = None
    description: str | None = None
    cover_path: str | None = None
    accent_hex: str | None = None
    section_name: str | None = None
    status_text: str | None = None
    rating: float | None = None
    genre: str | None = None
    cta_label: str | None = None
    sort_order: int | None = None


class AdminNotificationCreateRequest(BaseModel):
    tab_name: str
    title: str
    message: str
    created_at: str
    sort_order: int = 999


class AdminNotificationUpdateRequest(BaseModel):
    tab_name: str | None = None
    title: str | None = None
    message: str | None = None
    created_at: str | None = None
    sort_order: int | None = None


class AdminMenuItemCreateRequest(BaseModel):
    section_name: str
    section_order: int
    label: str
    icon_name: str
    route_name: str
    sort_order: int = 999


class AdminMenuItemUpdateRequest(BaseModel):
    section_name: str | None = None
    section_order: int | None = None
    label: str | None = None
    icon_name: str | None = None
    route_name: str | None = None
    sort_order: int | None = None


class HomeSliderSectionCreateRequest(BaseModel):
    section_key: str
    label: str
    sort_order: int = 100
    is_active: bool = True
    description: str = ""


class HomeSliderSectionUpdateRequest(BaseModel):
    section_key: str | None = None
    label: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    description: str | None = None


class HomeSliderAssignBooksRequest(BaseModel):
    book_ids: list[int] = []
    section_key: str


class HomeHeroImageCreateRequest(BaseModel):
    title: str = ""
    image_path: str
    sort_order: int = 100
    is_active: bool = True


class HomeHeroImageUpdateRequest(BaseModel):
    title: str | None = None
    image_path: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class AdminWriteScreenUpdateRequest(BaseModel):
    manage_tabs: str
    story_tabs: str
    filter_label: str
    sort_label: str
    empty_title: str
    empty_cta: str


class AdminProfileUpdateRequest(BaseModel):
    display_name: str
    username: str
    following: int
    followers: int
    blocked: int
    chapters_read: int
    social_karma: int
    day_streak: int


class AdminReadingListCreateRequest(BaseModel):
    profile_id: int = 1
    name: str
    story_count: int = 0
    cover_path: str = ""
    sort_order: int = 999


class AdminReadingListUpdateRequest(BaseModel):
    profile_id: int | None = None
    name: str | None = None
    story_count: int | None = None
    cover_path: str | None = None
    sort_order: int | None = None


class AdminAchievementCreateRequest(BaseModel):
    group_name: str
    group_order: int
    title: str
    subtitle: str
    progress_label: str
    badge_value: str
    style: str
    sort_order: int = 999


class AdminAchievementUpdateRequest(BaseModel):
    group_name: str | None = None
    group_order: int | None = None
    title: str | None = None
    subtitle: str | None = None
    progress_label: str | None = None
    badge_value: str | None = None
    style: str | None = None
    sort_order: int | None = None


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AccountLifecycleRequest(BaseModel):
    password: str


class SupportRequestCreateRequest(BaseModel):
    email: str
    first_name: str
    issue: str
    subject: str
    description: str
    device_type: str = ""
    attachment_path: str = ""


class SupportRequestUpdateRequest(BaseModel):
    status: str | None = None
    admin_reply: str | None = None




_TOKEN_VERSION_SCHEMA_READY = False


def _ensure_token_version_column() -> None:
    global _TOKEN_VERSION_SCHEMA_READY
    if _TOKEN_VERSION_SCHEMA_READY:
        return
    try:
        execute_write("ALTER TABLE app_users ADD COLUMN token_version INT NOT NULL DEFAULT 0", ())
    except Exception:
        try:
            execute_write("ALTER TABLE app_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0", ())
        except Exception:
            rows = fetch_all(
                "SELECT token_version FROM app_users LIMIT 1",
                (),
            )
            if rows is None:
                raise RuntimeError("Could not verify the account token-version column")
    _TOKEN_VERSION_SCHEMA_READY = True

def _ensure_password_hash_column() -> None:
    """Add password_hash to app_users if missing (MySQL + SQLite)."""
    try:
        if USE_SQLITE:
            execute_write("ALTER TABLE app_users ADD COLUMN password_hash TEXT", ())
        else:
            execute_write("ALTER TABLE app_users ADD COLUMN password_hash VARCHAR(255) NULL", ())
    except Exception:
        pass



def _ensure_support_request_columns() -> None:
    """Add admin_reply / user_id on support_requests if missing."""
    for col, ddl_mysql, ddl_sqlite in (
        ("admin_reply", "ALTER TABLE support_requests ADD COLUMN admin_reply TEXT NULL", "ALTER TABLE support_requests ADD COLUMN admin_reply TEXT"),
        ("user_id", "ALTER TABLE support_requests ADD COLUMN user_id INT NULL", "ALTER TABLE support_requests ADD COLUMN user_id INTEGER"),
        ("replied_at", "ALTER TABLE support_requests ADD COLUMN replied_at TIMESTAMP NULL", "ALTER TABLE support_requests ADD COLUMN replied_at TEXT"),
    ):
        try:
            if _live_use_sqlite():
                execute_write(ddl_sqlite, ())
            else:
                execute_write(ddl_mysql, ())
        except Exception:
            pass



def _ensure_auth_profile_columns() -> None:
    """username, email_verified, verification_token for professional auth."""
    cols = [
        ("username", "ALTER TABLE app_users ADD COLUMN username VARCHAR(64) NULL"),
        ("email_verified", "ALTER TABLE app_users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0"),
        ("verification_token", "ALTER TABLE app_users ADD COLUMN verification_token VARCHAR(128) NULL"),
        ("verification_sent_at", "ALTER TABLE app_users ADD COLUMN verification_sent_at DATETIME NULL"),
    ]
    for _name, sql in cols:
        try:
            execute_write(sql, ())
        except Exception:
            pass


def _password_policy_ok(password: str) -> tuple[bool, str]:
    """Min 8 chars, letter + number + symbol."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_symbol = any(not c.isalnum() for c in password)
    if not (has_letter and has_digit and has_symbol):
        return False, "Password needs letters, numbers, and a symbol"
    return True, ""


def _send_verification_email(to_email: str, token: str, display_name: str = "") -> bool:
    """Send verification email using deployment-provided SMTP credentials."""
    import os
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_user = os.environ.get("SMTP_EMAIL", "").strip()
    smtp_pass = os.environ.get("SMTP_APP_PASSWORD", "").replace(" ", "")
    if not smtp_user or not smtp_pass:
        LOGGER.warning("Verification email not sent: SMTP_EMAIL/SMTP_APP_PASSWORD are not configured")
        return False
    app_name = os.environ.get("APP_NAME", "Wingsaga")
    # Deep link / web verify URL for the app
    base = os.environ.get("APP_PUBLIC_URL", "https://novel-v7.vercel.app").rstrip("/")
    verify_url = f"{base}/api/auth/verify-email?token={token}"

    subject = f"Verify your {app_name} email"
    body_text = (
        f"Hi {display_name or 'there'},\n\n"
        f"Thanks for signing up for {app_name}.\n"
        f"Your verification code is:\n\n{token}\n\n"
        f"Or open this link:\n{verify_url}\n\n"
        f"If you did not create an account, ignore this email.\n"
    )
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_user
        msg["To"] = to_email
        msg.attach(MIMEText(body_text, "plain"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        LOGGER.info("Verification email sent to %s", to_email)
        return True
    except Exception as exc:
        LOGGER.exception("Failed to send verification email: %s", exc)
        return False


def _development_verification_fields(token: str) -> dict[str, str]:
    """Expose a verification code only for explicit local development runs."""
    env_name = os.getenv("ENV", "").strip().lower()
    if env_name in {"dev", "development", "local"} and not (
        os.getenv("VERCEL") or os.getenv("VERCEL_ENV")
    ):
        return {"dev_token": token}
    return {}


def _hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    ).hex()
    return f"{salt}${digest}"


def _verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    # Accept hashes created by the professional auth flow and prior profile-link flow.
    if stored.startswith("$2") or stored.startswith("pbkdf2_sha256$") or stored.startswith("sha256:"):
        try:
            from .auth_professional import _verify_password as verify_professional_password
            return verify_professional_password(password, stored)
        except Exception:
            return False
    if re.fullmatch(r"[0-9a-fA-F]{64}", stored):
        return secrets.compare_digest(hashlib.sha256(password.encode("utf-8")).hexdigest(), stored.lower())
    if "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    ).hex()
    return secrets.compare_digest(check, digest)

class GoogleAuthRequest(BaseModel):
    id_token: str | None = None
    access_token: str | None = None


class EmailAuthRequest(BaseModel):
    email: str = ""
    display_name: str = ""
    password: str = ""
    username: str = ""
    mode: str = "login"  # login | register


class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""
    username: str
    accepted_terms: bool = False
    photo_url: str = ""
    cover_url: str = ""
    gender: str | None = None
    birth_date: str | None = None
    country: str | None = None
    profile_complete: bool = False


class VerifyEmailRequest(BaseModel):
    token: str = ""
    email: str = ""


class GuestAuthRequest(BaseModel):
    device_id: str | None = None


class ChatMessageCreateRequest(BaseModel):
    message: str
    sender: str = "user"


class VersionResponse(BaseModel):
    value: str
    updated_at: str | None = None


def _live_use_sqlite() -> bool:
    """Always read current dialect from database module (survives MySQL→SQLite fallback)."""
    try:
        from . import database as _db
        return bool(getattr(_db, "USE_SQLITE", USE_SQLITE))
    except Exception:
        return bool(USE_SQLITE)


def _to_db_query(query: str) -> str:
    """Adapt SQL for the active DB dialect (SQLite vs MySQL)."""
    if _live_use_sqlite():
        return query.replace("%s", "?")
    # MySQL uses INSERT IGNORE, not SQLite's INSERT OR IGNORE
    q = query.replace("INSERT OR IGNORE", "INSERT IGNORE")
    q = q.replace("INSERT OR REPLACE", "REPLACE")
    return q


def fetch_all(query: str, params: tuple[Any, ...] | None = None):
    connection = get_connection()
    use_sqlite = _live_use_sqlite()
    if use_sqlite:
        cursor = connection.cursor()
    else:
        cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(_to_db_query(query), params or ())
        rows = cursor.fetchall()
    finally:
        cursor.close()
        connection.close()
    if use_sqlite:
        # sqlite3.Row → plain dict for consistent .get() usage
        out = []
        for row in rows or []:
            if hasattr(row, "keys"):
                out.append({k: row[k] for k in row.keys()})
            elif isinstance(row, dict):
                out.append(row)
            else:
                out.append(row)
        return out
    return rows


def execute_write(query: str, params: tuple[Any, ...]):
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(_to_db_query(query), params)
        connection.commit()
        last_id = cursor.lastrowid
        affected = cursor.rowcount
        # MySQL/SQLite: if lastrowid is 0/None after INSERT, try dialect helpers
        if not last_id and query.strip().upper().startswith("INSERT"):
            try:
                if _live_use_sqlite():
                    cursor.execute("SELECT last_insert_rowid()")
                else:
                    cursor.execute("SELECT LAST_INSERT_ID()")
                row = cursor.fetchone()
                if row is not None:
                    last_id = row[0] if not isinstance(row, dict) else next(iter(row.values()))
            except Exception:
                pass
        return last_id, affected
    except Exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        try:
            connection.close()
        except Exception:
            pass


def _serialize_db_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _content_version_row() -> dict[str, Any]:
    rows = fetch_all(
        "SELECT key_value, updated_at FROM app_metadata WHERE key_name='content_version' LIMIT 1"
    )
    if rows:
        row = rows[0]
        return {
            "value": row["key_value"],
            "updated_at": _serialize_db_datetime(row["updated_at"]),
        }

    value = str(uuid4())
    execute_write(
        "INSERT INTO app_metadata (key_name, key_value) VALUES ('content_version', %s)",
        (value,),
    )
    return {"value": value, "updated_at": None}


def bump_content_version() -> dict[str, Any]:
    global _VERSION_CACHE, _VERSION_CACHE_AT, _BOOTSTRAP_CACHE, _BOOTSTRAP_CACHE_AT
    global _TAGS_CACHE, _TAGS_CACHE_AT
    value = str(uuid4())
    if _live_use_sqlite():
        execute_write(
            """
            INSERT INTO app_metadata (key_name, key_value)
            VALUES ('content_version', %s)
            ON CONFLICT(key_name) DO UPDATE SET key_value = excluded.key_value
            """,
            (value,),
        )
    else:
        execute_write(
            """
            INSERT INTO app_metadata (key_name, key_value)
            VALUES ('content_version', %s)
            ON DUPLICATE KEY UPDATE key_value = VALUES(key_value)
            """,
            (value,),
        )
    _VERSION_CACHE = None
    _VERSION_CACHE_AT = 0.0
    _BOOTSTRAP_CACHE = None
    _BOOTSTRAP_CACHE_AT = 0.0
    _TAGS_CACHE = None
    _TAGS_CACHE_AT = 0.0
    return _content_version_row()


def create_admin_token(username: str) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(hours=ADMIN_TOKEN_EXPIRES_HOURS)
    payload = {
        "sub": username,
        "role": "admin",
        "exp": expires_at.isoformat(),
    }
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def require_admin(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing admin token")

    try:
        encoded_payload, provided_signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=401, detail="Invalid admin token")

    try:
        payload = json.loads(
            base64.urlsafe_b64decode(encoded_payload.encode("ascii")).decode("utf-8")
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    expires_raw = payload.get("exp")
    if not isinstance(expires_raw, str):
        raise HTTPException(status_code=401, detail="Invalid admin token")

    try:
        expires_at = datetime.fromisoformat(expires_raw)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Admin token expired")

    return payload


def _sign_token(payload: dict[str, Any]) -> str:
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    return f"{encoded_payload}.{signature}"


def create_user_token(user_id: int) -> str:
    """Signed session token. Includes token_version (tv) so ban/suspend can revoke."""
    try:
        _ensure_token_version_column()
    except Exception:
        pass
    expires_at = datetime.now(timezone.utc) + timedelta(days=180)
    tv = 0
    try:
        rows = fetch_all(
            "SELECT COALESCE(token_version, 0) AS token_version FROM app_users WHERE id=%s LIMIT 1",
            (user_id,),
        )
        if rows:
            tv = int(_row_get(rows[0], "token_version") or 0)
    except Exception:
        tv = 0
    return _sign_token(
        {
            "sub": f"user:{user_id}",
            "role": "user",
            "exp": expires_at.isoformat(),
            "tv": tv,
        }
    )


def bump_token_version(user_id: int) -> None:
    """Invalidate all outstanding sessions for this user."""
    try:
        execute_write(
            "UPDATE app_users SET token_version = COALESCE(token_version, 0) + 1 WHERE id=%s",
            (user_id,),
        )
    except Exception as exc:
        LOGGER.warning("bump_token_version failed for %s: %s", user_id, exc)


def _update_account_lifecycle_state(
    user_id: int,
    assignments: str,
    values: tuple[Any, ...] = (),
) -> None:
    _ensure_token_version_column()
    _, affected = execute_write(
        f"UPDATE app_users SET {assignments}, "
        "token_version=COALESCE(token_version, 0) + 1 WHERE id=%s",
        (*values, user_id),
    )
    if affected != 1:
        raise HTTPException(status_code=404, detail="Account not found")




_WALL_POSTS_TABLE_READY = False



_HOME_SLIDER_SECTIONS_READY = False
_HOME_HERO_IMAGES_READY = False


def _ensure_home_slider_sections_table() -> None:
    """Registry of home page story-card slider sections (admin-managed)."""
    global _HOME_SLIDER_SECTIONS_READY
    if _HOME_SLIDER_SECTIONS_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS home_slider_sections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    section_key TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 100,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS home_slider_sections (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    section_key VARCHAR(64) NOT NULL UNIQUE,
                    label VARCHAR(120) NOT NULL,
                    description VARCHAR(512) NOT NULL DEFAULT '',
                    sort_order INT NOT NULL DEFAULT 100,
                    is_active TINYINT NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        # Seed default sections if empty
        rows = fetch_all("SELECT COUNT(*) AS c FROM home_slider_sections") or []
        count = 0
        if rows:
            r0 = rows[0]
            count = int(r0.get("c") if isinstance(r0, dict) else r0[0] or 0)
        if count == 0:
            defaults = [
                ("featured", "Featured", "Top featured stories", 10),
                ("trending", "Hot Right Now", "Trending stories", 20),
                ("new_releases", "New Releases", "Just published", 30),
                ("recently_updated", "Recently Updated", "Fresh chapters", 40),
                ("recently_completed", "Recently Completed", "Finished stories", 50),
                ("editor_picks", "Editors' Picks", "Staff selections", 60),
                ("weekend_binge", "Weekend Binge", "Perfect for a weekend read", 70),
            ]
            for key, label, desc, order in defaults:
                try:
                    execute_write(
                        """
                        INSERT INTO home_slider_sections
                            (section_key, label, description, sort_order, is_active)
                        VALUES (%s, %s, %s, %s, 1)
                        """,
                        (key, label, desc, order),
                    )
                except Exception:
                    pass
        _HOME_SLIDER_SECTIONS_READY = True
    except Exception as exc:
        LOGGER.warning("home_slider_sections ensure failed: %s", exc)


def _ensure_home_hero_images_table() -> None:
    global _HOME_HERO_IMAGES_READY
    if _HOME_HERO_IMAGES_READY:
        return
    if _live_use_sqlite():
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS home_hero_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                image_path TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 100,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            (),
        )
    else:
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS home_hero_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(160) NOT NULL DEFAULT '',
                image_path VARCHAR(2048) NOT NULL,
                sort_order INT NOT NULL DEFAULT 100,
                is_active TINYINT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            (),
        )
    _HOME_HERO_IMAGES_READY = True


def _ensure_wall_posts_table() -> None:
    """Dedicated wall posts (profile Wall tab). Soft schema; never drops data.
    Runs once per process — avoids DDL lock storms that cause 300s Vercel timeouts.
    Always adds missing columns on older DBs (likes_count, image_path).
    """
    global _WALL_POSTS_TABLE_READY
    if _WALL_POSTS_TABLE_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS wall_posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    target_user_id INTEGER NOT NULL,
                    body TEXT NOT NULL,
                    image_path TEXT DEFAULT '',
                    likes_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
            columns = fetch_all("PRAGMA table_info(wall_posts)")
            names = {
                _row_get(column, "name")
                for column in (columns or [])
            }
            if "image_path" not in names:
                execute_write(
                    "ALTER TABLE wall_posts ADD COLUMN image_path TEXT DEFAULT ''",
                    (),
                )
            if "likes_count" not in names:
                execute_write(
                    "ALTER TABLE wall_posts ADD COLUMN likes_count INTEGER NOT NULL DEFAULT 0",
                    (),
                )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS wall_posts (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    target_user_id INT NOT NULL,
                    body TEXT NOT NULL,
                    image_path VARCHAR(512) DEFAULT '',
                    likes_count INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
            for col, ddl in (
                ("image_path", "ALTER TABLE wall_posts ADD COLUMN image_path VARCHAR(512) DEFAULT ''"),
                ("likes_count", "ALTER TABLE wall_posts ADD COLUMN likes_count INT NOT NULL DEFAULT 0"),
            ):
                try:
                    columns = fetch_all(
                        "SHOW COLUMNS FROM wall_posts LIKE %s",
                        (col,),
                    )
                    if not columns:
                        execute_write(ddl, ())
                        LOGGER.info("wall_posts added missing column: %s", col)
                except Exception as col_exc:
                    LOGGER.warning("wall_posts add %s failed: %s", col, col_exc)
        _WALL_POSTS_TABLE_READY = True
    except Exception as exc:
        LOGGER.warning("wall_posts ensure failed: %s", exc)


def _as_bool_flag(v) -> bool:
    if v is True or v is False:
        return bool(v)
    if v is None:
        return False
    try:
        return int(v) == 1
    except Exception:
        s = str(v).strip().lower()
        return s in ("1", "true", "yes")

_USER_MODERATION_SCHEMA_READY = False


def _ensure_user_moderation_columns() -> None:
    """Ensure account moderation and lifecycle columns without destructive migrations."""
    global _USER_MODERATION_SCHEMA_READY
    if _USER_MODERATION_SCHEMA_READY:
        return
    for col_sql in (
        "ALTER TABLE app_users ADD COLUMN is_banned INT NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN is_suspended INT NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN is_deleted INT NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN is_deactivated INT NOT NULL DEFAULT 0",
        "ALTER TABLE app_users ADD COLUMN deletion_requested_at TEXT NULL",
        "ALTER TABLE app_users ADD COLUMN suspended_until TEXT NULL",
        "ALTER TABLE app_users ADD COLUMN is_author_active INT NOT NULL DEFAULT 1",
    ):
        try:
            execute_write(col_sql, ())
        except Exception:
            pass
    # This ensure runs during startup; repeating five ALTER TABLE statements on
    # every authenticated request needlessly adds several DB round trips.
    _USER_MODERATION_SCHEMA_READY = True


def _assert_user_can_login(user_id: int) -> None:
    reason = _user_access_block_reason(user_id)
    if reason:
        raise HTTPException(status_code=403, detail=reason)

def _user_access_block_reason(user_id: int) -> str | None:
    """Return human-readable block reason, or None if user may log in."""
    _ensure_user_moderation_columns()
    rows = fetch_all(
        """
        SELECT COALESCE(is_banned,0) AS is_banned,
               COALESCE(is_suspended,0) AS is_suspended,
               COALESCE(is_deleted,0) AS is_deleted,
               COALESCE(is_deactivated,0) AS is_deactivated,
               deletion_requested_at,
               suspended_until
        FROM app_users WHERE id=%s LIMIT 1
        """,
        (user_id,),
    )
    if not rows:
        return "Account not found (user id missing in app_users — confirm MYSQL_DATABASE=defaultdb)"
    row = rows[0]
    if int(_row_get(row, "is_deleted") or 0) == 1:
        requested = _row_get(row, "deletion_requested_at")
        if requested:
            return "Account deletion is pending. Sign in within 30 days to cancel it."
        return "This account has been deleted by an administrator"
    if int(_row_get(row, "is_deactivated") or 0) == 1:
        return "This account is deactivated. Sign in to reactivate it."
    if int(_row_get(row, "is_banned") or 0) == 1:
        return "This account is banned. Contact support or wait for an unban."
    if int(_row_get(row, "is_suspended") or 0) == 1:
        until = _row_get(row, "suspended_until")
        if until:
            try:
                from datetime import datetime, timezone
                u = str(until).replace("Z", "+00:00")
                until_dt = datetime.fromisoformat(u)
                now = datetime.now(timezone.utc)
                if until_dt.tzinfo is None:
                    until_dt = until_dt.replace(tzinfo=timezone.utc)
                if now < until_dt:
                    return f"Account suspended until {until_dt.isoformat()}"
                # auto-lift expired suspension
                execute_write(
                    "UPDATE app_users SET is_suspended=0, suspended_until=NULL WHERE id=%s",
                    (user_id,),
                )
            except Exception:
                return "This account is temporarily suspended"
        else:
            return "This account is temporarily suspended"
    return None


ACCOUNT_DELETION_GRACE_DAYS = 30


def _purge_user_account(user_id: int) -> None:
    """Permanently remove account-owned data after the deletion grace period."""
    # Delete user-owned interactions before the account row. Missing optional
    # tables are tolerated so this works across older database revisions.
    for table, column in (
        ("book_likes", "user_id"), ("book_reviews", "user_id"),
        ("author_follows", "user_id"), ("chapter_comments", "user_id"),
        ("library_entries", "user_id"), ("chat_messages", "user_id"),
        ("wall_posts", "user_id"), ("support_requests", "user_id"),
        ("reading_lists", "user_id"), ("tag_follows", "user_id"),
        ("search_history", "user_id"), ("book_shares", "user_id"),
        ("user_preferences", "user_id"), ("user_support_notifications", "user_id"),
        ("media_assets", "user_id"), ("auth_sessions", "user_id"),
        ("wall_post_likes", "user_id"), ("story_reports", "user_id"),
        ("chapter_reactions", "user_id"), ("chapter_comment_likes", "user_id"),
    ):
        try:
            execute_write(f"DELETE FROM {table} WHERE {column}=%s", (user_id,))
        except Exception:
            pass
    for table, column in (
        ("wall_posts", "target_user_id"),
        ("user_moderation_actions", "reporter_id"),
        ("user_moderation_actions", "target_user_id"),
    ):
        try:
            execute_write(f"DELETE FROM {table} WHERE {column}=%s", (user_id,))
        except Exception:
            pass
    try:
        list_rows = fetch_all("SELECT id FROM reading_lists WHERE user_id=%s", (user_id,))
        list_ids = [int(_row_get(row, "id")) for row in (list_rows or [])]
        if list_ids:
            marks = ",".join(["%s"] * len(list_ids))
            execute_write(f"DELETE FROM reading_list_items WHERE reading_list_id IN ({marks})", tuple(list_ids))
            execute_write(f"DELETE FROM reading_lists WHERE id IN ({marks})", tuple(list_ids))
    except Exception:
        pass
    try:
        execute_write("DELETE FROM author_follows WHERE author_id=%s", (user_id,))
    except Exception:
        pass
    try:
        owned_books = fetch_all("SELECT id FROM books WHERE user_id=%s", (user_id,))
        book_ids = [int(_row_get(row, "id")) for row in (owned_books or [])]
        if book_ids:
            placeholders = ",".join(["%s"] * len(book_ids))
            chapter_rows = fetch_all(
                f"SELECT id FROM chapters WHERE story_id IN ({placeholders})", tuple(book_ids)
            )
            chapter_ids = [int(_row_get(row, "id")) for row in (chapter_rows or [])]
            if chapter_ids:
                chapter_marks = ",".join(["%s"] * len(chapter_ids))
                for table in ("chapter_revisions", "chapter_comment_likes", "chapter_comments", "chapter_reactions"):
                    try:
                        execute_write(f"DELETE FROM {table} WHERE chapter_id IN ({chapter_marks})", tuple(chapter_ids))
                    except Exception:
                        pass
            for table in ("book_tags", "book_reviews", "book_likes", "book_shares", "library_entries", "reading_list_items", "story_reports", "chapter_reactions"):
                try:
                    execute_write(f"DELETE FROM {table} WHERE book_id IN ({placeholders})", tuple(book_ids))
                except Exception:
                    pass
            try:
                execute_write(f"DELETE FROM chapter_comments WHERE book_id IN ({placeholders})", tuple(book_ids))
            except Exception:
                pass
            execute_write(f"DELETE FROM chapters WHERE story_id IN ({placeholders})", tuple(book_ids))
        execute_write("DELETE FROM books WHERE user_id=%s", (user_id,))
    except Exception as exc:
        LOGGER.warning("Could not remove authored stories for account %s: %s", user_id, exc)
    execute_write("DELETE FROM app_users WHERE id=%s", (user_id,))


def _purge_expired_account_deletions() -> None:
    rows = fetch_all(
        "SELECT id, deletion_requested_at FROM app_users "
        "WHERE COALESCE(is_deleted,0)=1 AND deletion_requested_at IS NOT NULL"
    )
    cutoff = datetime.now(timezone.utc) - timedelta(days=ACCOUNT_DELETION_GRACE_DAYS)
    for row in rows or []:
        raw = _row_get(row, "deletion_requested_at")
        try:
            requested_at = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if requested_at.tzinfo is None:
                requested_at = requested_at.replace(tzinfo=timezone.utc)
            if requested_at <= cutoff:
                _purge_user_account(int(_row_get(row, "id")))
        except (TypeError, ValueError):
            LOGGER.warning("Skipping account with invalid deletion date: %s", _row_get(row, "id"))


_ACCOUNT_DELETION_PURGER_STARTED = False


def _start_account_deletion_purger() -> None:
    global _ACCOUNT_DELETION_PURGER_STARTED
    if _ACCOUNT_DELETION_PURGER_STARTED:
        return
    _ACCOUNT_DELETION_PURGER_STARTED = True
    from threading import Thread
    from time import sleep

    def run() -> None:
        while True:
            sleep(60 * 60)
            try:
                _purge_expired_account_deletions()
            except Exception:
                LOGGER.exception("Scheduled account deletion purge failed")

    Thread(target=run, name="account-deletion-purger", daemon=True).start()


def _restore_account_on_login(user_id: int) -> str | None:
    """Facebook-style: signing in during the grace period cancels deactivation/deletion."""
    _ensure_user_moderation_columns()
    rows = fetch_all(
        "SELECT COALESCE(is_deleted,0) AS is_deleted, deletion_requested_at, "
        "COALESCE(is_deactivated,0) AS is_deactivated FROM app_users WHERE id=%s LIMIT 1",
        (user_id,),
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Account not found")
    row = rows[0]
    requested = _row_get(row, "deletion_requested_at")
    if int(_row_get(row, "is_deleted") or 0) == 1:
        if not requested:
            raise HTTPException(status_code=403, detail="This account has been deleted")
        try:
            requested_at = datetime.fromisoformat(str(requested).replace("Z", "+00:00"))
            if requested_at.tzinfo is None:
                requested_at = requested_at.replace(tzinfo=timezone.utc)
            expired = datetime.now(timezone.utc) - requested_at >= timedelta(days=ACCOUNT_DELETION_GRACE_DAYS)
        except (TypeError, ValueError):
            expired = True
        if expired:
            _purge_user_account(user_id)
            raise HTTPException(status_code=403, detail="The account deletion period has ended")
        execute_write(
            "UPDATE app_users SET is_deleted=0, deletion_requested_at=NULL, is_deactivated=0 WHERE id=%s",
            (user_id,),
        )
        return "Your login canceled the scheduled account deletion. Your account is active again."
    elif int(_row_get(row, "is_deactivated") or 0) == 1:
        execute_write("UPDATE app_users SET is_deactivated=0 WHERE id=%s", (user_id,))
        return "Your deactivated account is active again."
    return None


def _verify_account_lifecycle_password(user_id: int, password: str) -> None:
    _ensure_password_hash_column()
    rows = fetch_all(
        "SELECT password_hash FROM app_users WHERE id=%s LIMIT 1",
        (user_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Account not found")
    stored_hash = _row_get(rows[0], "password_hash")
    if not stored_hash:
        raise HTTPException(
            status_code=403,
            detail="Set an account password before deactivating or deleting your account.",
        )
    if not _verify_password(password, str(stored_hash)):
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")



def _ensure_profile_extra_columns() -> None:
    """gender, birth_date, profile_complete, author flag on app_users (MySQL/SQLite safe)."""
    cols = [
        ("gender", "ALTER TABLE app_users ADD COLUMN gender VARCHAR(40) NULL"),
        ("birth_date", "ALTER TABLE app_users ADD COLUMN birth_date VARCHAR(20) NULL"),
        ("country", "ALTER TABLE app_users ADD COLUMN country VARCHAR(64) NULL"),
        ("facebook_url", "ALTER TABLE app_users ADD COLUMN facebook_url VARCHAR(255) NULL"),
        ("youtube_url", "ALTER TABLE app_users ADD COLUMN youtube_url VARCHAR(255) NULL"),
        ("instagram_url", "ALTER TABLE app_users ADD COLUMN instagram_url VARCHAR(255) NULL"),
        ("twitter_url", "ALTER TABLE app_users ADD COLUMN twitter_url VARCHAR(255) NULL"),
        ("website_url", "ALTER TABLE app_users ADD COLUMN website_url VARCHAR(255) NULL"),
        ("profile_complete", "ALTER TABLE app_users ADD COLUMN profile_complete TINYINT(1) NOT NULL DEFAULT 0"),
        ("is_author", "ALTER TABLE app_users ADD COLUMN is_author TINYINT(1) NOT NULL DEFAULT 0"),
        ("username_changed_at", "ALTER TABLE app_users ADD COLUMN username_changed_at DATETIME NULL"),
        ("username_change_count", "ALTER TABLE app_users ADD COLUMN username_change_count INT NOT NULL DEFAULT 0"),
    ]
    for col, sql in cols:
        try:
            if USE_SQLITE:
                # SQLite: check pragma
                rows = fetch_all(f"PRAGMA table_info(app_users)")
                names = {r.get("name") if isinstance(r, dict) else r[1] for r in (rows or [])}
                if col not in names:
                    execute_write(sql.replace("TINYINT(1) NOT NULL DEFAULT 0", "INTEGER DEFAULT 0").replace("VARCHAR(40)", "TEXT").replace("VARCHAR(20)", "TEXT"), ())
            else:
                cursor_check = fetch_all(f"SHOW COLUMNS FROM app_users LIKE %s", (col,))
                if not cursor_check:
                    execute_write(sql, ())
        except Exception as exc:
            LOGGER.warning("ensure profile col %s: %s", col, exc)

def require_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing user token")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing user token")

    try:
        encoded_payload, provided_signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid user token") from exc

    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, provided_signature):
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        payload = json.loads(
            base64.urlsafe_b64decode(encoded_payload.encode("ascii")).decode("utf-8")
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid user token") from exc

    if payload.get("role") != "user":
        raise HTTPException(status_code=403, detail="User role required")

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.startswith("user:"):
        raise HTTPException(status_code=401, detail="Invalid user token")

    expires_raw = payload.get("exp")
    if not isinstance(expires_raw, str):
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        expires_at = datetime.fromisoformat(expires_raw)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid user token") from exc

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="User token expired — please sign in again")

    uid = int(sub.split(":", 1)[1])
    reason = _user_access_block_reason(uid)
    if reason:
        raise HTTPException(status_code=403, detail=reason)

    # Session revoke: ban/suspend/password-reset bumps token_version
    try:
        rows = fetch_all(
            "SELECT COALESCE(token_version, 0) AS token_version FROM app_users WHERE id=%s LIMIT 1",
            (uid,),
        )
        if not rows:
            raise HTTPException(status_code=401, detail="Account not found")
        current_tv = int(_row_get(rows[0], "token_version") or 0)
        token_tv = int(payload.get("tv") or 0)
        # Accept legacy tokens without tv only if current_tv is still 0
        if token_tv != current_tv:
            raise HTTPException(
                status_code=401,
                detail="Session revoked. Please sign in again.",
            )
    except HTTPException:
        raise
    except Exception as exc:
        LOGGER.exception("token_version check failed for user %s", uid)
        raise HTTPException(
            status_code=503,
            detail="Could not verify your session. Please try again.",
        ) from exc

    return {"user_id": uid}


def _ensure_user_moderation_actions_table() -> None:
    """Private block/report actions used by profile moderation controls."""
    sql = (
        "CREATE TABLE IF NOT EXISTS user_moderation_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_user_id INTEGER NOT NULL, action TEXT NOT NULL, reason TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(reporter_id, target_user_id, action))"
        if USE_SQLITE else
        "CREATE TABLE IF NOT EXISTS user_moderation_actions (id INT AUTO_INCREMENT PRIMARY KEY, reporter_id INT NOT NULL, target_user_id INT NOT NULL, action VARCHAR(16) NOT NULL, reason TEXT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_user_action (reporter_id, target_user_id, action))"
    )
    execute_write(sql, ())


@app.get("/api/users/{user_id}/block")
def get_block_status(user_id: int, user: dict[str, Any] = Depends(require_user)):
    if int(user["user_id"]) == user_id:
        return {"ok": True, "blocked": False}
    _ensure_user_moderation_actions_table()
    rows = fetch_all(
        "SELECT id FROM user_moderation_actions WHERE reporter_id=%s AND target_user_id=%s AND action='block' LIMIT 1",
        (user["user_id"], user_id),
    )
    return {"ok": True, "blocked": bool(rows)}


@app.post("/api/users/{user_id}/block")
def block_user(user_id: int, user: dict[str, Any] = Depends(require_user)):
    if int(user["user_id"]) == user_id:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    _ensure_user_moderation_actions_table()
    if not fetch_all("SELECT id FROM app_users WHERE id=%s LIMIT 1", (user_id,)):
        raise HTTPException(status_code=404, detail="User not found")
    insert = "INSERT OR IGNORE" if USE_SQLITE else "INSERT IGNORE"
    execute_write(f"{insert} INTO user_moderation_actions (reporter_id,target_user_id,action) VALUES (%s,%s,'block')", (user["user_id"], user_id))
    return {"ok": True, "blocked": True}


@app.delete("/api/users/{user_id}/block")
def unblock_user(user_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_user_moderation_actions_table()
    execute_write("DELETE FROM user_moderation_actions WHERE reporter_id=%s AND target_user_id=%s AND action='block'", (user["user_id"], user_id))
    return {"ok": True, "blocked": False}


@app.post("/api/users/{user_id}/report")
def report_user(user_id: int, payload: dict[str, Any] | None = None, user: dict[str, Any] = Depends(require_user)):
    if int(user["user_id"]) == user_id:
        raise HTTPException(status_code=400, detail="You cannot report yourself")
    _ensure_user_moderation_actions_table()
    if not fetch_all("SELECT id FROM app_users WHERE id=%s LIMIT 1", (user_id,)):
        raise HTTPException(status_code=404, detail="User not found")
    reason = str((payload or {}).get("reason") or "").strip()[:500]
    insert = "INSERT OR IGNORE" if USE_SQLITE else "INSERT IGNORE"
    execute_write(f"{insert} INTO user_moderation_actions (reporter_id,target_user_id,action,reason) VALUES (%s,%s,'report',%s)", (user["user_id"], user_id, reason))
    return {"ok": True, "reported": True}


def optional_user(authorization: str | None = Header(default=None)) -> dict[str, Any] | None:
    """Like require_user but returns None instead of 401 when no/invalid token.
    Used for public endpoints that enrich response when the caller is logged in.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        encoded_payload, provided_signature = token.split(".", 1)
    except ValueError:
        return None
    expected_signature = hmac.new(
        JWT_SECRET.encode("utf-8"),
        encoded_payload.encode("ascii"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, provided_signature):
        return None
    try:
        payload = json.loads(
            base64.urlsafe_b64decode(encoded_payload.encode("ascii")).decode("utf-8")
        )
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("role") != "user":
        return None
    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.startswith("user:"):
        return None
    expires_raw = payload.get("exp")
    if not isinstance(expires_raw, str):
        return None
    try:
        expires_at = datetime.fromisoformat(expires_raw)
    except ValueError:
        return None
    if expires_at <= datetime.now(timezone.utc):
        return None
    try:
        uid = int(sub.split(":", 1)[1])
    except (ValueError, IndexError):
        return None
    reason = _user_access_block_reason(uid)
    if reason:
        return None
    return {"user_id": uid}


def _public_image_path(filename: str) -> str:
    return f"/uploads/{filename}"


def _ensure_media_table() -> None:
    """Durable image storage in MySQL (Vercel local disk is ephemeral)."""
    try:
        if USE_SQLITE:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS media_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    content_type TEXT NOT NULL DEFAULT 'image/jpeg',
                    data BLOB NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS media_files (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL,
                    content_type VARCHAR(128) NOT NULL DEFAULT 'image/jpeg',
                    data LONGBLOB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
    except Exception as exc:
        LOGGER.warning("media_files ensure failed: %s", exc)


def _store_media_bytes(content: bytes, filename: str, content_type: str = "image/jpeg") -> str:
    """Persist image bytes in DB; return public path /api/media/{id}."""
    if not content:
        raise HTTPException(status_code=400, detail="Empty image upload")
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB)")
    _ensure_media_table()
    # Also write local copy for local/dev StaticFiles
    try:
        UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
        (UPLOAD_ROOT / filename).write_bytes(content)
    except Exception as exc:
        LOGGER.info("local upload skipped (read-only FS / Vercel): %s — using DB media", exc)

    media_id, _ = execute_write(
        "INSERT INTO media_files (filename, content_type, data) VALUES (%s, %s, %s)",
        (filename, content_type or "image/jpeg", content),
    )
    if not media_id:
        # MySQL lastrowid recovery
        rows = fetch_all("SELECT id FROM media_files WHERE filename=%s ORDER BY id DESC LIMIT 1", (filename,))
        if rows:
            media_id = rows[0]["id"] if isinstance(rows[0], dict) else rows[0][0]
    if not media_id:
        # Fallback path to local filename (works only until cold start)
        return _public_image_path(filename)
    return f"/api/media/{int(media_id)}"



def _normalize_cover_path(path: str | None) -> str:
    if not path:
        return ""
    raw = str(path).strip()
    if not raw:
        return ""
    if raw.startswith(("http://", "https://")):
        return raw
    # Already a public uploads path
    if raw.startswith("/uploads/"):
        return raw
    # Legacy: story_card_images/... or assets/story_card_images/...
    if "story_card_images/" in raw:
        return _public_image_path(raw.split("/")[-1])
    # Bare filename or uploads/filename without leading slash
    if "/" not in raw or raw.startswith("uploads/"):
        return _public_image_path(raw.split("/")[-1])
    return raw


def _ensure_default_write_screen() -> None:
    rows = fetch_all("SELECT id FROM write_screen LIMIT 1")
    if not rows:
        execute_write(
            "INSERT INTO write_screen (manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta) VALUES (%s, %s, %s, %s, %s, %s)",
            (
                "Manage Stories,Analytics",
                "Published,Drafts",
                "Filter",
                "Sort",
                "You haven't published any stories yet",
                "Write a Story",
            ),
        )


def _ensure_default_profile() -> None:
    rows = fetch_all("SELECT id FROM profiles LIMIT 1")
    if not rows:
        execute_write(
            "INSERT INTO profiles (display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            ("Guest User", "guest", 0, 0, 0, 0, 0, 0),
        )


def _available_story_images() -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for file_path in sorted(UPLOAD_ROOT.glob("*")):
        if not file_path.is_file():
            continue
        extension = file_path.suffix.lower()
        if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue
        items.append(
            {
                "name": file_path.name,
                "path": _public_image_path(file_path.name),
            }
        )
    return items


def _fetch_google_json(endpoint: str, query: dict[str, str]) -> dict[str, Any]:
    url = f"{endpoint}?{urlencode(query)}"
    with urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _verify_google_payload(payload: GoogleAuthRequest) -> dict[str, Any]:
    """Verify Google id_token or access_token.

    If GOOGLE_CLIENT_IDS is empty, audience is not enforced (dev-friendly).
    Set GOOGLE_CLIENT_ID or GOOGLE_CLIENT_IDS in production to lock audiences.
    """
    def _check_audience(audience: str, token_info: dict[str, Any]) -> None:
        if not GOOGLE_CLIENT_IDS:
            LOGGER.warning(
                "GOOGLE_CLIENT_ID(s) not set — accepting Google token without audience check (dev mode). "
                "Set GOOGLE_CLIENT_IDS in backend .env for production."
            )
            return
        if audience and audience not in GOOGLE_CLIENT_IDS:
            LOGGER.warning(
                "Google audience mismatch: aud=%s allowed=%s tokeninfo=%s",
                audience,
                GOOGLE_CLIENT_IDS,
                token_info,
            )
            raise HTTPException(
                status_code=401,
                detail=(
                    "Google audience mismatch. Add this client ID to GOOGLE_CLIENT_IDS on the backend: "
                    f"{audience or '(empty)'}"
                ),
            )

    if payload.id_token:
        try:
            token_info = _fetch_google_json(
                "https://oauth2.googleapis.com/tokeninfo",
                {"id_token": payload.id_token},
            )
        except HTTPError as exc:
            # Google uses HTTP 4xx for rejected/expired credentials. Preserve
            # that distinction from a backend network outage below.
            try:
                google_error = json.loads(exc.read().decode("utf-8"))
                reason = google_error.get("error_description") or google_error.get("error")
            except Exception:
                reason = None
            raise HTTPException(
                status_code=401,
                detail=f"Google rejected the sign-in token{f': {reason}' if reason else ''}",
            ) from exc
        except URLError as exc:
            LOGGER.exception("Google id_token verification service unavailable")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in is temporarily unavailable because the backend cannot reach Google. Please try again later.",
            ) from exc
        except OSError as exc:
            # Some Windows socket failures (including WinError 10013) are
            # raised directly instead of being wrapped in URLError.
            LOGGER.exception("Google id_token verification network failure")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in is temporarily unavailable because the backend cannot reach Google. Please try again later.",
            ) from exc
        except Exception as exc:
            LOGGER.exception("Google id_token verification failed")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in could not be verified right now. Please try again later.",
            ) from exc
        LOGGER.debug("Google tokeninfo (id_token): %s", token_info)
        if token_info.get("error"):
            raise HTTPException(
                status_code=401,
                detail=f"Invalid Google id_token: {token_info.get('error_description') or token_info.get('error')}",
            )
        audience = (
            token_info.get("aud")
            or token_info.get("audience")
            or token_info.get("issued_to")
            or ""
        )
        _check_audience(str(audience), token_info)

        email = token_info.get("email", "")
        subject = token_info.get("sub", "")
        if not email or not subject:
            raise HTTPException(status_code=401, detail="Invalid Google token (missing email/sub)")

        return {
            "email": email,
            "subject": subject,
            "display_name": token_info.get("name") or email.split("@")[0],
            "photo_url": token_info.get("picture") or "",
        }

    if payload.access_token:
        try:
            token_info = _fetch_google_json(
                "https://oauth2.googleapis.com/tokeninfo",
                {"access_token": payload.access_token},
            )
        except HTTPError as exc:
            try:
                google_error = json.loads(exc.read().decode("utf-8"))
                reason = google_error.get("error_description") or google_error.get("error")
            except Exception:
                reason = None
            raise HTTPException(
                status_code=401,
                detail=f"Google rejected the sign-in token{f': {reason}' if reason else ''}",
            ) from exc
        except URLError as exc:
            LOGGER.exception("Google access_token verification service unavailable")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in is temporarily unavailable because the backend cannot reach Google. Please try again later.",
            ) from exc
        except OSError as exc:
            LOGGER.exception("Google access_token verification network failure")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in is temporarily unavailable because the backend cannot reach Google. Please try again later.",
            ) from exc
        except Exception as exc:
            LOGGER.exception("Google access_token verification failed")
            raise HTTPException(
                status_code=503,
                detail="Google sign-in could not be verified right now. Please try again later.",
            ) from exc
        LOGGER.debug("Google tokeninfo (access_token): %s", token_info)
        audience = (
            token_info.get("aud")
            or token_info.get("audience")
            or token_info.get("issued_to")
            or ""
        )
        _check_audience(str(audience), token_info)

        try:
            user_info = _fetch_google_json(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                {"access_token": payload.access_token},
            )
        except Exception as exc:
            LOGGER.exception("Google userinfo failed")
            raise HTTPException(
                status_code=401,
                detail=f"Google userinfo failed: {exc}",
            ) from exc
        LOGGER.debug("Google userinfo: %s", user_info)
        email = user_info.get("email", "")
        subject = user_info.get("id", "") or token_info.get("sub", "")
        if not email or not subject:
            raise HTTPException(status_code=401, detail="Invalid Google token (missing email/id)")

        return {
            "email": email,
            "subject": subject,
            "display_name": user_info.get("name") or email.split("@")[0],
            "photo_url": user_info.get("picture") or "",
        }

    raise HTTPException(
        status_code=400,
        detail="Missing Google token. App must send id_token or access_token from Google Sign-In.",
    )


def _parse_optional_datetime(value: str | None) -> datetime | None:
    if value is None or value.strip() == "":
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid scheduled date") from exc


def _serialize_datetime(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _record_chapter_revision(
    chapter_id: int,
    title: str,
    content: str,
    notes: str,
    submission_status: str,
    scheduled_for: datetime | None,
) -> None:
    scheduled_value = scheduled_for.isoformat() if isinstance(scheduled_for, datetime) else scheduled_for
    execute_write(
        """
        INSERT INTO chapter_revisions (chapter_id, title, content, notes, submission_status, scheduled_for)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (chapter_id, title, content, notes, submission_status, scheduled_value),
    )


@app.on_event("startup")
def startup_initialize_database():
    """Apply database migrations and idempotent schema ensures at backend startup."""
    try:
        from .startup_tasks import run_startup_tasks

        summary = run_startup_tasks()
        LOGGER.info("Startup tasks summary: %s", summary)

        book_count = 0
        try:
            books = fetch_all("SELECT COUNT(*) AS c FROM books")
            if books:
                r = books[0]
                if isinstance(r, dict):
                    book_count = int(r.get("c") or list(r.values())[0] or 0)
                else:
                    book_count = int(r[0])
            LOGGER.info("DB ready books=%s", book_count)
        except Exception as count_exc:
            raise RuntimeError(
                "Database is not ready: the backend could not read the books table."
            ) from count_exc

        # Schema ensures are idempotent and run at every backend startup so
        # deployed databases do not silently miss new tables/columns.
        skip_ensures = os.getenv("SKIP_STARTUP_SCHEMA_ENSURES", "").strip().lower() in ("1", "true", "yes")
        if skip_ensures:
            LOGGER.warning("Skipping startup schema ensures because SKIP_STARTUP_SCHEMA_ENSURES is enabled")
        else:
            ensure_fns = [
                _ensure_password_hash_column,
                _ensure_auth_profile_columns,
                _ensure_profile_extra_columns,
                _ensure_user_moderation_columns,
                _ensure_support_request_columns,
                _ensure_user_support_notifications_table,
                _ensure_push_tokens_table,
                _ensure_user_preferences_table,
                _ensure_media_table,
                _ensure_library_entries_table,
                _ensure_book_likes_table,
                _ensure_chapter_comments_table,
                _ensure_author_follows_table,
                _ensure_author_follows_columns,
                _ensure_tag_follows_table,
                _ensure_tags_schema,
                _ensure_book_meta_columns,
                _ensure_book_view_count_column,
                _ensure_wall_posts_table,
                _ensure_wall_post_likes_table,
                _ensure_search_history_table,
                _ensure_home_slider_sections_table,
                _ensure_home_hero_images_table,
                _ensure_default_write_screen,
                _ensure_default_profile,
            ]
            ensure_errors = []
            for fn in ensure_fns:
                try:
                    fn()
                except Exception as col_exc:
                    ensure_name = getattr(fn, "__name__", str(fn))
                    ensure_errors.append(f"{ensure_name}: {col_exc}")
                    LOGGER.exception("startup ensure %s failed", ensure_name)
            if ensure_errors:
                raise RuntimeError(
                    "Startup schema ensures failed: " + "; ".join(ensure_errors)
                )
            try:
                _purge_expired_account_deletions()
                _start_account_deletion_purger()
            except Exception:
                LOGGER.exception("Could not process expired account deletions")

        try:
            _content_version_row()
        except Exception as version_exc:
            raise RuntimeError("Could not ensure the content version row.") from version_exc

        enrichment = summary.get("content_enrichment", {})
        if isinstance(enrichment, dict) and enrichment.get("scheduled"):
            from threading import Thread

            def _run_background_enrichment() -> None:
                try:
                    from .content_enrichment_seed import run_content_enrichment

                    result = run_content_enrichment(force=False)
                    LOGGER.info("Background content enrichment completed: %s", result)
                except Exception:
                    LOGGER.exception("Background content enrichment failed")

            Thread(
                target=_run_background_enrichment,
                name="content-enrichment-seed",
                daemon=True,
            ).start()
            LOGGER.info("Scheduled content enrichment in background")
    except DB_INIT_EXCEPTIONS as exc:
        LOGGER.exception("Automatic database initialization failed: %s", exc)
        raise RuntimeError(
            "Backend startup aborted because database initialization failed."
        ) from exc
    except Exception as exc:
        LOGGER.exception("Unexpected error running startup tasks: %s", exc)
        raise



@app.get("/favicon.ico")
def favicon():
    """Avoid noisy browser 404s on Vercel."""
    from fastapi.responses import Response
    # 1x1 transparent PNG
    import base64
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    return Response(content=png, media_type="image/png")


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "novelhub-api",
        "docs": "/docs",
        "health": "/api/health",
    }

@app.get("/api/health")
def health(include_counts: bool = False):
    """Lightweight DB probe; request counts explicitly for local diagnostics."""
    try:
        from . import database as db_mod

        fetch_all("SELECT 1 AS ok")
        result = {
            "ok": True,
            "db_mode": "sqlite" if _live_use_sqlite() else "mysql",
            "mysql_database": os.getenv("MYSQL_DATABASE", "defaultdb"),
            "sqlite_file": str(getattr(db_mod, "SQLITE_FILE", "")),
        }
        if not include_counts:
            return result

        # Table counts can scan large production tables. Keep them opt-in so
        # health checks and app wakeups don't trigger three expensive queries.
        books = fetch_all("SELECT COUNT(*) AS c FROM books")
        cats = fetch_all("SELECT COUNT(*) AS c FROM categories")
        chs = fetch_all("SELECT COUNT(*) AS c FROM chapters")
        def _c(rows):
            if not rows:
                return 0
            r = rows[0]
            if isinstance(r, dict):
                return int(r.get("c") or list(r.values())[0] or 0)
            return int(r[0])
        import os as _os
        return {
            **result,
            "books": _c(books),
            "categories": _c(cats),
            "chapters": _c(chs),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@app.get("/api/content/version", response_model=VersionResponse)
def get_content_version(response: Response):
    global _VERSION_CACHE, _VERSION_CACHE_AT
    import time as _time
    now = _time.time()
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    if _VERSION_CACHE is not None and (now - _VERSION_CACHE_AT) < _VERSION_CACHE_TTL:
        return _VERSION_CACHE
    row = _content_version_row()
    _VERSION_CACHE = row if isinstance(row, dict) else {"value": str(row)}
    _VERSION_CACHE_AT = now
    return _VERSION_CACHE


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest):
    if payload.username != ADMIN_USERNAME or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = create_admin_token(payload.username)
    return {
        "token": token,
        "username": payload.username,
        "expires_in_hours": ADMIN_TOKEN_EXPIRES_HOURS,
    }



def _row_id(row: Any) -> int | None:
    """Get numeric id from dict or sequence row."""
    if row is None:
        return None
    if isinstance(row, dict):
        v = row.get("id")
        if v is None:
            try:
                v = next(iter(row.values()))
            except StopIteration:
                return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return None
    try:
        return int(row[0])
    except Exception:
        return None


def _find_user_id_by_email(email: str) -> int | None:
    rows = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
    if not rows:
        return None
    return _row_id(rows[0])


@app.post("/api/auth/google")
def authenticate_google(payload: GoogleAuthRequest):
    # Schema columns already ensured at deploy/startup — skip on hot path (cold-start 504).
    google_user = _verify_google_payload(payload)
    email = (google_user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")

    # Normalize stored email to lowercase for stable lookups
    rows = fetch_all(
        "SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1",
        (email,),
    )
    user_id = _row_id(rows[0]) if rows else None

    if user_id is not None:
        execute_write(
            """
            UPDATE app_users
            SET provider=%s, provider_subject=%s,
                photo_url=COALESCE(NULLIF(%s,''), photo_url),
                email=%s, last_login_at=CURRENT_TIMESTAMP
            WHERE id=%s
            """,
            (
                "google",
                google_user["subject"],
                google_user["photo_url"],
                email,
                user_id,
            ),
        )
    else:
        user_id, _ = execute_write(
            """
            INSERT INTO app_users (email, provider, provider_subject, display_name, photo_url, profile_complete)
            VALUES (%s, %s, %s, %s, %s, 0)
            """,
            (
                email,
                "google",
                google_user["subject"],
                google_user["display_name"],
                google_user["photo_url"],
            ),
        )
        # MySQL pure connector sometimes returns 0 lastrowid — resolve by email
        if not user_id:
            user_id = _find_user_id_by_email(email)
        if not user_id:
            raise HTTPException(
                status_code=500,
                detail="Google sign-in succeeded but user row could not be created. Check MYSQL_DATABASE=defaultdb.",
            )

    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=500, detail="Invalid user id after Google sign-in")

    account_status_message = _restore_account_on_login(user_id)
    _assert_user_can_login(user_id)
    # Load profile_complete so client can skip onboarding when already done
    pc = 0
    try:
        prow = fetch_all(
            """
            SELECT COALESCE(profile_complete,0) AS pc,
                   display_name, birth_date, gender, bio
            FROM app_users WHERE id=%s LIMIT 1
            """,
            (user_id,),
        )
        if prow:
            row = prow[0]
            pc = int(_row_get(row, "pc") or 0)
            has_birth = bool(str(_row_get(row, "birth_date") or "").strip())
            has_gender = bool(str(_row_get(row, "gender") or "").strip())
            # Only birth/gender mean real onboarding was done — not Google display_name
            if not pc and (has_birth or has_gender):
                pc = 1
                try:
                    execute_write(
                        "UPDATE app_users SET profile_complete=1 WHERE id=%s",
                        (user_id,),
                    )
                except Exception:
                    pass
    except Exception as exc:
        LOGGER.warning("google auth profile_complete read: %s", exc)
        # Column may be missing on Aiven until startup ALTER runs — create it
        try:
            _ensure_profile_extra_columns()
        except Exception:
            pass
    return {
        "id": user_id,
        "email": google_user["email"],
        "display_name": google_user["display_name"],
        "photo_url": google_user["photo_url"],
        "provider": "google",
        "profile_complete": bool(pc),
        "is_new_user": not bool(rows),
        "account_status_message": account_status_message,
        "token": create_user_token(user_id),
    }


@app.post("/api/auth/email")
def authenticate_email(payload: EmailAuthRequest):
    """Sign-up / sign-in with email. Password required for new accounts; verified when hash exists."""
    _ensure_password_hash_column()
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")

    password = payload.password or ""
    display_name = (
        (payload.display_name or "").strip()
        or (getattr(payload, "username", None) or "").strip()
        or email.split("@")[0]
    )

    rows = fetch_all(
        "SELECT id, password_hash, display_name FROM app_users WHERE LOWER(email)=%s LIMIT 1",
        (email,),
    )
    user_id = _row_id(rows[0]) if rows else None

    if user_id is not None:
        stored_hash = _row_get(rows[0], "password_hash") or ""
        if stored_hash:
            if not password or not _verify_password(password, stored_hash):
                raise HTTPException(status_code=401, detail="Invalid email or password")
            execute_write(
                """
                UPDATE app_users
                SET provider='email', display_name=%s, email=%s, last_login_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (display_name, email, user_id),
            )
        elif password:
            execute_write(
                """
                UPDATE app_users
                SET provider='email', display_name=%s, email=%s, password_hash=%s,
                    last_login_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (display_name, email, _hash_password(password), user_id),
            )
        else:
            execute_write(
                """
                UPDATE app_users
                SET provider='email', display_name=%s, email=%s, last_login_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (display_name, email, user_id),
            )
    else:
        if not password or len(password) < 6:
            raise HTTPException(
                status_code=400,
                detail="Password required (min 6 characters) to create an account",
            )
        pwd_hash = _hash_password(password)
        user_id, _ = execute_write(
            """
            INSERT INTO app_users (email, provider, display_name, photo_url, password_hash)
            VALUES (%s, 'email', %s, '', %s)
            """,
            (email, display_name, pwd_hash),
        )
        if not user_id:
            user_id = _find_user_id_by_email(email)
        if not user_id:
            raise HTTPException(
                status_code=500,
                detail="Could not create user. Check MYSQL_DATABASE and app_users table.",
            )

    user_id = int(user_id)
    account_status_message = _restore_account_on_login(user_id)
    _assert_user_can_login(user_id)
    return {
        "id": user_id,
        "email": email,
        "display_name": display_name,
        "photo_url": "",
        "provider": "email",
        "is_new_user": not bool(rows),
        "account_status_message": account_status_message,
        "token": create_user_token(user_id),
    }



@app.post("/api/auth/register")
def register_user(payload: RegisterRequest):
    """Create account (unverified). Sends email verification code. No session until verified."""
    _ensure_password_hash_column()
    _ensure_auth_profile_columns()
    email = (payload.email or "").strip().lower()
    username = (payload.username or "").strip().lstrip("@").lower()
    password = (payload.password or "").strip()
    display_name = (payload.display_name or "").strip() or username or email.split("@")[0]
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if not payload.accepted_terms:
        raise HTTPException(status_code=400, detail="You must agree to the Privacy Policy and Terms")
    if not (payload.gender or "").strip():
        raise HTTPException(status_code=400, detail="Select your gender")
    if _user_age_years(payload.birth_date) is None or _user_age_years(payload.birth_date) < 16:
        raise HTTPException(status_code=400, detail="You must be at least 16 years old to create an account")
    ok, msg = _password_policy_ok(password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    existing = fetch_all(
        "SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1",
        (email,),
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered — please log in")
    try:
        uname_rows = fetch_all(
            "SELECT id FROM app_users WHERE LOWER(username)=%s LIMIT 1",
            (username,),
        )
        if uname_rows:
            raise HTTPException(status_code=400, detail="Username already taken")
    except HTTPException:
        raise
    except Exception:
        pass
    token = secrets.token_hex(16)
    pwd_hash = _hash_password(password)
    photo = (payload.photo_url or "").strip()
    cover = (payload.cover_url or "").strip()
    gender = (payload.gender or "").strip()
    birth_date = (payload.birth_date or "").strip()
    country = (payload.country or "").strip()
    profile_complete = bool(
        payload.profile_complete and gender and birth_date and country
    )
    try:
        user_id, _ = execute_write(
            """
            INSERT INTO app_users
              (email, provider, display_name, photo_url, cover_url, password_hash,
               username, email_verified, verification_token, gender, birth_date,
               country, profile_complete)
            VALUES (%s, 'email', %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s)
            """,
            (
                email,
                display_name,
                photo,
                cover,
                pwd_hash,
                username,
                token,
                gender,
                birth_date,
                country,
                int(profile_complete),
            ),
        )
    except Exception:
        user_id, _ = execute_write(
            """
            INSERT INTO app_users (email, provider, display_name, photo_url, password_hash)
            VALUES (%s, 'email', %s, %s, %s)
            """,
            (email, display_name, photo, pwd_hash),
        )
        try:
            execute_write(
                """
                UPDATE app_users
                SET username=%s, email_verified=0, verification_token=%s, cover_url=%s,
                    gender=%s, birth_date=%s, country=%s, profile_complete=%s
                WHERE id=%s
                """,
                (
                    username,
                    token,
                    cover,
                    gender,
                    birth_date,
                    country,
                    int(profile_complete),
                    user_id,
                ),
            )
        except Exception:
            pass
    sent = _send_verification_email(email, token, display_name)
    return {
        "ok": True,
        "needs_verification": True,
        "email": email,
        "email_sent": sent,
        "message": (
            "Check your email for a verification code, then log in."
            if sent
            else "Verification email could not be sent. Configure email delivery or try again later."
        ),
        **({} if sent else _development_verification_fields(token)),
    }


@app.post("/api/auth/login")
def login_user(payload: EmailAuthRequest):
    """Login with username OR email + password. Fast path — no ALTER TABLE."""
    ident = (payload.email or payload.username or "").strip()
    password = (payload.password or "").strip()
    if not ident or not password:
        raise HTTPException(status_code=400, detail="Username/email and password required")

    # Prefer simple SELECT first (email). Avoid username column if schema lag.
    rows = None
    try:
        if "@" in ident:
            rows = fetch_all(
                """
                SELECT id, password_hash, display_name, email, username, provider
                FROM app_users WHERE LOWER(email)=%s LIMIT 1
                """,
                (ident.lower(),),
            )
        if not rows:
            # try username column when present
            try:
                rows = fetch_all(
                    """
                    SELECT id, password_hash, display_name, email, username, provider
                    FROM app_users WHERE LOWER(username)=%s LIMIT 1
                    """,
                    (ident.lower().lstrip("@"),),
                )
            except Exception:
                rows = None
    except Exception as exc:
        LOGGER.exception("login query failed: %s", exc)
        raise HTTPException(status_code=500, detail="Login temporarily unavailable") from exc

    if not rows:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user = rows[0]
    user_id = int(_row_get(user, "id"))
    stored = _row_get(user, "password_hash") or ""
    if not stored or not _verify_password(password, stored):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    provider = str(_row_get(user, "provider") or "email")
    # Soft verification: only block if column exists AND explicitly 0
    try:
        vrows = fetch_all(
            "SELECT COALESCE(email_verified, 1) AS email_verified FROM app_users WHERE id=%s LIMIT 1",
            (user_id,),
        )
        verified = int(_row_get(vrows[0], "email_verified") if vrows else 1)
        if provider == "email" and verified == 0:
            raise HTTPException(
                status_code=403,
                detail="Email not verified. Check your inbox for the verification code.",
            )
    except HTTPException:
        raise
    except Exception:
        pass  # column missing — allow login
    account_status_message = None
    try:
        account_status_message = _restore_account_on_login(user_id)
        _assert_user_can_login(user_id)
    except HTTPException:
        raise
    except Exception:
        pass
    try:
        execute_write(
            "UPDATE app_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=%s",
            (user_id,),
        )
    except Exception:
        pass
    token = create_user_token(user_id)
    return {
        "token": token,
        "user_id": user_id,
        "display_name": _row_get(user, "display_name") or "",
        "email": _row_get(user, "email") or "",
        "username": _row_get(user, "username") or "",
        "provider": provider,
        "account_status_message": account_status_message,
    }


@app.post("/api/auth/verify-email")
def verify_email_post(payload: VerifyEmailRequest):
    _ensure_auth_profile_columns()
    token = (payload.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token required")
    rows = fetch_all(
        "SELECT id, email FROM app_users WHERE verification_token=%s LIMIT 1",
        (token,),
    )
    if not rows and payload.email:
        rows = fetch_all(
            "SELECT id, email FROM app_users WHERE LOWER(email)=%s AND verification_token=%s LIMIT 1",
            (payload.email.strip().lower(), token),
        )
    if not rows:
        raise HTTPException(status_code=400, detail="Invalid or expired verification code")
    user_id = int(_row_get(rows[0], "id"))
    execute_write(
        """
        UPDATE app_users
        SET email_verified=1, verification_token=NULL
        WHERE id=%s
        """,
        (user_id,),
    )
    return {"ok": True, "message": "Email verified. You can log in now."}


@app.get("/api/auth/verify-email")
def verify_email_get(token: str = ""):
    """Browser link from email."""
    if not token:
        return {"ok": False, "detail": "Missing token"}
    try:
        return verify_email_post(VerifyEmailRequest(token=token))
    except HTTPException as exc:
        return {"ok": False, "detail": exc.detail}


@app.post("/api/auth/resend-verification")
def resend_verification(payload: VerifyEmailRequest):
    _ensure_auth_profile_columns()
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")
    rows = fetch_all(
        "SELECT id, display_name, COALESCE(email_verified,0) AS email_verified FROM app_users WHERE LOWER(email)=%s LIMIT 1",
        (email,),
    )
    if not rows:
        return {"ok": True, "message": "If that email exists, a code was sent."}
    if int(_row_get(rows[0], "email_verified") or 0) == 1:
        return {"ok": True, "message": "Email already verified — please log in."}
    token = secrets.token_hex(16)
    execute_write(
        "UPDATE app_users SET verification_token=%s WHERE id=%s",
        (token, int(_row_get(rows[0], "id"))),
    )
    sent = _send_verification_email(email, token, str(_row_get(rows[0], "display_name") or ""))
    return {
        "ok": True,
        "email_sent": sent,
        "message": (
            "Verification code sent."
            if sent
            else "Verification email could not be sent. Please try again later."
        ),
        **({} if sent else _development_verification_fields(token)),
    }


@app.post("/api/auth/guest")
def authenticate_guest(payload: GuestAuthRequest | None = None):
    """Device-scoped guest — never share one global guest@novel.app account."""
    device_id = ""
    if payload is not None:
        device_id = str(getattr(payload, "device_id", "") or "").strip()
    if len(device_id) < 8:
        device_id = secrets.token_hex(16)

    email = f"guest_{device_id[:32]}@novel.app"
    display_name = "Guest"
    rows = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
    user_id = int(_row_get(rows[0], "id")) if rows else None
    if user_id is not None:
        try:
            execute_write(
                """
                UPDATE app_users
                SET provider='guest', display_name=%s, last_login_at=CURRENT_TIMESTAMP,
                    is_deleted=0, is_banned=0, is_suspended=0, suspended_until=NULL
                WHERE id=%s
                """,
                (display_name, user_id),
            )
        except Exception:
            try:
                execute_write(
                    "UPDATE app_users SET provider='guest', display_name=%s WHERE id=%s",
                    (display_name, user_id),
                )
            except Exception:
                pass
    else:
        user_id, _ = execute_write(
            """
            INSERT OR IGNORE INTO app_users (email, provider, display_name, photo_url)
            VALUES (%s, 'guest', %s, '')
            """,
            (email, display_name),
        )
        if not user_id:
            rows2 = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
            if rows2:
                user_id = int(_row_get(rows2[0], "id"))
        if not user_id:
            raise HTTPException(status_code=500, detail="Could not create guest user")

    return {
        "id": int(user_id),
        "email": email,
        "display_name": display_name,
        "photo_url": "",
        "provider": "guest",
        "token": create_user_token(int(user_id)),
        "is_guest": True,
    }



@app.get("/api/me")
def get_me(user: dict[str, Any] = Depends(require_user)):
    """Fast profile for app shell — few queries, no schema ensure on hot path."""
    uid = user["user_id"]
    try:
        rows = fetch_all(
            """SELECT id, email, username, display_name, photo_url, cover_url, bio, provider,
                      gender, birth_date, country, facebook_url, youtube_url, instagram_url, twitter_url, website_url,
                      username_changed_at,
                      COALESCE(username_change_count,0) AS username_change_count,
                      COALESCE(profile_complete,0) AS profile_complete,
                      COALESCE(is_author,0) AS is_author
               FROM app_users WHERE id=%s LIMIT 1""",
            (uid,),
        )
    except Exception:
        rows = fetch_all(
            "SELECT id, email, display_name, photo_url, cover_url, bio, provider, "
            "COALESCE(profile_complete,0) AS profile_complete FROM app_users WHERE id=%s LIMIT 1",
            (uid,),
        )
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    u = rows[0]

    # One round-trip for counts (instead of 4–6 sequential queries)
    story_count = library_count = reading_list_count = chapters_read = 0
    followers = following = 0
    try:
        count_rows = fetch_all(
            """
            SELECT
              (SELECT COUNT(*) FROM books WHERE user_id=%s) AS story_count,
              (SELECT COUNT(*) FROM library_entries WHERE user_id=%s) AS library_count,
              (SELECT COUNT(*) FROM reading_lists WHERE user_id=%s) AS reading_list_count,
              (SELECT COALESCE(SUM(chapters_read), 0) FROM library_entries WHERE user_id=%s) AS chapters_read
            """,
            (uid, uid, uid, uid),
        )
        if count_rows:
            cr = count_rows[0]
            story_count = int(_row_get(cr, "story_count") or 0)
            library_count = int(_row_get(cr, "library_count") or 0)
            reading_list_count = int(_row_get(cr, "reading_list_count") or 0)
            chapters_read = int(_row_get(cr, "chapters_read") or 0)
    except Exception as exc:
        LOGGER.warning("get_me counts soft-fail: %s", exc)

    try:
        followers = _count_followers(uid)
        following = _count_following(uid)
    except Exception:
        pass

    display_name = _row_get(u, "display_name") or (_row_get(u, "email") or "Reader").split("@")[0]
    username = "@" + display_name.lower().replace(" ", "")
    return {
        "id": _row_get(u, "id"),
        "email": _row_get(u, "email") or "",
        "display_name": display_name,
        "username": _row_get(u, "username") or username,
        "photo_url": _row_get(u, "photo_url") or "",
        "avatar_url": _row_get(u, "photo_url") or "",
        "cover_url": _row_get(u, "cover_url") or "",
        "bio": _row_get(u, "bio") or "",
        "provider": _row_get(u, "provider") or "",
        "following": following,
        "followers": followers,
        "blocked": 0,
        "chapters_read": chapters_read,
        "social_karma": story_count * 10,
        "day_streak": 0,
        "story_count": story_count,
        "library_count": library_count,
        "reading_list_count": reading_list_count,
        "gender": _row_get(u, "gender") or "",
        "birth_date": str(_row_get(u, "birth_date") or ""),
        "country": _row_get(u, "country") or "",
        "facebook_url": _row_get(u, "facebook_url") or "",
        "youtube_url": _row_get(u, "youtube_url") or "",
        "instagram_url": _row_get(u, "instagram_url") or "",
        "twitter_url": _row_get(u, "twitter_url") or "",
        "website_url": _row_get(u, "website_url") or "",
        "username_changed_at": _row_get(u, "username_changed_at"),
        "username_change_count": int(_row_get(u, "username_change_count") or 0),
        "profile_complete": bool(int(_row_get(u, "profile_complete") or 0)),
        "is_author": bool(int(_row_get(u, "is_author") or 0)),
    }


@app.get("/api/users/search")
def search_users(
    query: str = Query(default=""),
    limit: int = Query(default=30, ge=1, le=100),
):
    """Search public author profiles by display name or username."""
    q_raw = (query or "").strip()
    params: list[Any] = []
    query_filter = ""
    if q_raw:
        like = "%" + q_raw + "%"
        query_filter = """
            AND (COALESCE(display_name, '') LIKE %s
                 OR COALESCE(username, '') LIKE %s)
        """
        params.extend((like, like))
    params.append(limit)
    rows = fetch_all(
        f"""
        SELECT id, username, display_name, photo_url, cover_url, bio
        FROM app_users
        WHERE COALESCE(is_deactivated,0)=0 AND (
            COALESCE(is_author, 0)=1
            OR EXISTS (
                SELECT 1 FROM books b
                WHERE b.user_id=app_users.id
                  AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'draft%%'
                  AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%%'
                  AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted', '')
            )
        )
        {query_filter}
        ORDER BY id DESC
        LIMIT %s
        """,
        tuple(params),
    )
    items = []
    for u in (rows or []):
        display = _row_get(u, "display_name") or _row_get(u, "username") or "Reader"
        username = _row_get(u, "username") or ("@" + display.lower().replace(" ", ""))
        items.append(
            {
                "id": u.get("id"),
                "display_name": display,
                "username": username,
                "photo_url": u.get("photo_url") or "",
                "cover_url": u.get("cover_url") or "",
                "bio": u.get("bio") or "",
            }
        )
    return {"items": items}


@app.get("/api/users/{user_id}")
def get_user_profile(user_id: int):
    rows = fetch_all(
        "SELECT id, username, display_name, photo_url, cover_url, bio, gender, birth_date, country, facebook_url, youtube_url, instagram_url, twitter_url, website_url, COALESCE(profile_complete,0) AS profile_complete, COALESCE(is_author,0) AS is_author FROM app_users WHERE id=%s AND COALESCE(is_deactivated,0)=0 LIMIT 1",
        (user_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    u = rows[0]
    story_count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM books WHERE user_id=%s",
        (user_id,),
    )
    library_count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM library_entries WHERE user_id=%s",
        (user_id,),
    )
    reading_list_count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM reading_lists WHERE user_id=%s",
        (user_id,),
    )
    completed_rows = fetch_all(
        """
        SELECT COUNT(*) AS c FROM library_entries
        WHERE user_id=%s AND LOWER(reading_status) IN ('completed', 'complete', 'finished', 'done')
        """,
        (user_id,),
    )
    story_count = int(story_count_rows[0]["c"]) if story_count_rows else 0
    library_count = int(library_count_rows[0]["c"]) if library_count_rows else 0
    reading_list_count = int(reading_list_count_rows[0]["c"]) if reading_list_count_rows else 0
    completed_count = int(completed_rows[0]["c"]) if completed_rows else 0
    followers = _count_followers(user_id)
    following = _count_following(user_id)
    display_name = _row_get(u, "display_name") or _row_get(u, "username") or "Reader"
    username = _row_get(u, "username") or ("@" + display_name.lower().replace(" ", ""))
    return {
        "id": _row_get(u, "id"),
        "display_name": display_name,
        "username": username,
        "photo_url": _row_get(u, "photo_url") or "",
        "avatar_url": _row_get(u, "photo_url") or "",
        "cover_url": _row_get(u, "cover_url") or "",
        "bio": _row_get(u, "bio") or "",
        "gender": _row_get(u, "gender") or "",
        "birth_date": str(_row_get(u, "birth_date") or ""),
        "country": _row_get(u, "country") or "",
        "facebook_url": _row_get(u, "facebook_url") or "",
        "youtube_url": _row_get(u, "youtube_url") or "",
        "instagram_url": _row_get(u, "instagram_url") or "",
        "twitter_url": _row_get(u, "twitter_url") or "",
        "website_url": _row_get(u, "website_url") or "",
        "profile_complete": bool(int(_row_get(u, "profile_complete") or 0)),
        "is_author": bool(int(_row_get(u, "is_author") or 0)),
        "following": following,
        "followers": followers,
        "blocked": 0,
        "chapters_read": completed_count,
        "social_karma": story_count * 10,
        "day_streak": 0,
        "story_count": story_count,
        "library_count": library_count,
        "reading_list_count": reading_list_count,
    }


@app.put("/api/me")
def update_me(
    payload: ProfileUpdateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Persist profile fields into app_users (single UPDATE for cold-start speed)."""
    uid = int(user["user_id"])
    _ensure_auth_profile_columns()
    _ensure_profile_extra_columns()
    if payload.birth_date is not None and payload.birth_date.strip():
        profile_age = _user_age_years(payload.birth_date)
        if profile_age is None or profile_age < 16:
            raise HTTPException(status_code=400, detail="Wingsaga accounts require users to be at least 16 years old")
    sets: list[str] = []
    vals: list[Any] = []

    def _queue(col: str, val: Any) -> None:
        sets.append(f"{col}=%s")
        vals.append(val)

    if payload.display_name is not None:
        _queue("display_name", payload.display_name.strip() or "Reader")
    username_changed = False
    username_change_count = 0
    if payload.username is not None:
        username = payload.username.strip().lstrip("@").lower()
        if not (3 <= len(username) <= 32) or not re.fullmatch(r"[a-z0-9_]+", username):
            raise HTTPException(status_code=422, detail="Username must be 3–32 letters, numbers, or underscores")
        current_rows = fetch_all(
            "SELECT username, COALESCE(username_change_count, 0) AS username_change_count, username_changed_at FROM app_users WHERE id=%s LIMIT 1",
            (uid,),
        )
        current_username = str(_row_get(current_rows[0], "username") or "").strip().lower() if current_rows else ""
        username_change_count = int(_row_get(current_rows[0], "username_change_count") or 0) if current_rows else 0
        changed_at = _row_get(current_rows[0], "username_changed_at") if current_rows else None
        if username != current_username:
            username_changed = True
            if changed_at:
                try:
                    last_change = changed_at if isinstance(changed_at, datetime) else datetime.fromisoformat(str(changed_at).replace("Z", "+00:00"))
                    if last_change.tzinfo is None:
                        last_change = last_change.replace(tzinfo=timezone.utc)
                    wait_days = 7 if username_change_count < 1 else 30
                    remaining = last_change + timedelta(days=wait_days) - datetime.now(timezone.utc)
                    if remaining.total_seconds() > 0:
                        days = max(1, remaining.days + (1 if remaining.seconds else 0))
                        raise HTTPException(status_code=429, detail=f"You can change your username again in {days} day(s).")
                except HTTPException:
                    raise
                except (TypeError, ValueError):
                    pass
        existing = fetch_all(
            "SELECT id FROM app_users WHERE LOWER(username)=%s AND id<>%s LIMIT 1",
            (username, uid),
        )
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
        _queue("username", username)
        if username_changed:
            _queue("username_changed_at", datetime.now(timezone.utc).replace(tzinfo=None))
            username_change_count += 1
            _queue("username_change_count", username_change_count)
    if payload.photo_url is not None:
        _queue("photo_url", payload.photo_url)
    if payload.cover_url is not None:
        _queue("cover_url", payload.cover_url)
    if payload.bio is not None:
        _queue("bio", payload.bio)
    if payload.gender is not None:
        _queue("gender", payload.gender)
    if payload.birth_date is not None:
        # MySQL DATE columns reject an empty string. The profile editor sends
        # an empty value when the user clears an optional birthday.
        _queue("birth_date", payload.birth_date.strip() or None)
    if payload.country is not None:
        _queue("country", payload.country)
    if payload.facebook_url is not None:
        _queue("facebook_url", payload.facebook_url)
    if payload.youtube_url is not None:
        _queue("youtube_url", payload.youtube_url)
    if payload.instagram_url is not None:
        _queue("instagram_url", payload.instagram_url)
    if payload.twitter_url is not None:
        _queue("twitter_url", payload.twitter_url)
    if payload.website_url is not None:
        _queue("website_url", payload.website_url)

    want_complete = payload.profile_complete is True or (
        payload.profile_complete is None
        and payload.display_name is not None
        and payload.birth_date is not None
        and payload.country is not None
        and bool((payload.display_name or "").strip())
        and bool((payload.birth_date or "").strip())
        and bool((payload.country or "").strip())
    )
    if want_complete or payload.profile_complete is True:
        if not (payload.display_name or "").strip() or not (payload.birth_date or "").strip() or not (payload.country or "").strip() or (payload.username is not None and not payload.username.strip()):
            raise HTTPException(
                status_code=422,
                detail="Username, display name, birthday, and country are required to complete your profile",
            )
    if payload.profile_complete is False:
        _queue("profile_complete", 0)
    elif want_complete or payload.profile_complete is True:
        _queue("profile_complete", 1)

    if sets:
        try:
            execute_write(
                f"UPDATE app_users SET {', '.join(sets)} WHERE id=%s",
                (*vals, uid),
            )
        except Exception as exc:
            LOGGER.exception("update_me batch failed: %s", exc)
            for col, val in zip([s.split("=")[0] for s in sets], vals):
                try:
                    execute_write(f"UPDATE app_users SET {col}=%s WHERE id=%s", (val, uid))
                except Exception as one_exc:
                    LOGGER.warning("update_me set %s failed: %s", col, one_exc)
                    raise HTTPException(
                        status_code=503,
                        detail=f"Could not save profile field: {col}",
                    ) from one_exc

    try:
        rows = fetch_all(
            """
            SELECT id, email, username, display_name, photo_url, cover_url, bio, provider,
                   gender, birth_date, country, facebook_url, youtube_url, instagram_url, twitter_url, website_url,
                   username_changed_at, COALESCE(username_change_count,0) AS username_change_count,
                   COALESCE(profile_complete,0) AS profile_complete
            FROM app_users WHERE id=%s LIMIT 1
            """,
            (uid,),
        )
    except Exception:
        rows = fetch_all(
            "SELECT id, email, username, display_name, photo_url, cover_url, bio, provider, COALESCE(profile_complete,0) AS profile_complete FROM app_users WHERE id=%s LIMIT 1",
            (uid,),
        )
    u = rows[0] if rows else {}
    pc = int(_row_get(u, "profile_complete") or 0)
    LOGGER.info("update_me user=%s profile_complete=%s", uid, pc)
    return {
        "ok": True,
        "id": _row_get(u, "id") or uid,
        "email": _row_get(u, "email") or "",
        "username": _row_get(u, "username") or "",
        "display_name": _row_get(u, "display_name") or "Reader",
        "photo_url": _row_get(u, "photo_url") or "",
        "cover_url": _row_get(u, "cover_url") or "",
        "bio": _row_get(u, "bio") or "",
        "gender": _row_get(u, "gender") or "",
        "birth_date": str(_row_get(u, "birth_date") or ""),
        "country": _row_get(u, "country") or "",
        "facebook_url": _row_get(u, "facebook_url") or "",
        "youtube_url": _row_get(u, "youtube_url") or "",
        "instagram_url": _row_get(u, "instagram_url") or "",
        "twitter_url": _row_get(u, "twitter_url") or "",
        "website_url": _row_get(u, "website_url") or "",
        "username_changed_at": _row_get(u, "username_changed_at"),
        "username_change_count": int(_row_get(u, "username_change_count") or 0),
        "username_next_change_days": 7 if int(_row_get(u, "username_change_count") or 0) < 1 else 30,
        "profile_complete": bool(pc),
    }




@app.post("/api/me/deactivate")
def deactivate_my_account(
    payload: AccountLifecycleRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Deactivate the account; signing in again reactivates it."""
    uid = int(user["user_id"])
    _verify_account_lifecycle_password(uid, payload.password)
    _ensure_user_moderation_columns()
    _update_account_lifecycle_state(uid, "is_deactivated=1")
    return {
        "ok": True,
        "deactivated": True,
        "message": "Your account is deactivated. Sign in again to reactivate it. Your profile and stories are preserved.",
    }


@app.post("/api/me/delete")
def request_account_deletion(
    payload: AccountLifecycleRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Schedule account deletion with a 30-day grace period for cancellation."""
    uid = int(user["user_id"])
    _verify_account_lifecycle_password(uid, payload.password)
    _ensure_user_moderation_columns()
    requested_at = datetime.now(timezone.utc).isoformat()
    _update_account_lifecycle_state(
        uid,
        "is_deleted=1, deletion_requested_at=%s",
        (requested_at,),
    )
    return {
        "ok": True,
        "deletion_scheduled": True,
        "grace_period_days": ACCOUNT_DELETION_GRACE_DAYS,
        "message": "Account deletion is scheduled. Sign in within 30 days to cancel it; after that, account data is permanently removed.",
    }


@app.post("/api/me/link-email")
def link_email_password(
    payload: LinkEmailRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Attach email+password so Google users can also sign in with email."""
    email = (payload.email or "").strip().lower()
    username = (payload.username or "").strip().lstrip("@").lower()
    password = payload.password or ""
    if not username:
        current_rows = fetch_all(
            "SELECT username FROM app_users WHERE id=%s LIMIT 1",
            (user["user_id"],),
        )
        username = str(_row_get(current_rows[0], "username") or "").strip().lower() if current_rows else ""
    if (email and "@" not in email) or (not email and not username):
        raise HTTPException(status_code=400, detail="Valid username/email required")
    ok, message = _password_policy_ok(password)
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    try:
        _ensure_password_hash_column()
    except Exception:
        pass
    pw_hash = _hash_password(password)
    # Ensure email unique
    if email:
        existing = fetch_all(
            "SELECT id FROM app_users WHERE LOWER(email)=%s AND id<>%s LIMIT 1",
            (email, user["user_id"]),
        )
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
    if username:
        try:
            existing = fetch_all(
                "SELECT id FROM app_users WHERE LOWER(username)=%s AND id<>%s LIMIT 1",
                (username, user["user_id"]),
            )
        except Exception:
            _ensure_auth_profile_columns()
            existing = fetch_all(
                "SELECT id FROM app_users WHERE LOWER(username)=%s AND id<>%s LIMIT 1",
                (username, user["user_id"]),
            )
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")
    fields = ["password_hash=%s"]
    values: list[Any] = [pw_hash]
    if email:
        fields.append("email=%s")
        values.append(email)
    if username:
        fields.append("username=%s")
        values.append(username)
    values.append(user["user_id"])
    try:
        execute_write(
            f"UPDATE app_users SET {', '.join(fields)}, updated_at=CURRENT_TIMESTAMP WHERE id=%s",
            tuple(values),
        )
    except Exception as exc:
        LOGGER.warning("link-email failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not link email")
    return {"ok": True, "email": email, "username": username}


def _admin_session_response() -> dict[str, Any]:
    return {"ok": True, "username": ADMIN_USERNAME}


@app.get("/api/admin/session")
def admin_session_get(_: dict[str, Any] = Depends(require_admin)):
    """Validate admin Bearer token using GET."""
    return _admin_session_response()


@app.post("/api/admin/session")
def admin_session_post(_: dict[str, Any] = Depends(require_admin)):
    """Validate admin Bearer token using POST for existing clients."""
    return _admin_session_response()


@lru_cache(maxsize=64)
def _responsive_media_bytes(media_id: int, width: int) -> bytes:
    rows = fetch_all(
        "SELECT data FROM media_files WHERE id=%s LIMIT 1",
        (media_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Media not found")
    data = rows[0]["data"] if isinstance(rows[0], dict) else rows[0][0]
    if isinstance(data, memoryview):
        data = data.tobytes()
    if isinstance(data, str):
        data = data.encode("latin-1")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(bytes(data))) as source:
                image = ImageOps.exif_transpose(source)
                image.thumbnail((width, 2400), Image.Resampling.LANCZOS)
                if "A" in image.getbands() or (
                    image.mode == "P" and "transparency" in image.info
                ):
                    image = image.convert("RGBA")
                else:
                    image = image.convert("RGB")
                output = BytesIO()
                image.save(output, format="WEBP", quality=82, method=5)
                return output.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        LOGGER.warning("Could not create responsive media variant for %s: %s", media_id, exc)
        raise HTTPException(status_code=415, detail="Responsive image variant is unavailable") from exc


@app.get("/api/media/{media_id}")
def get_media_file(media_id: int, width: int | None = Query(default=None, ge=160, le=1280)):
    """Serve image bytes stored in MySQL (survives Vercel cold starts)."""
    from fastapi.responses import Response

    if width is not None:
        if width not in {320, 640, 960, 1280}:
            raise HTTPException(status_code=400, detail="Unsupported responsive image width")
        return Response(
            content=_responsive_media_bytes(media_id, width),
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=86400, immutable"},
        )

    # Do not run schema ensure on every image request (cold-start stampede).
    rows = fetch_all(
        "SELECT filename, content_type, data FROM media_files WHERE id=%s LIMIT 1",
        (media_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Media not found")
    row = rows[0]
    data = row["data"] if isinstance(row, dict) else row[2]
    ctype = (row["content_type"] if isinstance(row, dict) else row[1]) or "image/jpeg"
    if isinstance(data, memoryview):
        data = data.tobytes()
    if isinstance(data, str):
        data = data.encode("latin-1")
    return Response(content=bytes(data), media_type=str(ctype), headers={
        "Cache-Control": "public, max-age=86400",
    })


@app.get("/api/story-images")
def list_story_images():
    return {"items": _available_story_images()}


@app.post("/api/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    _: dict[str, Any] = Depends(require_admin),
):
    return await _save_uploaded_image(file)


async def _save_uploaded_image(
    file: UploadFile,
    optimize: bool = False,
) -> dict[str, str]:
    extension = Path(file.filename or "upload").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported image format")

    content = await file.read(8 * 1024 * 1024 + 1)
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large (max 8MB)")

    if optimize:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(content)) as source:
                    image = ImageOps.exif_transpose(source)
                    image.thumbnail((1600, 2400), Image.Resampling.LANCZOS)
                    if "A" in image.getbands() or (
                        image.mode == "P" and "transparency" in image.info
                    ):
                        image = image.convert("RGBA")
                    else:
                        image = image.convert("RGB")
                    optimized = BytesIO()
                    image.save(optimized, format="WEBP", quality=82, method=5)
                    content = optimized.getvalue()
        except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
            LOGGER.info("Rejected invalid writer image upload %s: %s", file.filename, exc)
            raise HTTPException(status_code=400, detail="The uploaded image could not be decoded") from exc

        extension = ".webp"
        ctype = "image/webp"
    else:
        ctype = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }.get(extension, "image/jpeg")

    filename = f"{uuid4().hex}{extension}"
    path = _store_media_bytes(content, filename, ctype)
    bump_content_version()
    return {"path": path, "filename": filename, "url": path}


@app.post("/api/admin/tags/upload-cover")
async def upload_admin_tag_cover(
    file: UploadFile = File(...),
    _: dict[str, Any] = Depends(require_admin),
):
    return await _save_uploaded_image(file, optimize=True)


@app.post("/api/write/upload-image")
async def upload_writer_image(
    file: UploadFile = File(...),
    _user: dict[str, Any] = Depends(require_user),
):
    return await _save_uploaded_image(file, optimize=True)


@app.post("/api/me/upload-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    _user: dict[str, Any] = Depends(require_user),
):
    return await _save_uploaded_image(file)


@app.post("/api/support/upload-attachment")
async def upload_support_attachment(file: UploadFile = File(...)):
    extension = Path(file.filename or "upload").suffix.lower()
    if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=400, detail="Unsupported attachment format")

    filename = f"support-{uuid4().hex}{extension}"
    content = await file.read()
    # Store bytes in durable media storage; Vercel's local filesystem is ephemeral.
    path = _store_media_bytes(content, filename, "image/jpeg")
    return {"path": path, "filename": filename}


_BOOTSTRAP_CACHE: dict[str, Any] | None = None
_BOOTSTRAP_CACHE_AT: float = 0.0
_BOOTSTRAP_CACHE_TTL = 15.0

# Ultra-light caches (per warm Vercel instance) - cuts DB hits on hot paths
_VERSION_CACHE: dict[str, Any] | None = None
_VERSION_CACHE_AT: float = 0.0
_VERSION_CACHE_TTL = 2.0

_TAGS_CACHE: dict[str, Any] | None = None
_TAGS_CACHE_AT: float = 0.0
_TAGS_CACHE_TTL = 120.0



def _user_age_years(birth_date: str | None) -> int | None:
    """Return age in full years from YYYY-MM-DD, or None if unknown."""
    if not birth_date:
        return None
    try:
        raw = str(birth_date).strip()[:10]
        y, m, d = [int(x) for x in raw.split("-")]
        from datetime import date
        today = date.today()
        age = today.year - y - ((today.month, today.day) < (m, d))
        return max(0, age)
    except Exception:
        return None


def _audience_allows(audience: str | None, age: int | None) -> bool:
    """Filter books by content rating vs reader age.
    All Ages → everyone
    Teen (16+) → ages 16–18 inclusive
    Mature (18+) → ages 18+
    Unknown age → only All Ages (safe default)
    """
    a = (audience or "").strip().lower()
    if not a or "all" in a:
        return True
    if age is None:
        return False
    if "16" in a or "teen" in a:
        return 16 <= age <= 18
    if "18" in a or "mature" in a or "adult" in a:
        return age >= 18
    return True


@app.get("/api/bootstrap")
def bootstrap(user: dict[str, Any] | None = Depends(optional_user)):
    global _BOOTSTRAP_CACHE, _BOOTSTRAP_CACHE_AT
    import time as _time
    # Anonymous catalog can be cached; logged-in users get age/audience filtered view
    now = _time.time()
    if (
        user is None
        and _BOOTSTRAP_CACHE is not None
        and (now - _BOOTSTRAP_CACHE_AT) < _BOOTSTRAP_CACHE_TTL
    ):
        return _BOOTSTRAP_CACHE

    discover_tabs = [
        row["name"]
        for row in fetch_all(
            "SELECT name FROM categories WHERE tab_group = 'discover' ORDER BY sort_order"
        )
    ]

    explore_topics = fetch_all(
        "SELECT name, topic_count FROM categories WHERE tab_group = 'explore' ORDER BY sort_order"
    )

    books = fetch_all(
        """
        SELECT b.id, b.user_id, b.title, b.author, b.description, b.cover_path, b.accent_hex, b.section_name,
               b.status_text, b.rating, b.genre, b.cta_label,
               COALESCE(b.primary_genre, b.genre) AS primary_genre,
               COALESCE(b.secondary_genre, '') AS secondary_genre,
               COALESCE(b.is_completed, 0) AS is_completed,
               COALESCE(b.view_count, 0) AS view_count,
               COALESCE(b.audience, 'All Ages') AS audience,
               COALESCE(b.language, '') AS language,
               u.photo_url AS author_photo_url,
               COALESCE(u.country, '') AS author_country
        FROM books b
        LEFT JOIN app_users u ON u.id = b.user_id
                WHERE LOWER(TRIM(COALESCE(b.status_text, 'draft'))) NOT LIKE 'draft%'
                    AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%'
                    AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted')
        ORDER BY b.sort_order ASC, b.id DESC
        LIMIT 48
        """
    )

    # One query for all home like counts (avoid N+1)
    likes_map: dict[int, int] = {}
    try:
        _ensure_book_likes_table()
        like_rows = fetch_all(
            "SELECT book_id, COUNT(*) AS c FROM book_likes GROUP BY book_id"
        )
        for lr in like_rows or []:
            bid = lr.get("book_id") if isinstance(lr, dict) else None
            if bid is not None:
                likes_map[int(bid)] = int(lr.get("c") or 0)
    except Exception as exc:
        LOGGER.warning("batch likes_map failed: %s", exc)

    reader_age: int | None = None
    reader_country = ""
    if user and user.get("user_id"):
        try:
            urows = fetch_all(
                "SELECT birth_date, country FROM app_users WHERE id=%s LIMIT 1",
                (int(user["user_id"]),),
            )
            if urows:
                reader_age = _user_age_years(_row_get(urows[0], "birth_date"))
                reader_country = str(_row_get(urows[0], "country") or "").strip()
        except Exception as exc:
            LOGGER.warning("reader age/country: %s", exc)

    # Age-gate by story audience
    if user is not None:
        books = [
            b
            for b in (books or [])
            if _audience_allows(
                str(_row_get(b, "audience") or b.get("audience") if isinstance(b, dict) else ""),
                reader_age,
            )
        ]

    # Prefer same-country authors near top when known
    if reader_country:
        try:
            def _country_key(b: Any) -> int:
                ac = str(_row_get(b, "author_country") or "").strip().lower()
                return 0 if ac and ac == reader_country.lower() else 1
            books = sorted(books or [], key=_country_key)
        except Exception:
            pass

    def _card(book: Any) -> dict[str, Any]:
        """Full card payload for home rails (author id + live likes)."""
        bid = book["id"]
        live = int(likes_map.get(int(bid), 0))
        return {
            "id": bid,
            "user_id": book.get("user_id"),
            "author_user_id": book.get("user_id"),
            "author_photo_url": _normalize_cover_path(book.get("author_photo_url") or "") if book.get("author_photo_url") else "",
            "title": book["title"],
            "author": book["author"],
            "description": book.get("description") or "",
            "cover_path": _normalize_cover_path(book.get("cover_path")),
            "accent_hex": book.get("accent_hex") or "#A1A1A1",
            "section_name": book.get("section_name") or "",
            "status_text": book.get("status_text") or "",
            "rating": book.get("rating") or 0,
            "genre": book.get("genre") or "",
            "primary_genre": book.get("primary_genre") or book.get("genre") or "",
            "secondary_genre": book.get("secondary_genre") or "",
            "is_completed": book.get("is_completed") or 0,
            "cta_label": book.get("cta_label") or "Read now",
            "likes_count": live,
            "likes": live,
            "view_count": int(book.get("view_count") or 0),
            "views": int(book.get("view_count") or 0),
            "audience": book.get("audience") or "All Ages",
            "language": book.get("language") or "",
            "author_country": book.get("author_country") or "",
        }

    recently_updated = [
        _card(book)
        for book in books
        if book["section_name"] == "recently_updated"
    ]

    recently_completed = [
        _card(book)
        for book in books
        if book["section_name"] == "recently_completed"
    ]

    featured_book = {
        "id": 0,
        "title": "No featured story available",
        "author": "",
        "description": "",
        "status_text": "",
        "rating": 0,
        "genre": "",
        "cta": "Read now",
        "cover_path": "",
        "tags": [],
    }

    featured_candidates = [b for b in books if b["section_name"] == "featured"]
    if not featured_candidates:
        featured_candidates = books[:1]

    if featured_candidates:
        featured_raw = featured_candidates[0]
        featured_book = {
            "id": featured_raw["id"],
            "user_id": featured_raw.get("user_id"),
            "author_user_id": featured_raw.get("user_id"),
            "title": featured_raw["title"],
            "author": featured_raw["author"],
            "description": featured_raw["description"],
            "status_text": featured_raw["status_text"],
            "rating": featured_raw["rating"],
            "genre": featured_raw["genre"],
            "cta": featured_raw["cta_label"],
            "cover_path": _normalize_cover_path(featured_raw["cover_path"]),
            "tags": _story_tags_for_book(featured_raw["id"]),
            "likes_count": _live_book_likes_count(featured_raw["id"]),
        }

    # Library entries are user-specific and loaded via GET /api/library after auth.
    # Bootstrap stays public (read-only discover content) so unauthenticated users can browse.
    library_payload: list[dict[str, Any]] = []
    if user and user.get("user_id"):
        try:
            lib_rows = fetch_all(
                """
                SELECT le.id, le.book_id, le.reading_status, le.updated_text, le.chapters,
                       le.primary_genre, le.secondary_genre, le.sort_order,
                       COALESCE(le.last_chapter_number, 1) AS last_chapter_number,
                       COALESCE(le.last_paragraph_index, 0) AS last_paragraph_index,
                       COALESCE(le.chapters_read, 0) AS chapters_read,
                       le.reading_progress_percent,
                       b.title, b.author, b.cover_path, b.accent_hex, b.rating, b.genre,
                       b.status_text, b.description, b.section_name, b.cta_label,
                       COALESCE(b.primary_genre, b.genre) AS book_primary_genre,
                       COALESCE(b.secondary_genre, '') AS book_secondary_genre,
                       COALESCE(b.is_completed, 0) AS is_completed
                FROM library_entries le
                JOIN books b ON b.id = le.book_id
                WHERE le.user_id = %s
                ORDER BY le.sort_order ASC, le.id DESC
                LIMIT 20
                """,
                (int(user["user_id"]),),
            )
            for row in lib_rows or []:
                book_id = row.get("book_id") if isinstance(row, dict) else None
                library_payload.append({
                    "id": row.get("id"),
                    "book_id": book_id,
                    "reading_status": row.get("reading_status") or "Reading",
                    "updated_text": row.get("updated_text") or "",
                    "chapters": int(row.get("chapters") or 0),
                    "last_chapter_number": int(row.get("last_chapter_number") or 1),
                    "last_paragraph_index": int(row.get("last_paragraph_index") or 0),
                    "chapters_read": int(row.get("chapters_read") or 0),
                    "reading_progress_percent": row.get("reading_progress_percent"),
                    "primary_genre": row.get("primary_genre") or row.get("book_primary_genre") or "",
                    "secondary_genre": row.get("secondary_genre") or "",
                    "book": {
                        "id": book_id,
                        "title": row.get("title") or "",
                        "author": row.get("author") or "",
                        "cover_path": _normalize_cover_path(row.get("cover_path") or ""),
                        "accent_hex": row.get("accent_hex") or "#581845",
                        "rating": float(row.get("rating") or 0),
                        "genre": row.get("genre") or "",
                        "status_text": row.get("status_text") or "",
                        "description": (row.get("description") or "")[:240],
                        "section_name": row.get("section_name") or "featured",
                        "cta_label": row.get("cta_label") or "Continue",
                        "primary_genre": row.get("book_primary_genre") or row.get("genre") or "",
                        "secondary_genre": row.get("book_secondary_genre") or "",
                        "is_completed": bool(row.get("is_completed")),
                    },
                })
        except Exception as lib_exc:
            LOGGER.warning("bootstrap library_entries failed: %s", lib_exc)

    _ensure_default_write_screen()
    _ensure_default_profile()

    _ensure_default_write_screen()
    _ensure_default_profile()

    write_meta_rows = fetch_all(
        "SELECT manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta FROM write_screen LIMIT 1"
    )
    if not write_meta_rows:
        raise HTTPException(status_code=500, detail="Write metadata is missing")

    write_meta = write_meta_rows[0]
    write_screen = {
        "manage_tabs": write_meta["manage_tabs"].split(","),
        "story_tabs": write_meta["story_tabs"].split(","),
        "filter_label": write_meta["filter_label"],
        "sort_label": write_meta["sort_label"],
        "empty_title": write_meta["empty_title"],
        "empty_cta": write_meta["empty_cta"],
    }

    notifications = fetch_all(
        "SELECT tab_name AS tab, title, message, created_at FROM notifications ORDER BY sort_order"
    )

    menu_rows = fetch_all(
        "SELECT section_name, label, icon_name, route_name FROM menu_items ORDER BY section_order, sort_order"
    )
    menu_map = defaultdict(list)
    for row in menu_rows:
        menu_map[row["section_name"]].append(
            {
                "label": row["label"],
                "icon": row["icon_name"],
                "route": row["route_name"],
            }
        )

    menu_sections = [
        {"section": section, "items": items}
        for section, items in menu_map.items()
    ]

    # Neutral profile shell — real stats come from /api/me and /api/users/{id}
    profile_rows = fetch_all(
        "SELECT display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak FROM profiles LIMIT 1"
    )
    if profile_rows:
        profile = profile_rows[0]
    else:
        profile = {
            "display_name": "Reader",
            "username": "@reader",
            "following": 0,
            "followers": 0,
            "blocked": 0,
            "chapters_read": 0,
            "social_karma": 0,
            "day_streak": 0,
        }
    # Do NOT inject global reading_lists into every profile (causes fake data).
    # Client loads per-user lists via /api/reading-lists and /api/users/{id}/reading-lists.
    profile_payload = {
        **profile,
        "following": 0,
        "followers": 0,
        "blocked": 0,
        "chapters_read": 0,
        "social_karma": 0,
        "day_streak": 0,
        "reading_lists": [],
    }

    achievement_rows = fetch_all(
        """
        SELECT group_name, title, subtitle, progress_label, badge_value, style
        FROM achievements
        ORDER BY group_order, sort_order
        """
    )
    achievement_map = defaultdict(list)
    for row in achievement_rows:
        achievement_map[row["group_name"]].append(
            {
                "title": row["title"],
                "subtitle": row["subtitle"],
                "progress_label": row["progress_label"],
                "badge_value": row["badge_value"],
                "style": row["style"],
            }
        )

    achievements = [
        {"group_name": group_name, "items": items}
        for group_name, items in achievement_map.items()
    ]

    payload = {
        "discover_tabs": discover_tabs,
        "recently_updated": recently_updated,
        "recently_completed": recently_completed,
        "discover_books": [_card(book) for book in books if str(book.get("title") or "").strip()],
        "featured_book": featured_book,
        "explore_topics": explore_topics,
        "library_entries": library_payload,
        "write_screen": write_screen,
        "notifications": notifications,
        "menu_sections": menu_sections,
        "profile": profile_payload,
        "achievements": achievements,
    }
    if user is None:
        _BOOTSTRAP_CACHE = payload
        _BOOTSTRAP_CACHE_AT = _time.time()
    return payload


_PUBLIC_LANDING_STATS: dict[str, int] | None = None
_PUBLIC_LANDING_STATS_AT = 0.0
_PUBLIC_HOME_REVIEWS: list[dict[str, Any]] | None = None
_PUBLIC_HOME_REVIEWS_AT = 0.0


@app.get("/api/public/reviews")
def public_home_reviews(limit: int = Query(default=8, ge=1, le=16)):
    """Small cached review cards for the public home feed."""
    global _PUBLIC_HOME_REVIEWS, _PUBLIC_HOME_REVIEWS_AT
    import time as _time

    now = _time.time()
    if _PUBLIC_HOME_REVIEWS is not None and now - _PUBLIC_HOME_REVIEWS_AT < 60:
        return {"items": _PUBLIC_HOME_REVIEWS[:limit]}

    rows = fetch_all(
        """
        SELECT r.id, r.book_id, r.user_id, r.rating, r.comment, r.title,
               r.created_at, u.display_name, u.photo_url,
               b.title AS book_title, b.author AS book_author,
               b.cover_path, b.accent_hex
        FROM book_reviews r
        JOIN app_users u ON u.id = r.user_id
        JOIN books b ON b.id = r.book_id
        WHERE TRIM(COALESCE(r.comment, '')) <> ''
          AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'draft%'
          AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%'
          AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted')
        ORDER BY r.rating DESC, r.created_at DESC
        LIMIT 16
        """
    )
    _PUBLIC_HOME_REVIEWS = [
        {
            "id": _row_get(row, "id"),
            "book_id": _row_get(row, "book_id"),
            "user_id": _row_get(row, "user_id"),
            "rating": float(_row_get(row, "rating") or 0),
            "comment": _row_get(row, "comment") or "",
            "title": _row_get(row, "title") or "",
            "created_at": _row_get(row, "created_at"),
            "display_name": _row_get(row, "display_name") or "Reader",
            "photo_url": _row_get(row, "photo_url") or "",
            "book_title": _row_get(row, "book_title") or "Story",
            "book_author": _row_get(row, "book_author") or "",
            "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            "accent_hex": _row_get(row, "accent_hex") or "#1B3026",
        }
        for row in rows or []
    ]
    _PUBLIC_HOME_REVIEWS_AT = now
    return {"items": _PUBLIC_HOME_REVIEWS[:limit]}


@app.get("/api/public/stats")
def public_landing_stats():
    """Cached aggregate counts for the unauthenticated landing page."""
    global _PUBLIC_LANDING_STATS, _PUBLIC_LANDING_STATS_AT
    import time as _time

    now = _time.time()
    if _PUBLIC_LANDING_STATS is not None and now - _PUBLIC_LANDING_STATS_AT < 60:
        return _PUBLIC_LANDING_STATS

    _ensure_chapter_comments_table()
    row = fetch_all(
        """
        SELECT
          (SELECT COUNT(*) FROM books b
           WHERE LOWER(TRIM(COALESCE(b.status_text, 'draft'))) NOT LIKE 'draft%'
             AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%'
             AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted')) AS stories,
          (SELECT COUNT(DISTINCT b.user_id) FROM books b
           WHERE b.user_id IS NOT NULL
             AND LOWER(TRIM(COALESCE(b.status_text, 'draft'))) NOT LIKE 'draft%'
             AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%'
             AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted')) AS writers,
          (SELECT COUNT(*) FROM chapter_comments) AS comments
        """
    )
    counts = row[0] if row else {}
    _PUBLIC_LANDING_STATS = {
        "stories": int(counts.get("stories") or 0),
        "writers": int(counts.get("writers") or 0),
        "comments": int(counts.get("comments") or 0),
    }
    _PUBLIC_LANDING_STATS_AT = now
    return _PUBLIC_LANDING_STATS


_SEARCH_HISTORY_TABLE_READY = False


def _ensure_search_history_table() -> None:
    global _SEARCH_HISTORY_TABLE_READY
    if _SEARCH_HISTORY_TABLE_READY:
        return
    if _live_use_sqlite():
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS user_search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                scope VARCHAR(16) NOT NULL,
                term VARCHAR(120) NOT NULL,
                display_term VARCHAR(120) NOT NULL,
                searched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, scope, term)
            )
            """,
            (),
        )
        execute_write(
            "CREATE INDEX IF NOT EXISTS idx_search_history_user_time ON user_search_history(user_id, searched_at)",
            (),
        )
    else:
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS user_search_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                user_id BIGINT NOT NULL,
                scope VARCHAR(16) NOT NULL,
                term VARCHAR(120) NOT NULL,
                display_term VARCHAR(120) NOT NULL,
                searched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_user_search_history (user_id, scope, term),
                INDEX idx_search_history_user_time (user_id, searched_at)
            )
            """,
            (),
        )
    _SEARCH_HISTORY_TABLE_READY = True


@app.get("/api/me/search-history")
def get_search_history(
    scope: str = Query(default="", max_length=16),
    user: dict[str, Any] = Depends(require_user),
):
    _ensure_search_history_table()
    if scope and scope not in {"title", "tag", "profile"}:
        raise HTTPException(status_code=400, detail="Invalid search scope")
    query = """
        SELECT scope, term, display_term, searched_at
        FROM user_search_history
        WHERE user_id=%s
    """
    params: tuple[Any, ...] = (int(user["user_id"]),)
    if scope:
        query += " AND scope=%s"
        params += (scope,)
    query += " ORDER BY searched_at DESC, id DESC LIMIT 100"
    rows = fetch_all(query, params)
    items: list[Any] = []
    scope_counts: dict[str, int] = {}
    for row in rows:
        row_scope = str(_row_get(row, "scope") or "")
        if scope_counts.get(row_scope, 0) >= 5:
            continue
        scope_counts[row_scope] = scope_counts.get(row_scope, 0) + 1
        items.append(row)
        if len(items) >= 15:
            break
    return {"items": items}


@app.post("/api/me/search-history")
def save_search_history(
    payload: SearchHistoryRequest,
    user: dict[str, Any] = Depends(require_user),
):
    _ensure_search_history_table()
    scope = payload.scope.strip().lower()
    display_term = payload.term.strip()
    if scope not in {"title", "tag", "profile"}:
        raise HTTPException(status_code=400, detail="Invalid search scope")
    if not display_term or len(display_term) > 120:
        raise HTTPException(status_code=400, detail="Search term must contain 1 to 120 characters")
    params = (int(user["user_id"]), scope, display_term.casefold(), display_term)
    if _live_use_sqlite():
        execute_write(
            """
            INSERT INTO user_search_history (user_id, scope, term, display_term, searched_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, scope, term) DO UPDATE SET
                display_term=excluded.display_term,
                searched_at=CURRENT_TIMESTAMP
            """,
            params,
        )
    else:
        execute_write(
            """
            INSERT INTO user_search_history (user_id, scope, term, display_term, searched_at)
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                display_term=VALUES(display_term),
                searched_at=CURRENT_TIMESTAMP
            """,
            params,
        )
    recent_ids = fetch_all(
        "SELECT id FROM user_search_history WHERE user_id=%s AND scope=%s ORDER BY searched_at DESC, id DESC LIMIT 5",
        (int(user["user_id"]), scope),
    )
    keep_ids = [int(_row_get(row, "id")) for row in recent_ids if _row_get(row, "id") is not None]
    if keep_ids:
        placeholders = ", ".join(["%s"] * len(keep_ids))
        execute_write(
            f"DELETE FROM user_search_history WHERE user_id=%s AND scope=%s AND id NOT IN ({placeholders})",
            (int(user["user_id"]), scope, *keep_ids),
        )
    return {"ok": True}


@app.get("/api/recommendations")
def get_recommendations(
    request: Request,
    limit: int = Query(default=24, ge=1, le=48),
    book_id: int | None = Query(default=None, ge=1),
    user: dict[str, Any] | None = Depends(optional_user),
):
    """Rank published stories using reader interests and optional story similarity."""
    country = ""
    age = None
    history_terms: list[str] = []
    genre_interest: dict[str, float] = {}
    source_book = None
    source_tags: set[str] = set()
    if book_id is not None:
        try:
            source_rows = fetch_all(
                """
                SELECT id, user_id, title, description, genre,
                       COALESCE(primary_genre, genre) AS primary_genre,
                       COALESCE(secondary_genre, '') AS secondary_genre,
                       COALESCE(language, '') AS language
                FROM books
                WHERE id=%s
                LIMIT 1
                """,
                (book_id,),
            )
        except Exception as exc:
            LOGGER.exception("recommendation source story could not load: %s", exc)
            raise HTTPException(status_code=503, detail="Recommendations are temporarily unavailable") from exc
        if not source_rows:
            raise HTTPException(status_code=404, detail="Story not found")
        source_book = source_rows[0]
        try:
            source_tags = {
                str(tag).strip().casefold()
                for tag in _story_tags_for_book(book_id)
                if str(tag).strip()
            }
        except Exception as exc:
            LOGGER.warning("recommendation source tags unavailable: %s", exc)

    source_genres = set()
    source_terms = set()
    source_language = ""
    if source_book:
        source_genres = {
            str(_row_get(source_book, key) or "").strip().casefold()
            for key in ("primary_genre", "secondary_genre", "genre")
        } - {""}
        stop_words = {
            "about", "after", "again", "also", "and", "are", "because", "been",
            "before", "being", "between", "both", "could", "from", "have", "into",
            "just", "more", "most", "other", "over", "same", "than", "that", "their",
            "them", "then", "there", "these", "they", "this", "through", "under",
            "very", "what", "when", "where", "which", "while", "with", "would", "your",
        }
        source_text = " ".join(
            str(_row_get(source_book, key) or "")
            for key in ("title", "description")
        ).casefold()
        source_terms = {
            term for term in re.findall(r"[a-z0-9]{3,}", source_text)
            if term not in stop_words
        }
        source_language = str(_row_get(source_book, "language") or "").casefold().strip()

    if user:
        uid = int(user["user_id"])
        profile_rows = fetch_all(
            "SELECT country, birth_date FROM app_users WHERE id=%s LIMIT 1", (uid,)
        )
        if profile_rows:
            country = str(_row_get(profile_rows[0], "country") or "").strip()
            age = _user_age_years(str(_row_get(profile_rows[0], "birth_date") or ""))
        try:
            _ensure_search_history_table()
            recent_searches = fetch_all(
                "SELECT term FROM user_search_history WHERE user_id=%s ORDER BY searched_at DESC LIMIT 15",
                (uid,),
            )
            history_terms = [
                str(_row_get(row, "term") or "").casefold() for row in recent_searches
            ]
        except Exception as exc:
            LOGGER.warning("recommendation search history unavailable: %s", exc)
        try:
            tastes = fetch_all(
                """
                SELECT genre, SUM(weight) AS weight
                FROM (
                    SELECT COALESCE(NULLIF(b.primary_genre,''), b.genre, '') AS genre,
                           CASE
                               WHEN COALESCE(le.reading_progress_percent, 0) >= 80 THEN 4.0
                               WHEN COALESCE(le.reading_progress_percent, 0) >= 30 THEN 2.5
                               WHEN COALESCE(le.chapters_read, 0) > 0 THEN 2.0
                               ELSE 1.0
                           END AS weight
                    FROM library_entries le
                    JOIN books b ON b.id=le.book_id
                    WHERE le.user_id=%s
                    ORDER BY le.updated_at DESC
                    LIMIT 60
                ) AS reading_tastes
                WHERE genre <> ''
                GROUP BY genre
                UNION ALL
                SELECT genre, SUM(weight) AS weight
                FROM (
                    SELECT COALESCE(NULLIF(b.primary_genre,''), b.genre, '') AS genre,
                           2.0 AS weight
                    FROM book_likes bl
                    JOIN books b ON b.id=bl.book_id
                    WHERE bl.user_id=%s
                    ORDER BY bl.created_at DESC
                    LIMIT 60
                ) AS liked_tastes
                WHERE genre <> ''
                GROUP BY genre
                UNION ALL
                SELECT genre, SUM(weight) AS weight
                FROM (
                    SELECT COALESCE(NULLIF(b.primary_genre,''), b.genre, '') AS genre,
                           3.0 AS weight
                    FROM book_reviews br
                    JOIN books b ON b.id=br.book_id
                    WHERE br.user_id=%s AND br.rating >= 4
                    ORDER BY br.created_at DESC
                    LIMIT 60
                ) AS reviewed_tastes
                WHERE genre <> ''
                GROUP BY genre
                """,
                (uid, uid, uid),
            )
            for row in tastes:
                genre = str(_row_get(row, "genre") or "").strip().casefold()
                if genre:
                    genre_interest[genre] = genre_interest.get(genre, 0.0) + float(
                        _row_get(row, "weight") or 0
                    )
        except Exception as exc:
            LOGGER.warning("recommendation reading interests unavailable: %s", exc)

    if not country:
        country = (
            request.headers.get("cf-ipcountry")
            or request.headers.get("x-vercel-ip-country")
            or ""
        ).strip()
    country = {
        "LK": "Sri Lanka", "IN": "India", "US": "United States",
        "GB": "United Kingdom", "CA": "Canada", "AU": "Australia",
        "NZ": "New Zealand", "PK": "Pakistan", "BD": "Bangladesh",
        "SG": "Singapore", "MY": "Malaysia", "PH": "Philippines",
    }.get(country.upper(), country)
    country_key = country.casefold()
    preferred_languages = {
        "sri lanka": ("sinhala", "tamil"),
        "india": ("hindi", "tamil", "bengali", "malayalam", "telugu"),
        "bangladesh": ("bengali",),
        "pakistan": ("urdu",),
        "united states": ("english",),
        "united kingdom": ("english",),
        "canada": ("english", "french"),
        "australia": ("english",),
        "new zealand": ("english",),
    }.get(country_key, ())

    candidate_query = """
            SELECT b.id, b.user_id, b.title, b.author, b.description, b.cover_path,
                   b.accent_hex, b.section_name, b.status_text, b.rating, b.genre,
                   COALESCE(b.primary_genre, b.genre) AS primary_genre,
                   COALESCE(b.secondary_genre, '') AS secondary_genre,
                   COALESCE(b.is_completed, 0) AS is_completed,
                   COALESCE(b.view_count, 0) AS view_count,
                   COALESCE(b.audience, 'All Ages') AS audience,
                   COALESCE(b.language, '') AS language,
                   COALESCE(u.country, '') AS author_country,
                   COALESCE(l.likes, 0) AS likes_count
            FROM books b
            LEFT JOIN app_users u ON u.id=b.user_id
            LEFT JOIN (
                SELECT book_id, COUNT(*) AS likes FROM book_likes GROUP BY book_id
            ) l ON l.book_id=b.id
            WHERE LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'draft%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted')
    """
    candidate_params: tuple[Any, ...] = ()
    if book_id is not None:
        candidate_query += "\n              AND b.id <> %s"
        candidate_params = (book_id,)
    candidate_query += "\n            ORDER BY b.id DESC\n            LIMIT 160"

    try:
        candidates = fetch_all(
            candidate_query,
            candidate_params,
        )
    except Exception as exc:
        LOGGER.exception("recommendation candidates could not load: %s", exc)
        raise HTTPException(status_code=503, detail="Recommendations are temporarily unavailable") from exc

    candidate_tags: dict[int, set[str]] = defaultdict(set)
    candidate_ids = [
        int(_row_get(book, "id") or 0)
        for book in candidates
        if int(_row_get(book, "id") or 0) > 0
    ]
    if source_tags and candidate_ids:
        placeholders = ",".join(["%s"] * len(candidate_ids))
        try:
            tag_rows = fetch_all(
                f"""
                SELECT bt.book_id, t.name
                FROM book_tags bt
                JOIN tags t ON t.id=bt.tag_id
                WHERE bt.book_id IN ({placeholders})
                """,
                tuple(candidate_ids),
            )
            for row in tag_rows:
                candidate_tags[int(_row_get(row, "book_id") or 0)].add(
                    str(_row_get(row, "name") or "").strip().casefold()
                )
        except Exception as exc:
            LOGGER.warning("recommendation candidate tags unavailable: %s", exc)

    ranked: list[tuple[float, Any]] = []
    for book in candidates:
        audience = str(_row_get(book, "audience") or "All Ages")
        if not _audience_allows(audience, age):
            continue
        title = str(_row_get(book, "title") or "")
        genre = str(_row_get(book, "primary_genre") or _row_get(book, "genre") or "")
        author_country = str(_row_get(book, "author_country") or "").strip()
        author_country = {
            "LK": "Sri Lanka", "IN": "India", "US": "United States",
            "GB": "United Kingdom", "CA": "Canada", "AU": "Australia",
            "NZ": "New Zealand", "PK": "Pakistan", "BD": "Bangladesh",
            "SG": "Singapore", "MY": "Malaysia", "PH": "Philippines",
        }.get(author_country.upper(), author_country).casefold()
        language = str(_row_get(book, "language") or "").casefold()
        score = (
            2 * math.log1p(max(0, int(_row_get(book, "view_count") or 0)))
            + 3 * math.log1p(max(0, int(_row_get(book, "likes_count") or 0)))
            + float(_row_get(book, "rating") or 0)
        )
        if source_book:
            score *= 0.2
        candidate_genres = {
            str(_row_get(book, key) or "").strip().casefold()
            for key in ("primary_genre", "secondary_genre", "genre")
        } - {""}
        if source_genres.intersection(candidate_genres):
            score += 45
        if source_language and source_language == language:
            score += 12
        shared_tags = source_tags.intersection(
            candidate_tags.get(int(_row_get(book, "id") or 0), set())
        )
        score += min(40, 28 * len(shared_tags))
        if source_terms:
            candidate_text = " ".join(
                (
                    title,
                    str(_row_get(book, "description") or ""),
                )
            ).casefold()
            candidate_terms = set(re.findall(r"[a-z0-9]{3,}", candidate_text))
            overlap = len(source_terms.intersection(candidate_terms))
            score += min(20, overlap * 2)
        if source_book and _row_get(source_book, "user_id") == _row_get(book, "user_id"):
            score += 1
        if country_key and author_country == country_key:
            score += 3 if source_book else 18
        if any(preferred in language for preferred in preferred_languages):
            score += 3 if source_book else 8
        score += min(
            6 if source_book else 8,
            (1.5 if source_book else 2) * genre_interest.get(genre.casefold(), 0),
        )
        searchable = f"{title} {genre} {_row_get(book, 'description') or ''}".casefold()
        history_weight = 1 if source_book else 2
        score += min(
            4 if source_book else 6,
            sum(history_weight for term in history_terms if term and term in searchable),
        )
        score += (int(_row_get(book, "id") or 0) % 1000) / 100000
        ranked.append((score, book))

    ranked.sort(key=lambda pair: pair[0], reverse=True)
    items: list[dict[str, Any]] = []
    author_counts: dict[str, int] = {}
    source_author_id = str(_row_get(source_book, "user_id") or "") if source_book else ""
    for _, book in ranked:
        genre = str(_row_get(book, "primary_genre") or _row_get(book, "genre") or "")
        author_id = str(_row_get(book, "user_id") or "")
        author_limit = 2 if source_author_id and author_id == source_author_id else 3
        if author_counts.get(author_id, 0) >= author_limit:
            continue
        author_counts[author_id] = author_counts.get(author_id, 0) + 1
        items.append({
            "id": _row_get(book, "id"),
            "user_id": _row_get(book, "user_id"),
            "author_user_id": _row_get(book, "user_id"),
            "title": _row_get(book, "title") or "",
            "author": _row_get(book, "author") or "",
            "description": str(_row_get(book, "description") or "")[:240],
            "cover_path": _normalize_cover_path(_row_get(book, "cover_path") or ""),
            "accent_hex": _row_get(book, "accent_hex") or "#6C63FF",
            "section_name": _row_get(book, "section_name") or "featured",
            "status_text": _row_get(book, "status_text") or "",
            "rating": float(_row_get(book, "rating") or 0),
            "genre": _row_get(book, "genre") or "",
            "primary_genre": _row_get(book, "primary_genre") or genre,
            "secondary_genre": _row_get(book, "secondary_genre") or "",
            "is_completed": bool(int(_row_get(book, "is_completed") or 0)),
            "cta_label": "Read",
            "likes_count": int(_row_get(book, "likes_count") or 0),
            "view_count": int(_row_get(book, "view_count") or 0),
            "audience": audience,
            "language": _row_get(book, "language") or "",
            "author_country": _row_get(book, "author_country") or "",
        })
        if len(items) >= limit:
            break
    return {"items": items, "country": country}


@app.get("/api/search")
def search_stories(
    query: str = Query(default=""),
    genre: str = Query(default=""),
    min_rating: float = Query(default=0.0),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Search public stories, preferring the query language when available."""
    q_raw = (query or "").strip()
    g = (genre or "").strip()
    language = "si" if any("\u0D80" <= char <= "\u0DFF" for char in q_raw) else "en"
    language_sql = """CASE
        WHEN LOWER(TRIM(COALESCE(language, ''))) IN ('si', 'sinhala', 'sinhalese') THEN 'si'
        WHEN LOWER(TRIM(COALESCE(language, ''))) IN ('', 'en', 'english', 'en-us') THEN 'en'
        ELSE LOWER(TRIM(language))
    END"""
    public_status = """(
        LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'draft%'
        AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'unpublish%'
        AND LOWER(TRIM(COALESCE(status_text, ''))) NOT IN ('private', 'unlisted', 'hidden')
    )"""
    has_published_chapter = """EXISTS (
        SELECT 1 FROM chapters c
        WHERE c.story_id=books.id
          AND LOWER(TRIM(COALESCE(c.submission_status, 'draft')))
              IN ('published', 'submitted', 'ongoing', 'completed')
    )"""
    publicly_available = f"({public_status} OR ({has_published_chapter} AND LOWER(TRIM(COALESCE(status_text, ''))) NOT IN ('private', 'unlisted', 'hidden')))"

    def _card(r: dict) -> dict:
        return {
            "id": r.get("id"),
            "title": r.get("title") or "",
            "author": r.get("author") or "",
            "description": (r.get("description") or "")[:240],
            "cover_path": _normalize_cover_path(r.get("cover_path") or ""),
            "accent_hex": r.get("accent_hex") or "#16785F",
            "status_text": r.get("status_text") or "",
            "rating": float(r.get("rating") or 0),
            "genre": r.get("genre") or "",
            "primary_genre": r.get("primary_genre") or r.get("genre") or "",
            "secondary_genre": r.get("secondary_genre") or "",
            "is_completed": bool(int(r.get("is_completed") or 0)),
            "section_name": r.get("section_name") or "featured",
            "cta_label": r.get("cta_label") or "Read",
            "author_user_id": r.get("user_id"),
            "user_id": r.get("user_id"),
            "language": r.get("language") or "en",
        }

    def _find_books(filter_language: bool) -> list[dict[str, Any]]:
        conditions = [publicly_available, "COALESCE(rating, 0)>=%s"]
        params: list[Any] = [min_rating]
        if filter_language:
            conditions.append(f"{language_sql}=%s")
            params.append(language)
        if q_raw:
            like = f"%{q_raw.lower()}%"
            conditions.append("""(
                LOWER(COALESCE(title, '')) LIKE %s
                OR LOWER(COALESCE(author, '')) LIKE %s
                OR LOWER(COALESCE(description, '')) LIKE %s
                OR LOWER(COALESCE(genre, '')) LIKE %s
                OR LOWER(COALESCE(primary_genre, '')) LIKE %s
                OR LOWER(COALESCE(secondary_genre, '')) LIKE %s
            )""")
            params.extend([like] * 6)
        if g:
            genre_like = f"%{g.lower()}%"
            conditions.append("""(
                LOWER(COALESCE(genre, '')) LIKE %s
                OR LOWER(COALESCE(primary_genre, '')) LIKE %s
                OR LOWER(COALESCE(secondary_genre, '')) LIKE %s
            )""")
            params.extend([genre_like] * 3)
        order_by = "COALESCE(rating, 0) DESC, id DESC"
        if q_raw:
            # A short title query can match an unrelated English story's
            # description while the requested book is tagged as Sinhala (or
            # vice versa). Search across language labels, and rank title hits
            # before language preference so those unrelated matches cannot
            # hide the book the reader actually typed.
            order_by = """CASE
                    WHEN LOWER(COALESCE(title, ''))=%s THEN 0
                    WHEN LOWER(COALESCE(title, '')) LIKE %s THEN 1
                    ELSE 2
                END,
                CASE WHEN """ + language_sql + """=%s THEN 0 ELSE 1 END,
                COALESCE(rating, 0) DESC, id DESC"""
            params.extend([q_raw.lower(), f"%{q_raw.lower()}%", language])
        params.append(limit)
        return fetch_all(
            f"""
            SELECT id, user_id, title, author, description, cover_path, accent_hex,
                   status_text, rating, genre, COALESCE(language, '') AS language,
                   COALESCE(primary_genre, genre) AS primary_genre,
                   COALESCE(secondary_genre, '') AS secondary_genre,
                   COALESCE(is_completed, 0) AS is_completed,
                   section_name, cta_label
            FROM books
            WHERE {' AND '.join(conditions)}
            ORDER BY {order_by}
            LIMIT %s
            """,
            tuple(params),
        ) or []

    # Empty searches use the default English catalog. A search is allowed to
    # match any language label because book metadata can be stale (for example,
    # an English title marked Sinhala); title relevance is ranked first above.
    rows = _find_books(filter_language=not bool(q_raw))
    return {"items": [_card(r) for r in rows]}



@app.get("/api/me/activity")
def get_my_activity(user: dict[str, Any] = Depends(require_user)):
    """Actions performed BY the current user — read only from DB tables."""
    uid = int(user["user_id"])
    items: list[dict[str, Any]] = []
    try:
        _ensure_book_likes_table()
    except Exception:
        pass
    try:
        _ensure_author_follows_table()
    except Exception:
        pass
    try:
        _ensure_library_entries_table()
    except Exception:
        pass
    try:
        execute_write(
            "CREATE TABLE IF NOT EXISTS book_shares (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, book_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
            (),
        ) if _live_use_sqlite() else execute_write(
            "CREATE TABLE IF NOT EXISTS book_shares (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, book_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
            (),
        )
    except Exception:
        pass

    def push(typ: str, act_id: Any, title: str, message: str, book_id: Any = None, cover: Any = "", created_at: Any = None) -> None:
        items.append({
            "id": f"{typ}-{act_id}",
            "type": typ,
            "title": title,
            "message": message or typ.title(),
            "created_at": _serialize_db_datetime(created_at) if created_at is not None else str(act_id or ""),
            "book_id": book_id,
            "cover_path": _normalize_cover_path(cover or ""),
        })

    # Likes
    try:
        rows = fetch_all(
            """
            SELECT bl.id AS act_id, bl.book_id, b.title, b.cover_path,
                   bl.created_at AS created_at
            FROM book_likes bl
            LEFT JOIN books b ON b.id = bl.book_id
            WHERE bl.user_id=%s
            ORDER BY bl.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            push("like", _row_get(r, "act_id"), f"You liked {_row_get(r,'title') or 'a story'}", "Like",
                 _row_get(r, "book_id"), _row_get(r, "cover_path") or "",
                 created_at=_row_get(r, "created_at"))
    except Exception as exc:
        LOGGER.warning("my activity likes: %s", exc)

    # Shares
    try:
        rows = fetch_all(
            """
            SELECT s.id AS act_id, s.book_id, s.created_at, b.title, b.cover_path
            FROM book_shares s LEFT JOIN books b ON b.id=s.book_id
            WHERE s.user_id=%s ORDER BY s.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            push("share", _row_get(r, "act_id"), f"You shared {_row_get(r, 'title') or 'a story'}",
                 "Share", _row_get(r, "book_id"), _row_get(r, "cover_path") or "",
                 created_at=_row_get(r, "created_at"))
    except Exception as exc:
        LOGGER.warning("my activity shares: %s", exc)

    # Reviews
    try:
        rows = fetch_all(
            """
            SELECT r.id AS act_id, r.book_id, r.rating, r.comment, b.title, b.cover_path
            FROM book_reviews r
            LEFT JOIN books b ON b.id = r.book_id
            WHERE r.user_id=%s
            ORDER BY r.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            body = (str(_row_get(r, "comment") or ""))[:120]
            push("review", _row_get(r, "act_id"), f"You reviewed {_row_get(r,'title') or 'a story'}",
                 body or f"Rating {_row_get(r,'rating')}",
                 _row_get(r, "book_id"), _row_get(r, "cover_path") or "")
    except Exception as exc:
        LOGGER.warning("my activity reviews: %s", exc)

    # Follows
    try:
        rows = fetch_all(
            """
            SELECT f.id AS act_id, f.author_id,
                   COALESCE(u.display_name, u.email, 'someone') AS name
            FROM author_follows f
            LEFT JOIN app_users u ON u.id = f.author_id
            WHERE f.user_id=%s
            ORDER BY f.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            items.append({
                "id": f"follow-{_row_get(r,'act_id')}",
                "type": "follow",
                "title": f"You followed {_row_get(r,'name') or 'someone'}",
                "message": "Follow",
                "created_at": str(_row_get(r, "act_id") or ""),
                "actor_user_id": _row_get(r, "author_id"),
                "book_id": None,
                "cover_path": "",
            })
    except Exception as exc:
        LOGGER.warning("my activity follows: %s", exc)

    # Comments
    try:
        rows = fetch_all(
            """
            SELECT cc.id AS act_id, cc.body, c.story_id AS book_id, b.title, b.cover_path
            FROM chapter_comments cc
            LEFT JOIN chapters c ON c.id = cc.chapter_id
            LEFT JOIN books b ON b.id = c.story_id
            WHERE cc.user_id=%s
            ORDER BY cc.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            body = (str(_row_get(r, "body") or ""))[:120]
            push("comment", _row_get(r, "act_id"), f"You commented on {_row_get(r,'title') or 'a story'}",
                 body or "Comment", _row_get(r, "book_id"), _row_get(r, "cover_path") or "")
    except Exception as exc:
        LOGGER.warning("my activity comments: %s", exc)

    # Library
    try:
        rows = fetch_all(
            """
            SELECT le.id AS act_id, le.book_id, b.title, b.cover_path
            FROM library_entries le
            LEFT JOIN books b ON b.id = le.book_id
            WHERE le.user_id=%s
            ORDER BY le.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            push("save", _row_get(r, "act_id"), f"You saved {_row_get(r,'title') or 'a story'}",
                 "Library", _row_get(r, "book_id"), _row_get(r, "cover_path") or "")
    except Exception as exc:
        LOGGER.warning("my activity library: %s", exc)

    # Reading list items
    try:
        rows = fetch_all(
            """
            SELECT rli.id AS act_id, rli.book_id, b.title, b.cover_path, rl.name AS list_name
            FROM reading_list_items rli
            INNER JOIN reading_lists rl ON rl.id = rli.reading_list_id
            LEFT JOIN books b ON b.id = rli.book_id
            WHERE rl.user_id=%s
            ORDER BY rli.id DESC LIMIT 40
            """,
            (uid,),
        ) or []
        for r in rows:
            push("save", _row_get(r, "act_id"), f"You saved {_row_get(r,'title') or 'a story'}",
                 f"List: {_row_get(r,'list_name') or 'Reading list'}",
                 _row_get(r, "book_id"), _row_get(r, "cover_path") or "")
    except Exception as exc:
        LOGGER.warning("my activity lists: %s", exc)

    LOGGER.info("my activity user=%s items=%s", uid, len(items))
    return {"items": items[:100]}


@app.post("/api/books/{book_id}/share")
def record_book_share(book_id: int, user: dict[str, Any] = Depends(require_user)):
    if not fetch_all("SELECT id FROM books WHERE id=%s LIMIT 1", (book_id,)):
        raise HTTPException(status_code=404, detail="Story not found")
    try:
        execute_write(
            "INSERT INTO book_shares (user_id, book_id) VALUES (%s, %s)",
            (int(user["user_id"]), book_id),
        )
    except Exception as exc:
        LOGGER.warning("record share failed: %s", exc)
    return {"ok": True}


@app.get("/api/notifications/admin")
def get_admin_notifications(user: dict[str, Any] = Depends(require_user)):
    """System / admin announcements for the in-app Admin notifications tab."""
    items: list[dict[str, Any]] = []
    try:
        rows = fetch_all(
            """
            SELECT id, tab_name AS tab, title, message, created_at
            FROM notifications
            ORDER BY id DESC
            LIMIT 50
            """
        )
        for r in rows or []:
            items.append({
                "id": f"admin-{_row_get(r, 'id')}-{_row_get(r, 'created_at')}",
                "tab": _row_get(r, "tab") or "Admin",
                "type": "admin",
                "title": _row_get(r, "title") or "Announcement",
                "message": _row_get(r, "message") or "",
                "created_at": _serialize_db_datetime(_row_get(r, "created_at")),
            })
    except Exception as exc:
        LOGGER.warning("admin notifications: %s", exc)
        try:
            rows = fetch_all(
                """
                SELECT id, tab_name AS tab, title, message, created_at
                FROM notifications
                ORDER BY sort_order, id DESC
                LIMIT 50
                """
            )
            for r in rows or []:
                items.append({
                    "id": f"admin-{_row_get(r, 'id')}-{_row_get(r, 'created_at')}",
                    "tab": _row_get(r, "tab") or "Admin",
                    "type": "admin",
                    "title": _row_get(r, "title") or "Announcement",
                    "message": _row_get(r, "message") or "",
                    "created_at": str(_row_get(r, "created_at") or ""),
                })
        except Exception as exc2:
            LOGGER.warning("admin notifications fallback: %s", exc2)
            raise HTTPException(
                status_code=500,
                detail="Announcements could not be loaded",
            ) from exc2
    return {"items": items}


_PUSH_TOKENS_TABLE_READY = False


def _notification_preference_enabled(user_id: int, preference: str) -> bool:
    """Honor the user's master notification switch and requested category."""
    try:
        _ensure_user_preferences_table()
        rows = fetch_all(
            "SELECT prefs_json FROM user_preferences WHERE user_id=%s LIMIT 1",
            (user_id,),
        )
        if not rows:
            return True
        raw = _row_get(rows[0], "prefs_json") or "{}"
        preferences = json.loads(raw) if isinstance(raw, str) else raw
        notifications = (
            preferences.get("notifications", {})
            if isinstance(preferences, dict)
            else {}
        )
        if not isinstance(notifications, dict):
            return False
        return (
            notifications.get("system") is not False
            and notifications.get(preference) is not False
        )
    except Exception:
        LOGGER.exception(
            "Could not read notification preferences for user %s", user_id
        )
        return False


def _ensure_push_tokens_table() -> None:
    global _PUSH_TOKENS_TABLE_READY
    if _PUSH_TOKENS_TABLE_READY:
        return
    if _live_use_sqlite():
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS device_push_tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """,
            (),
        )
    else:
        execute_write(
            """
            CREATE TABLE IF NOT EXISTS device_push_tokens (
                token VARCHAR(512) CHARACTER SET ascii PRIMARY KEY,
                user_id INT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_push_user (user_id)
            )
            """,
            (),
        )
    _PUSH_TOKENS_TABLE_READY = True


def _send_push_to_user(
    user_id: int,
    title: str,
    message: str,
    data: dict[str, Any] | None = None,
    *,
    preference: str = "system",
) -> None:
    try:
        if not _notification_preference_enabled(user_id, preference):
            return
        _ensure_push_tokens_table()
        rows = fetch_all(
            "SELECT token FROM device_push_tokens WHERE user_id=%s", (user_id,)
        )
        tokens = [str(_row_get(row, "token") or "") for row in rows or []]
        tokens = [token for token in tokens if token]
        if not tokens:
            return
        from .fcm_admin import send_to_tokens

        payload = {str(key): str(value) for key, value in (data or {}).items()}
        payload["preference"] = preference
        invalid = send_to_tokens(tokens, title, message, payload)
        for token in invalid:
            execute_write("DELETE FROM device_push_tokens WHERE token=%s", (token,))
    except Exception:
        LOGGER.exception("Could not send push notification to user %s", user_id)


def _notify_saved_book_readers(
    book_id: int, chapter_number: int, chapter_title: str = ""
) -> None:
    """Notify library/reading-list followers when a story chapter goes live."""
    try:
        book_rows = fetch_all("SELECT title FROM books WHERE id=%s LIMIT 1", (book_id,))
        if not book_rows:
            return
        book_title = str(_row_get(book_rows[0], "title") or "a saved story")
        readers: set[int] = set()
        try:
            rows = fetch_all(
                "SELECT user_id FROM library_entries WHERE book_id=%s",
                (book_id,),
            )
            readers.update(
                int(_row_get(row, "user_id"))
                for row in rows or []
                if _row_get(row, "user_id") is not None
            )
        except Exception as exc:
            LOGGER.warning("Could not find library readers for book %s: %s", book_id, exc)
        try:
            rows = fetch_all(
                """
                SELECT DISTINCT rl.user_id
                FROM reading_lists rl
                JOIN reading_list_items rli ON rli.reading_list_id=rl.id
                WHERE rli.book_id=%s
                """,
                (book_id,),
            )
            readers.update(
                int(_row_get(row, "user_id"))
                for row in rows or []
                if _row_get(row, "user_id") is not None
            )
        except Exception as exc:
            LOGGER.warning(
                "Could not find reading-list readers for book %s: %s", book_id, exc
            )

        heading = f"Chapter {chapter_number}"
        if chapter_title.strip():
            heading = f"{heading}: {chapter_title.strip()}"
        for reader_id in readers:
            _send_push_to_user(
                reader_id,
                f"New chapter in {book_title}",
                f"{heading} is now available.",
                {
                    "type": "new_chapter",
                    "book_id": str(book_id),
                    "chapter_number": str(chapter_number),
                },
                preference="saved_books",
            )
    except Exception:
        LOGGER.exception("Could not notify readers for book %s", book_id)


@app.post("/api/push-tokens")
def register_push_token(
    payload: PushTokenRequest, user: dict[str, Any] = Depends(require_user)
):
    _ensure_push_tokens_table()
    token = payload.token.strip()
    uid = int(user["user_id"])
    if _live_use_sqlite():
        execute_write(
            "INSERT INTO device_push_tokens (token, user_id) VALUES (%s, %s) "
            "ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, updated_at=CURRENT_TIMESTAMP",
            (token, uid),
        )
    else:
        execute_write(
            "INSERT INTO device_push_tokens (token, user_id) VALUES (%s, %s) "
            "ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), updated_at=CURRENT_TIMESTAMP",
            (token, uid),
        )
    return {"ok": True}


@app.post("/api/push-tokens/unregister")
def unregister_push_token(
    payload: PushTokenRequest, user: dict[str, Any] = Depends(require_user)
):
    _ensure_push_tokens_table()
    execute_write(
        "DELETE FROM device_push_tokens WHERE token=%s AND user_id=%s",
        (payload.token.strip(), int(user["user_id"])),
    )
    return {"ok": True}


@app.get("/api/notifications")
def get_notifications(
    tab: str = Query(default=""),
    user: dict[str, Any] = Depends(require_user),
):
    """Fast notifications for signed-in user (JOIN-based, no N+1 / no DDL)."""
    uid = int(user["user_id"])
    items: list[dict[str, Any]] = []

    try:
        likes = fetch_all(
            """
            SELECT bl.id, bl.user_id, bl.book_id, bl.created_at, b.title, b.cover_path,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM book_likes bl
            JOIN books b ON b.id = bl.book_id
            LEFT JOIN app_users u ON u.id = bl.user_id
            WHERE bl.user_id != %s
              AND (b.user_id=%s OR (
                    LOWER(COALESCE(b.author,'')) = LOWER((SELECT COALESCE(display_name,'') FROM app_users WHERE id=%s LIMIT 1))
                  ))
            ORDER BY bl.id DESC LIMIT 25
            """,
            (uid, uid, uid),
        )
        for row in likes or []:
            aname = _row_get(row, "actor_name") or "Someone"
            title = _row_get(row, "title") or "your story"
            items.append({
                "id": f"like-{_row_get(row, 'id')}",
                "tab": "Story",
                "type": "like",
                "title": f"{aname} liked {title}",
                "message": f'{aname} liked your book "{title}"',
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "book_id": _row_get(row, "book_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications likes: %s", exc)

    try:
        shares = fetch_all(
            """
            SELECT s.id, s.user_id, s.book_id, s.created_at, b.title, b.cover_path,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM book_shares s JOIN books b ON b.id=s.book_id
            LEFT JOIN app_users u ON u.id=s.user_id
            WHERE s.user_id != %s AND (b.user_id=%s OR LOWER(COALESCE(b.author,'')) = LOWER((SELECT COALESCE(display_name,'') FROM app_users WHERE id=%s LIMIT 1)))
            ORDER BY s.id DESC LIMIT 25
            """,
            (uid, uid, uid),
        )
        for row in shares or []:
            actor = _row_get(row, "actor_name") or "Someone"
            title = _row_get(row, "title") or "your story"
            items.append({
                "id": f"share-{_row_get(row, 'id')}",
                "tab": "Story",
                "type": "share",
                "title": f"{actor} shared {title}",
                "message": f'{actor} shared your book "{title}"',
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": actor,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "book_id": _row_get(row, "book_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications shares: %s", exc)

    try:
        comments = fetch_all(
            """
            SELECT cc.id, cc.user_id, cc.chapter_id, cc.body, cc.created_at,
                   COALESCE(cc.book_id, c.story_id) AS book_id,
                   b.title AS book_title, b.cover_path,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM chapter_comments cc
            LEFT JOIN chapters c ON c.id = cc.chapter_id
            JOIN books b ON b.id = COALESCE(cc.book_id, c.story_id)
            LEFT JOIN app_users u ON u.id = cc.user_id
            WHERE cc.user_id != %s
              AND (b.user_id=%s OR LOWER(COALESCE(b.author,'')) = LOWER((SELECT COALESCE(display_name,'') FROM app_users WHERE id=%s LIMIT 1)))
            ORDER BY cc.id DESC LIMIT 25
            """,
            (uid, uid, uid),
        )
        for row in comments or []:
            aname = _row_get(row, "actor_name") or "Someone"
            btitle = _row_get(row, "book_title") or "your story"
            body = (_row_get(row, "body") or "")[:160]
            items.append({
                "id": f"comment-{_row_get(row, 'id')}",
                "tab": "Story",
                "type": "comment",
                "title": f"{aname} commented on {btitle}",
                "message": body or f"New comment on {btitle}",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "book_id": _row_get(row, "book_id"),
                "chapter_id": _row_get(row, "chapter_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications comments: %s", exc)

    try:
        reviews = fetch_all(
            """
            SELECT r.id, r.user_id, r.book_id, r.rating, r.comment AS body, r.created_at,
                   b.title, b.cover_path,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM book_reviews r
            JOIN books b ON b.id = r.book_id
            LEFT JOIN app_users u ON u.id = r.user_id
            WHERE r.user_id != %s
              AND (b.user_id=%s OR LOWER(COALESCE(b.author,'')) = LOWER((SELECT COALESCE(display_name,'') FROM app_users WHERE id=%s LIMIT 1)))
            ORDER BY r.id DESC LIMIT 25
            """,
            (uid, uid, uid),
        )
        for row in reviews or []:
            aname = _row_get(row, "actor_name") or "Someone"
            title = _row_get(row, "title") or "your story"
            body = (_row_get(row, "body") or "")[:160]
            items.append({
                "id": f"review-{_row_get(row, 'id')}",
                "tab": "Story",
                "type": "review",
                "title": f"{aname} reviewed {title}",
                "message": body or f"Rated {_row_get(row, 'rating') or ''}/5",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "book_id": _row_get(row, "book_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications reviews: %s", exc)

    try:
        follows = fetch_all(
            """
            SELECT f.id, f.user_id AS follower_id, f.created_at,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM author_follows f
            LEFT JOIN app_users u ON u.id = f.user_id
            WHERE f.author_id=%s AND f.user_id != %s
            ORDER BY f.id DESC LIMIT 25
            """,
            (uid, uid),
        )
        for row in follows or []:
            aname = _row_get(row, "actor_name") or "Someone"
            items.append({
                "id": f"follow-{_row_get(row, 'id')}",
                "tab": "Community",
                "type": "follow",
                "title": f"{aname} started following you",
                "message": f"{aname} is now following you",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "actor_user_id": _row_get(row, "follower_id"),
            })
    except Exception as exc:
        LOGGER.warning("notifications follows: %s", exc)

    # Others saved my books to library
    try:
        saves = fetch_all(
            """
            SELECT le.id, le.user_id, le.book_id, b.title, b.cover_path,
                   COALESCE(le.updated_at, le.created_at) AS activity_at,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM library_entries le
            JOIN books b ON b.id = le.book_id
            LEFT JOIN app_users u ON u.id = le.user_id
            WHERE le.user_id != %s
              AND (b.user_id=%s OR LOWER(COALESCE(b.author,'')) = LOWER((SELECT COALESCE(display_name,'') FROM app_users WHERE id=%s LIMIT 1)))
            ORDER BY le.id DESC LIMIT 25
            """,
            (uid, uid, uid),
        )
        for row in saves or []:
            aname = _row_get(row, "actor_name") or "Someone"
            title = _row_get(row, "title") or "your story"
            items.append({
                "id": f"save-{_row_get(row, 'id')}",
                "tab": "Story",
                "type": "save",
                "title": f"{aname} saved {title}",
                "message": f'{aname} saved your book "{title}"',
                "created_at": _serialize_db_datetime(_row_get(row, "activity_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
                "book_id": _row_get(row, "book_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications saves: %s", exc)

    try:
        wall = fetch_all(
            """
            SELECT w.id, w.user_id, w.body, w.created_at,
                   COALESCE(u.display_name, 'Someone') AS actor_name,
                   COALESCE(u.photo_url, '') AS actor_photo
            FROM wall_posts w
            LEFT JOIN app_users u ON u.id = w.user_id
            WHERE w.target_user_id=%s AND w.user_id != %s
            ORDER BY w.id DESC LIMIT 20
            """,
            (uid, uid),
        )
        for row in wall or []:
            aname = _row_get(row, "actor_name") or "Someone"
            body = (_row_get(row, "body") or "")[:160]
            items.append({
                "id": f"wall-{_row_get(row, 'id')}",
                "tab": "Community",
                "type": "wall",
                "title": f"{aname} posted on your wall",
                "message": body or "New wall post",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": aname,
                "actor_photo": _row_get(row, "actor_photo") or "",
            })
    except Exception as exc:
        LOGGER.warning("notifications wall: %s", exc)

    # Support / Contact Us admin replies
    try:
        _ensure_user_support_notifications_table()
        srows = fetch_all(
            """
            SELECT id, support_request_id, title, message, is_read, created_at
            FROM user_support_notifications
            WHERE user_id=%s
            ORDER BY id DESC LIMIT 30
            """,
            (uid,),
        )
        for row in srows or []:
            items.append({
                "id": f"support-{_row_get(row, 'id')}",
                "tab": "System",
                "type": "support_reply",
                "title": _row_get(row, "title") or "Support reply",
                "message": _row_get(row, "message") or "",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "support_request_id": _row_get(row, "support_request_id"),
                "is_read": bool(int(_row_get(row, "is_read") or 0)),
                "actor_name": "Support Team",
                "actor_photo": "",
            })
    except Exception as exc:
        LOGGER.warning("notifications support: %s", exc)

    # Live-chat replies are part of the same reader notification stream.
    try:
        chat_replies = fetch_all(
            """
            SELECT id, message, created_at
            FROM chat_messages
            WHERE user_id=%s AND LOWER(sender)='admin'
            ORDER BY id DESC LIMIT 30
            """,
            (uid,),
        )
        for row in chat_replies or []:
            items.append({
                "id": f"chat-reply-{_row_get(row, 'id')}",
                "tab": "System",
                "type": "chat_reply",
                "title": "A Wingsaga admin replied to your message",
                "message": _row_get(row, "message") or "Open your support inbox to view the reply.",
                "created_at": _serialize_db_datetime(_row_get(row, "created_at")),
                "actor_name": "Wingsaga Support",
            })
    except Exception as exc:
        LOGGER.warning("notifications chat replies: %s", exc)

    try:
        author_books = fetch_all(
            """
            SELECT b.id AS book_id, b.title, b.cover_path, f.notify_since,
                   COALESCE(u.display_name, u.username, 'An author') AS author_name
            FROM author_follows f
            JOIN books b ON b.user_id = f.author_id
            LEFT JOIN app_users u ON u.id = f.author_id
            WHERE f.user_id=%s
              AND f.notify=1
              AND b.id > COALESCE(f.last_book_id, 0)
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'draft%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted', '')
            ORDER BY b.id DESC
            LIMIT 25
            """,
            (uid,),
        )
        for row in author_books or []:
            author_name = _row_get(row, "author_name") or "An author"
            title = _row_get(row, "title") or "a new story"
            items.append({
                "id": f"author-book-{_row_get(row, 'book_id')}",
                "tab": "Story",
                "type": "author_book",
                "title": f"{author_name} published a new story",
                "message": title,
                "created_at": _serialize_db_datetime(_row_get(row, "notify_since")),
                "actor_name": author_name,
                "book_id": _row_get(row, "book_id"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications followed-author books: %s", exc)

    try:
        author_chapters = fetch_all(
            """
            SELECT c.id AS chapter_id, c.chapter_number, c.title AS chapter_title,
                   c.created_at, c.updated_at, b.id AS book_id, b.title AS book_title,
                   b.cover_path, COALESCE(u.display_name, u.username, 'An author') AS author_name
            FROM author_follows f
            JOIN books b ON b.user_id = f.author_id
            JOIN chapters c ON c.story_id = b.id
            LEFT JOIN app_users u ON u.id = f.author_id
            WHERE f.user_id=%s
              AND f.notify=1
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'draft%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT LIKE 'unpublish%%'
              AND LOWER(TRIM(COALESCE(b.status_text, ''))) NOT IN ('private', 'unlisted', '')
              AND LOWER(COALESCE(c.submission_status, 'draft'))
                    IN ('published', 'ongoing', 'completed')
              AND COALESCE(c.updated_at, c.created_at) >= COALESCE(f.notify_since, f.created_at)
            ORDER BY c.updated_at DESC, c.id DESC
            LIMIT 25
            """,
            (uid,),
        )
        for row in author_chapters or []:
            author_name = _row_get(row, "author_name") or "An author"
            book_title = _row_get(row, "book_title") or "a story"
            chapter_title = _row_get(row, "chapter_title") or "a new chapter"
            items.append({
                "id": f"author-chapter-{_row_get(row, 'chapter_id')}",
                "tab": "Story",
                "type": "author_chapter",
                "title": f"{author_name} updated {book_title}",
                "message": chapter_title,
                "created_at": _serialize_db_datetime(
                    _row_get(row, "updated_at") or _row_get(row, "created_at")
                ),
                "actor_name": author_name,
                "book_id": _row_get(row, "book_id"),
                "chapter_id": _row_get(row, "chapter_id"),
                "chapter_number": _row_get(row, "chapter_number"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            })
    except Exception as exc:
        LOGGER.warning("notifications followed-author chapters: %s", exc)

    items.sort(key=lambda it: str(it.get("created_at") or it.get("id") or ""), reverse=True)
    tab_f = (tab or "").strip().lower()
    if tab_f:
        items = [i for i in items if str(i.get("tab", "")).lower() == tab_f]
        LOGGER.info("notifications user=%s items=%s", uid, len(items))
    return {"items": items[:80]}




_USER_PREFERENCES_TABLE_READY = False


def _ensure_user_preferences_table() -> None:
    global _USER_PREFERENCES_TABLE_READY
    if _USER_PREFERENCES_TABLE_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id INTEGER PRIMARY KEY,
                    prefs_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id INT PRIMARY KEY,
                    prefs_json TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        _USER_PREFERENCES_TABLE_READY = True
    except Exception as exc:
        LOGGER.warning("user_preferences table: %s", exc)


@app.get("/api/me/preferences")
def get_my_preferences(user: dict[str, Any] = Depends(require_user)):
    uid = int(user["user_id"])
    _ensure_user_preferences_table()
    try:
        rows = fetch_all("SELECT prefs_json FROM user_preferences WHERE user_id=%s LIMIT 1", (uid,))
        if rows:
            raw = _row_get(rows[0], "prefs_json") or "{}"
            try:
                data = json.loads(raw) if isinstance(raw, str) else (raw or {})
            except Exception:
                data = {}
            if isinstance(data, dict):
                return data
    except Exception as exc:
        LOGGER.warning("get preferences: %s", exc)
    return {
        "notifications": {
            "paragraph_comments": True,
            "comments": True,
            "likes": True,
            "saved_books": True,
            "reading_reminders": True,
            "new_releases": True,
            "recommendations": False,
            "marketing": False,
            "system": True,
        },
        "language": "en",
        "favourite_genres": [],
        "content_warnings": {},
        "cookies": {"essential": True, "analytics": True, "marketing": False, "functional": True},
    }


@app.put("/api/me/preferences")
def put_my_preferences(payload: dict[str, Any] = Body(default={}), user: dict[str, Any] = Depends(require_user)):
    uid = int(user["user_id"])
    _ensure_user_preferences_table()
    current: dict[str, Any] = {}
    try:
        rows = fetch_all("SELECT prefs_json FROM user_preferences WHERE user_id=%s LIMIT 1", (uid,))
        if rows:
            raw = _row_get(rows[0], "prefs_json") or "{}"
            try:
                current = json.loads(raw) if isinstance(raw, str) else dict(raw or {})
            except Exception:
                current = {}
    except Exception:
        current = {}
    for k, v in (payload or {}).items():
        if isinstance(v, dict) and isinstance(current.get(k), dict):
            merged = dict(current.get(k) or {})
            merged.update(v)
            current[k] = merged
        else:
            current[k] = v
    blob = json.dumps(current)
    try:
        if _live_use_sqlite():
            execute_write(
                """
                INSERT INTO user_preferences (user_id, prefs_json, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET prefs_json=excluded.prefs_json, updated_at=CURRENT_TIMESTAMP
                """,
                (uid, blob),
            )
        else:
            execute_write(
                """
                INSERT INTO user_preferences (user_id, prefs_json, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE prefs_json=VALUES(prefs_json), updated_at=CURRENT_TIMESTAMP
                """,
                (uid, blob),
            )
    except Exception as exc:
        LOGGER.warning("put preferences: %s", exc)
        try:
            execute_write("DELETE FROM user_preferences WHERE user_id=%s", (uid,))
            execute_write("INSERT INTO user_preferences (user_id, prefs_json) VALUES (%s, %s)", (uid, blob))
        except Exception as exc2:
            LOGGER.warning("put preferences fallback: %s", exc2)
            raise HTTPException(status_code=500, detail="Could not save preferences")
    return current


@app.get("/api/me/reading-stats")
def get_my_reading_stats(user: dict[str, Any] = Depends(require_user)):
    uid = int(user["user_id"])
    books_read = 0
    streak = 0
    top_genres: list[dict[str, Any]] = []
    try:
        rows = fetch_all(
            """
            SELECT COUNT(*) AS c FROM library_entries
            WHERE user_id=%s AND LOWER(COALESCE(reading_status,'')) IN ('completed','complete','finished')
            """,
            (uid,),
        )
        if rows:
            books_read = int(_row_get(rows[0], "c") or 0)
    except Exception:
        try:
            rows = fetch_all("SELECT COUNT(*) AS c FROM library_entries WHERE user_id=%s", (uid,))
            books_read = int(_row_get(rows[0], "c") or 0) if rows else 0
        except Exception:
            books_read = 0
    try:
        rows = fetch_all(
            """
            SELECT COALESCE(b.primary_genre, b.genre, 'General') AS g, COUNT(*) AS c
            FROM library_entries le
            JOIN books b ON b.id = le.book_id
            WHERE le.user_id=%s
            GROUP BY g ORDER BY c DESC LIMIT 5
            """,
            (uid,),
        )
        for r in rows or []:
            top_genres.append({"name": _row_get(r, "g") or "General", "count": int(_row_get(r, "c") or 0)})
    except Exception:
        pass
    return {
        "books_read": books_read,
        "pages_read": books_read * 180,
        "current_streak": streak,
        "month_books": min(books_read, 6) if books_read else 0,
        "goal_pct": 75 if books_read else 0,
        "top_genres": top_genres,
        "reading_time_label": "",
    }



@app.get("/api/support/requests")
def list_my_support_requests(user: dict[str, Any] = Depends(require_user)):
    """Logged-in user's contact tickets + admin replies (conversation history)."""
    _ensure_support_request_columns()
    uid = int(user["user_id"])
    email = (user.get("email") or "").strip().lower()
    try:
        rows = fetch_all(
            """
            SELECT id, email, first_name, issue, subject, description, device_type,
                   attachment_path, status, created_at, admin_reply, user_id, replied_at
            FROM support_requests
            WHERE user_id=%s OR (email IS NOT NULL AND LOWER(email)=%s)
            ORDER BY created_at DESC, id DESC
            """,
            (uid, email or "__none__"),
        )
    except Exception as exc:
        LOGGER.warning("list_my_support_requests failed: %s", exc)
        rows = []
    items = []
    for r in rows or []:
        rid = _row_get(r, "id")
        items.append({
            "id": rid,
            "ticket_id": f"#CNT-{rid}",
            "topic": _row_get(r, "issue") or _row_get(r, "subject") or "General",
            "subject": _row_get(r, "subject") or "",
            "message": _row_get(r, "description") or "",
            "status": (_row_get(r, "status") or "open").lower(),
            "created_at": str(_row_get(r, "created_at") or ""),
            "updated_at": str(_row_get(r, "replied_at") or _row_get(r, "created_at") or ""),
            "admin_reply": _row_get(r, "admin_reply") or "",
            "email": _row_get(r, "email") or "",
            "username": _row_get(r, "first_name") or "",
        })
    return {"items": items}


@app.post("/api/support/requests")
def create_support_request(
    payload: SupportRequestCreateRequest,
    user: dict[str, Any] | None = Depends(optional_user),
):
    _ensure_support_request_columns()
    uid = None
    try:
        if user and user.get("user_id"):
            uid = int(user["user_id"])
    except Exception:
        uid = None
    # Try insert with user_id first; fall back without if column missing mid-deploy
    try:
        request_id, affected = execute_write(
            """
            INSERT INTO support_requests (
                email, first_name, issue, subject, description,
                device_type, attachment_path, status, user_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'open', %s)
            """,
            (
                payload.email,
                payload.first_name,
                payload.issue,
                payload.subject,
                payload.description,
                payload.device_type,
                payload.attachment_path,
                uid,
            ),
        )
    except Exception:
        request_id, affected = execute_write(
            """
            INSERT INTO support_requests (
                email, first_name, issue, subject, description,
                device_type, attachment_path, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'open')
            """,
            (
                payload.email,
                payload.first_name,
                payload.issue,
                payload.subject,
                payload.description,
                payload.device_type,
                payload.attachment_path,
            ),
        )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to create support request")
    bump_content_version()
    return {"ok": True, "id": request_id}


@app.get("/api/chat/messages")
def get_chat_messages(user: dict[str, Any] = Depends(require_user)):
    rows = fetch_all(
        """
        SELECT id, user_id, sender, message, created_at
        FROM chat_messages
        WHERE user_id=%s
        ORDER BY created_at ASC, id ASC
        """,
        (user["user_id"],),
    )
    return {
        "items": [
            {
                "id": row["id"],
                "sender": row["sender"],
                "message": row["message"],
                "created_at": _serialize_db_datetime(row["created_at"]),
            }
            for row in rows
        ]
    }


@app.post("/api/chat/messages")
def create_chat_message(
    payload: ChatMessageCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    row_id, _ = execute_write(
        "INSERT INTO chat_messages (user_id, sender, message) VALUES (%s, %s, %s)",
        (user["user_id"], "user", message),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.get("/api/admin/chat/conversations")
def admin_chat_conversations(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        """
        SELECT u.id AS user_id, u.display_name, u.email,
               COUNT(cm.id) AS message_count,
               MAX(cm.created_at) AS last_message_at,
               (SELECT cm2.id FROM chat_messages cm2 WHERE cm2.user_id=u.id ORDER BY cm2.id DESC LIMIT 1) AS last_message_id,
               (SELECT cm3.sender FROM chat_messages cm3 WHERE cm3.user_id=u.id ORDER BY cm3.id DESC LIMIT 1) AS last_sender,
               (SELECT cm4.message FROM chat_messages cm4 WHERE cm4.user_id=u.id ORDER BY cm4.id DESC LIMIT 1) AS last_message
        FROM chat_messages cm
        JOIN app_users u ON u.id = cm.user_id
        GROUP BY u.id, u.display_name, u.email
        ORDER BY last_message_at DESC, u.id DESC
        LIMIT 500
        """
    )
    return {"items": rows}


@app.get("/api/admin/chat/conversations/{user_id}")
def admin_chat_messages(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        """
        SELECT id, user_id, sender, message, created_at
        FROM chat_messages
        WHERE user_id=%s
        ORDER BY created_at ASC, id ASC
        """,
        (user_id,),
    )
    return {"items": rows}


@app.post("/api/admin/chat/conversations/{user_id}")
def admin_send_chat_message(
    user_id: int,
    payload: ChatMessageCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if not fetch_all("SELECT id FROM app_users WHERE id=%s LIMIT 1", (user_id,)):
        raise HTTPException(status_code=404, detail="User not found")
    row_id, _ = execute_write(
        "INSERT INTO chat_messages (user_id, sender, message) VALUES (%s, %s, %s)",
        (user_id, "admin", message),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}



@app.post("/api/admin/purge-user")
def admin_purge_user(payload: dict[str, Any], admin: dict[str, Any] = Depends(require_admin)):
    """Delete all data for an email (Aiven console alternative). Body: {"email": "..."}"""
    email = str(payload.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="email required")
    rows = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
    if not rows:
        return {"ok": True, "deleted": False, "reason": "user not found"}
    uid = int(_row_get(rows[0], "id") or 0)
    if not uid:
        return {"ok": True, "deleted": False}
    tables = [
        ("book_likes", "user_id"),
        ("book_reviews", "user_id"),
        ("author_follows", "user_id"),
        ("chapter_comments", "user_id"),
        ("library_entries", "user_id"),
        ("chat_messages", "user_id"),
        ("wall_posts", "user_id"),
        ("support_requests", "user_id"),
    ]
    deleted = {}
    for table, col in tables:
        try:
            _, n = execute_write(f"DELETE FROM {table} WHERE {col}=%s", (uid,))
            deleted[table] = n
        except Exception as exc:
            deleted[table] = str(exc)
    try:
        # Unfollow this user as author
        execute_write("DELETE FROM author_follows WHERE author_id=%s", (uid,))
    except Exception:
        pass
    try:
        _, n = execute_write("DELETE FROM app_users WHERE id=%s", (uid,))
        deleted["app_users"] = n
    except Exception as exc:
        deleted["app_users"] = str(exc)
    return {"ok": True, "deleted": True, "user_id": uid, "details": deleted}


@app.get("/api/admin/chat/{target_user_id}")
def admin_get_chat_messages(target_user_id: int, admin: dict[str, Any] = Depends(require_admin)):
    """Admin reads a user's support chat thread."""
    rows = fetch_all(
        """
        SELECT id, user_id, sender, message, created_at
        FROM chat_messages
        WHERE user_id=%s
        ORDER BY created_at ASC, id ASC
        """,
        (target_user_id,),
    )
    return {
        "items": [
            {
                "id": row["id"],
                "sender": row["sender"],
                "message": row["message"],
                "created_at": _serialize_db_datetime(row["created_at"]),
            }
            for row in (rows or [])
        ]
    }


@app.post("/api/admin/chat/{target_user_id}")
def admin_reply_chat(
    target_user_id: int,
    payload: ChatMessageCreateRequest,
    admin: dict[str, Any] = Depends(require_admin),
):
    """Admin sends a reply into a user's chat thread."""
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    row_id, _ = execute_write(
        "INSERT INTO chat_messages (user_id, sender, message) VALUES (%s, %s, %s)",
        (target_user_id, "admin", message),
    )
    return {"ok": True, "id": row_id}



_LIBRARY_ENTRIES_TABLE_READY = False


def _ensure_library_entries_table() -> None:
    """Ensure library_entries exists with user_id + reading_status (MySQL/SQLite)."""
    global _LIBRARY_ENTRIES_TABLE_READY
    if _LIBRARY_ENTRIES_TABLE_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS library_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    book_id INTEGER NOT NULL,
                    reading_status TEXT DEFAULT 'Reading',
                    updated_text TEXT DEFAULT '',
                    chapters INTEGER DEFAULT 0,
                    primary_genre TEXT DEFAULT '',
                    secondary_genre TEXT DEFAULT '',
                    sort_order INTEGER DEFAULT 999,
                    reading_progress_percent INTEGER NULL
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS library_entries (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    book_id INT NOT NULL,
                    reading_status VARCHAR(64) DEFAULT 'Reading',
                    updated_text VARCHAR(255) DEFAULT '',
                    chapters INT DEFAULT 0,
                    primary_genre VARCHAR(128) DEFAULT '',
                    secondary_genre VARCHAR(128) DEFAULT '',
                    sort_order INT DEFAULT 999,
                    reading_progress_percent INT NULL,
                    INDEX (user_id),
                    INDEX (book_id)
                )
                """,
                (),
            )
        
        # Reading resume fields
        for col_sql in (
            ("last_chapter_number", "INTEGER DEFAULT 1"),
            ("last_paragraph_index", "INTEGER DEFAULT 0"),
            ("chapters_read", "INTEGER DEFAULT 0"),
            ("reading_progress_percent", "INTEGER NULL"),
            ("created_at", "TIMESTAMP NULL"),
            ("updated_at", "TIMESTAMP NULL"),
        ):
            col, typ = col_sql
            try:
                if _live_use_sqlite():
                    execute_write(f"ALTER TABLE library_entries ADD COLUMN {col} {typ}")
                else:
                    execute_write(f"ALTER TABLE library_entries ADD COLUMN {col} {typ}")
            except Exception:
                pass

        _LIBRARY_ENTRIES_TABLE_READY = True
    except Exception as exc:
        LOGGER.warning("library_entries ensure failed: %s", exc)


@app.get("/api/library")
def get_library_entries(user: dict[str, Any] = Depends(require_user)):
    _ensure_library_entries_table()
    rows = fetch_all(
        """
        SELECT le.id, le.reading_status, le.updated_text, le.chapters, le.primary_genre,
               le.secondary_genre,
               COALESCE(le.last_chapter_number, 1) AS last_chapter_number,
               COALESCE(le.last_paragraph_index, 0) AS last_paragraph_index,
               COALESCE(le.chapters_read, 0) AS chapters_read,
               le.reading_progress_percent,
               b.id AS book_id, b.title, b.author, b.cover_path, b.accent_hex,
               b.description, b.status_text, b.rating, b.user_id AS author_user_id, b.primary_genre AS book_genre
        FROM library_entries le
        JOIN books b ON b.id = le.book_id
        WHERE le.user_id = %s
        ORDER BY le.id DESC
        """,
        (user["user_id"],),
    )
    seen_books: set[int] = set()
    items: list[dict[str, Any]] = []
    for row in rows or []:
        book_id = int(_row_get(row, "book_id") or 0)
        if book_id in seen_books:
            continue
        seen_books.add(book_id)
        items.append({
            "id": _row_get(row, "id"),
            "book": {
                "id": book_id,
                "title": _row_get(row, "title"),
                "author": _row_get(row, "author"),
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
                "accent_hex": _row_get(row, "accent_hex"),
                "description": _row_get(row, "description") or "",
                "status_text": _row_get(row, "status_text") or "",
                "rating": float(_row_get(row, "rating") or 0),
                "author_user_id": _row_get(row, "author_user_id"),
                "primary_genre": _row_get(row, "book_genre") or _row_get(row, "primary_genre") or "",
            },
            "reading_status": _row_get(row, "reading_status"),
            "updated_text": _row_get(row, "updated_text"),
            "chapters": _row_get(row, "chapters"),
            "last_chapter_number": int(_row_get(row, "last_chapter_number") or 1),
            "last_paragraph_index": int(_row_get(row, "last_paragraph_index") or 0),
            "chapters_read": int(_row_get(row, "chapters_read") or 0),
            "reading_progress_percent": _row_get(row, "reading_progress_percent"),
            "primary_genre": _row_get(row, "primary_genre"),
            "secondary_genre": _row_get(row, "secondary_genre"),
        })
    return {"items": items}


@app.post("/api/library")
def create_library_entry(
    payload: LibraryCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    _ensure_library_entries_table()
    """Upsert one library row per (user, book). Never create duplicates."""
    uid = int(user["user_id"])
    bid = int(payload.book_id)
    # Authors must not get Continue Reading / Completed for their own books.
    try:
        own = fetch_all(
            "SELECT id FROM books WHERE id=%s AND user_id=%s LIMIT 1",
            (bid, uid),
        )
        if own:
            return {"ok": True, "skipped": True, "reason": "own_book"}
    except Exception as exc:
        LOGGER.warning("own-book library check failed: %s", exc)
    new_status = (payload.reading_status or "Reading").strip() or "Reading"

    existing = fetch_all(
        "SELECT id, reading_status FROM library_entries WHERE user_id=%s AND book_id=%s ORDER BY id ASC",
        (uid, bid),
    )
    if existing:
        keep_id = int(_row_get(existing[0], "id") or 0)
        for extra in existing[1:]:
            eid = int(_row_get(extra, "id") or 0)
            if eid and eid != keep_id:
                try:
                    execute_write(
                        "DELETE FROM library_entries WHERE id=%s AND user_id=%s",
                        (eid, uid),
                    )
                except Exception:
                    pass
        current_status = str(_row_get(existing[0], "reading_status") or "").strip().lower()
        completed_statuses = {"completed", "complete", "finished", "done", "history"}
        status_to_set = (
            "Completed"
            if current_status in completed_statuses and new_status.lower() in {"reading", "ongoing", "in progress"}
            else new_status
        )
        lcn = payload.last_chapter_number if payload.last_chapter_number is not None else 1
        lpi = payload.last_paragraph_index if payload.last_paragraph_index is not None else 0
        cr = payload.chapters_read if payload.chapters_read is not None else 0
        execute_write(
            """
            UPDATE library_entries
            SET reading_status=%s, updated_text=%s, chapters=%s, primary_genre=%s, secondary_genre=%s,
                last_chapter_number=%s, last_paragraph_index=%s, chapters_read=%s, reading_progress_percent=%s
            WHERE id=%s
            """,
            (
                status_to_set,
                payload.updated_text,
                payload.chapters,
                payload.primary_genre,
                payload.secondary_genre,
                lcn,
                lpi,
                cr,
                payload.reading_progress_percent,
                keep_id,
            ),
        )
        if payload.reading_progress_percent is not None and payload.reading_progress_percent > 0:
            _record_writer_analytics_event(
                bid,
                "read",
                actor_user_id=uid,
                chapter_number=lcn,
            )
        bump_content_version()
        return {"ok": True, "id": keep_id, "updated": True}

    lcn = payload.last_chapter_number if payload.last_chapter_number is not None else 1
    lpi = payload.last_paragraph_index if payload.last_paragraph_index is not None else 0
    cr = payload.chapters_read if payload.chapters_read is not None else 0
    entry_id, affected = execute_write(
        """
        INSERT INTO library_entries (user_id, book_id, reading_status, updated_text, chapters, primary_genre, secondary_genre, sort_order,
            last_chapter_number, last_paragraph_index, chapters_read, reading_progress_percent)
        VALUES (%s, %s, %s, %s, %s, %s, %s, 999, %s, %s, %s, %s)
        """,
        (
            uid,
            bid,
            new_status,
            payload.updated_text,
            payload.chapters,
            payload.primary_genre,
            payload.secondary_genre,
            lcn,
            lpi,
            cr,
            payload.reading_progress_percent,
        ),
    )
    if affected == 0 and not entry_id:
        raise HTTPException(status_code=400, detail="Failed to create library entry")
    if payload.reading_progress_percent is not None and payload.reading_progress_percent > 0:
        _record_writer_analytics_event(
            bid,
            "read",
            actor_user_id=uid,
            chapter_number=lcn,
        )
    bump_content_version()
    return {"ok": True, "id": entry_id}


@app.put("/api/library/{entry_id}")
def update_library_entry(
    entry_id: int,
    payload: LibraryUpdateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    current_rows = fetch_all(
        "SELECT * FROM library_entries WHERE id=%s AND user_id=%s",
        (entry_id, user["user_id"]),
    )
    if not current_rows:
        raise HTTPException(status_code=404, detail="Library entry not found")

    current = current_rows[0]
    _, affected = execute_write(
        """
        UPDATE library_entries
        SET reading_status=%s,
            updated_text=%s,
            chapters=%s,
            primary_genre=%s,
            secondary_genre=%s,
            last_chapter_number=%s,
            last_paragraph_index=%s,
            chapters_read=%s,
            reading_progress_percent=%s
        WHERE id=%s AND user_id=%s
        """,
        (
            payload.reading_status or current["reading_status"],
            payload.updated_text or current["updated_text"],
            payload.chapters if payload.chapters is not None else current["chapters"],
            payload.primary_genre or current["primary_genre"],
            payload.secondary_genre or current["secondary_genre"],
            payload.last_chapter_number if payload.last_chapter_number is not None else current.get("last_chapter_number", 1),
            payload.last_paragraph_index if payload.last_paragraph_index is not None else current.get("last_paragraph_index", 0),
            payload.chapters_read if payload.chapters_read is not None else current.get("chapters_read", 0),
            payload.reading_progress_percent if payload.reading_progress_percent is not None else current.get("reading_progress_percent"),
            entry_id,
            user["user_id"],
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update library entry")
    progress = (
        payload.reading_progress_percent
        if payload.reading_progress_percent is not None
        else current.get("reading_progress_percent")
    )
    if progress is not None and int(progress) > 0:
        _record_writer_analytics_event(
            int(current.get("book_id") or 0),
            "read",
            actor_user_id=int(user["user_id"]),
            chapter_number=int(
                payload.last_chapter_number
                if payload.last_chapter_number is not None
                else current.get("last_chapter_number") or 0
            ),
        )
    bump_content_version()
    return {"ok": True}


@app.delete("/api/library/{entry_id}")
def delete_library_entry(entry_id: int, user: dict[str, Any] = Depends(require_user)):
    _, affected = execute_write(
        "DELETE FROM library_entries WHERE id=%s AND user_id=%s",
        (entry_id, user["user_id"]),
    )
    if affected == 0:
        raise HTTPException(status_code=404, detail="Library entry not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/reading-lists")
def get_public_reading_lists(user: dict[str, Any] = Depends(require_user)):
    rows = fetch_all(
        """
        SELECT id, profile_id, name, description, story_count, cover_path, sort_order
        FROM reading_lists
        WHERE user_id = %s
        ORDER BY sort_order, id
        """,
        (user["user_id"],),
    )
    preview_rows = fetch_all(
        """
        SELECT reading_list_id, id, book_id, title, author, cover_path, genre, created_at
        FROM (
            SELECT rli.reading_list_id, rli.id, b.id AS book_id, b.title, b.author,
                   b.cover_path, b.genre, rli.created_at,
                   ROW_NUMBER() OVER (
                       PARTITION BY rli.reading_list_id
                       ORDER BY rli.created_at DESC, rli.id DESC
                   ) AS preview_rank
            FROM reading_list_items rli
            JOIN books b ON b.id = rli.book_id
            JOIN reading_lists rl ON rl.id = rli.reading_list_id
            WHERE rl.user_id = %s
        ) recent_items
        WHERE preview_rank <= 3
        ORDER BY reading_list_id, preview_rank
        """,
        (user["user_id"],),
    )
    previews_by_list: dict[int, list[dict[str, Any]]] = {}
    for preview in preview_rows or []:
        list_id = int(_row_get(preview, "reading_list_id") or 0)
        previews_by_list.setdefault(list_id, []).append({
            "id": _row_get(preview, "id"),
            "book_id": _row_get(preview, "book_id"),
            "title": _row_get(preview, "title") or "",
            "author": _row_get(preview, "author") or "",
            "cover_path": _normalize_cover_path(_row_get(preview, "cover_path") or ""),
            "genre": _row_get(preview, "genre") or "",
            "created_at": _row_get(preview, "created_at"),
        })
    items = []
    for row in rows:
        list_id = int(_row_get(row, "id") or 0)
        items.append({
            **(dict(row) if not isinstance(row, dict) else row),
            "cover_path": _normalize_cover_path(_row_get(row, "cover_path")),
            "preview_items": previews_by_list.get(list_id, []),
        })
    return {"items": items}


@app.post("/api/reading-lists")
def create_public_reading_list(
    payload: ReadingListCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Reading list name is required")
    row_id, _ = execute_write(
        """
        INSERT INTO reading_lists (user_id, profile_id, name, description, story_count, cover_path, sort_order)
        VALUES (%s, 1, %s, %s, %s, %s, %s)
        """,
        (
            user["user_id"],
            name,
            (payload.description or "").strip()[:500],
            payload.story_count,
            _normalize_cover_path(payload.cover_path),
            payload.sort_order,
        ),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.get("/api/reading-lists/{reading_list_id}")
def get_reading_list_detail(
    reading_list_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    rows = fetch_all(
        "SELECT id, profile_id, user_id, name, description, story_count, cover_path, sort_order FROM reading_lists WHERE id=%s AND (user_id=%s OR user_id IS NULL)",
        (reading_list_id, user["user_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reading list not found")

    items = fetch_all(
        "SELECT r.id, r.book_id, b.title, b.author, b.cover_path, b.genre, r.created_at FROM reading_list_items r JOIN books b ON b.id = r.book_id WHERE r.reading_list_id=%s ORDER BY r.created_at DESC",
        (reading_list_id,),
    )
    return {
        **rows[0],
        "cover_path": _normalize_cover_path(_row_get(rows[0], "cover_path")),
        "items": [
            {
                **item,
                "cover_path": _normalize_cover_path(_row_get(item, "cover_path")),
            }
            for item in items
        ],
    }


@app.post("/api/reading-lists/{reading_list_id}/items")
def add_reading_list_item(
    reading_list_id: int,
    payload: dict[str, Any],
    user: dict[str, Any] = Depends(require_user),
):
    rows = fetch_all(
        "SELECT id FROM reading_lists WHERE id=%s AND user_id=%s",
        (reading_list_id, user["user_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reading list not found")

    book_id = int(payload.get("book_id", 0))
    book_rows = fetch_all("SELECT id, user_id FROM books WHERE id=%s", (book_id,))
    if not book_rows:
        raise HTTPException(status_code=404, detail="Book not found")
    if int(_row_get(book_rows[0], "user_id") or 0) == int(user["user_id"]):
        raise HTTPException(status_code=403, detail="You cannot save your own story to a reading list")

    # Idempotent: if already on this list, return success (no duplicate)
    existing = fetch_all(
        "SELECT id FROM reading_list_items WHERE reading_list_id=%s AND book_id=%s LIMIT 1",
        (reading_list_id, book_id),
    )
    if existing:
        return {
            "ok": True,
            "id": int(_row_get(existing[0], "id") or 0),
            "already_exists": True,
        }

    item_id, _ = execute_write(
        "INSERT INTO reading_list_items (reading_list_id, book_id) VALUES (%s, %s)",
        (reading_list_id, book_id),
    )
    execute_write(
        "UPDATE reading_lists SET story_count = story_count + 1 WHERE id=%s",
        (reading_list_id,),
    )
    bump_content_version()
    return {"ok": True, "id": item_id, "already_exists": False}


@app.delete("/api/reading-lists/{reading_list_id}/items/{item_id}")
def remove_reading_list_item(
    reading_list_id: int,
    item_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    rows = fetch_all(
        "SELECT id FROM reading_lists WHERE id=%s AND user_id=%s",
        (reading_list_id, user["user_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Reading list not found")

    _, affected = execute_write(
        "DELETE FROM reading_list_items WHERE id=%s AND reading_list_id=%s",
        (item_id, reading_list_id),
    )
    if affected == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    execute_write(
        "UPDATE reading_lists SET story_count = CASE WHEN story_count > 0 THEN story_count - 1 ELSE 0 END WHERE id=%s",
        (reading_list_id,),
    )
    bump_content_version()
    return {"ok": True}


@app.delete("/api/reading-lists/{reading_list_id}")
def delete_reading_list(
    reading_list_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    _, affected = execute_write(
        "DELETE FROM reading_lists WHERE id=%s AND user_id=%s",
        (reading_list_id, user["user_id"]),
    )
    if affected == 0:
        raise HTTPException(status_code=404, detail="Reading list not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/write/stories")
def get_writer_stories(user: dict[str, Any] = Depends(require_user)):
    """Fast path for Manage Stories / Profile.

    Do NOT call full `_serialize_book` here — it runs tags/likes/reviews
    queries per row (N+1) and was taking 100s+ on Vercel cold MySQL, so the
    Flutter client timed out at 30s and showed an empty list after create.
    """
    # Keep SELECT minimal — only columns that always exist on books
    rows = fetch_all(
        """
        SELECT id, user_id, title, author, description, genre, status_text,
                     cover_path, accent_hex, content_warnings, audience, language, rating,
                             (SELECT MAX(c.updated_at) FROM chapters c WHERE c.story_id=books.id) AS last_updated_at,
                             (SELECT COUNT(*) FROM chapters c
                                WHERE c.story_id=books.id
                                    AND LOWER(COALESCE(c.submission_status, 'draft')) IN
                                            ('published', 'submitted', 'ongoing', 'completed')) AS published_chapter_count,
                             (SELECT COUNT(*) FROM chapters c
                                WHERE c.story_id=books.id) AS chapter_count,
                             (SELECT COUNT(*) FROM chapters c
                                WHERE c.story_id=books.id
                                    AND LOWER(COALESCE(c.submission_status, 'draft')) IN
                                            ('draft', 'private', 'unpublished', 'hidden', '')) AS draft_chapter_count
        FROM books
        WHERE user_id = %s
        ORDER BY id DESC
        """,
        (user["user_id"],),
    )
    items: list[dict[str, Any]] = []
    for row in rows or []:
        status = str(_row_get(row, "status_text") or "Draft")
        published_n = int(_row_get(row, "published_chapter_count") or 0)
        st_low = status.strip().lower()
        expected_status = "Ongoing" if published_n > 0 else "Draft"
        # Completed is an explicit author choice and remains valid while the
        # story has live chapters. The previous check treated it as stale and
        # silently rewrote it to Ongoing on every Write-screen refresh.
        status_is_expected = (
            published_n > 0
            and st_low in {"ongoing", "published", "submitted", "completed", "complete", "finished"}
        ) or (published_n == 0 and st_low in {"draft", "private", "unpublished", "hidden", ""})
        if not status_is_expected:
            status = expected_status
            try:
                execute_write(
                    "UPDATE books SET status_text=%s WHERE id=%s",
                    (expected_status, int(_row_get(row, "id") or 0)),
                )
            except Exception as heal_exc:
                LOGGER.warning("write-list status heal: %s", heal_exc)
        genre = str(_row_get(row, "genre") or "")
        items.append(
            {
                "id": _row_get(row, "id"),
                "user_id": _row_get(row, "user_id"),
                "author_user_id": _row_get(row, "user_id"),
                "title": _row_get(row, "title") or "Untitled",
                "author": _row_get(row, "author") or "",
                "description": _row_get(row, "description") or "",
                "genre": genre,
                "primary_genre": genre,
                "status_text": status,
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path")),
                "accent_hex": _row_get(row, "accent_hex") or "#A1A1A1",
                "content_warnings": str(
                    _row_get(row, "content_warnings") or ""
                ).strip(),
                "audience": _row_get(row, "audience") or "",
                "language": _row_get(row, "language") or "",
                "updated_at": str(_row_get(row, "updated_at") or ""),
                "last_updated_at": str(_row_get(row, "last_updated_at") or ""),
                "is_completed": int(st_low in ("completed", "complete", "finished")),
                "cta_label": "Read now",
                "rating": float(_row_get(row, "rating") or 0),
                "tags": [],
                "likes_count": 0,
                "reviews_count": 0,
                "published_chapter_count": int(_row_get(row, "published_chapter_count") or 0),
                "chapter_count": int(_row_get(row, "chapter_count") or 0),
                "draft_chapter_count": int(_row_get(row, "draft_chapter_count") or 0),
            }
        )
    return {"items": items}


@app.get("/api/write/stories/{story_id}/chapters")
def get_story_chapters(
    story_id: int,
    public_only: bool = Query(default=False),
    user: dict[str, Any] | None = Depends(optional_user),
):
    story_rows = fetch_all(
        "SELECT id, user_id, status_text FROM books WHERE id=%s",
        (story_id,),
    )
    if not story_rows:
        raise HTTPException(status_code=404, detail="Story not found")

    story = story_rows[0]
    owner_id = int(_row_get(story, "user_id") or 0)
    is_owner = user is not None and owner_id == int(user["user_id"])
    include_drafts = is_owner and not public_only
    if not is_owner:
        status = str(_row_get(story, "status_text") or "")
        if not is_public_status(status):
            raise HTTPException(status_code=404, detail="Story not found")

    rows = fetch_all(
        """
        SELECT id, story_id, chapter_number, title, content, notes, submission_status, scheduled_for,
               sort_order, created_at, updated_at
                FROM chapters
                WHERE story_id=%s
                    AND (%s OR LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                             ('published', 'submitted', 'ongoing', 'completed')
                             )
        ORDER BY chapter_number, sort_order, id
        """,
                (story_id, include_drafts),
    )
    items = []
    for row in rows:
        title = str(_row_get(row, "title") or "").strip()
        number = int(_row_get(row, "chapter_number") or 0)
        # Avoid "Chapter 1 Chapter 1" when title is only the chapter label
        lower_t = title.lower()
        is_label_only = (not title) or (
            lower_t.startswith("chapter")
            and lower_t.replace("chapter", "").replace(" ", "").isdigit()
        )
        if is_label_only:
            title = f"Chapter {number}" if number else (title or "Chapter")
        items.append(
            {
                **row,
                "title": title,
                "scheduled_for": _serialize_datetime(_row_get(row, "scheduled_for")),
                "created_at": _serialize_datetime(_row_get(row, "created_at")),
                "updated_at": _serialize_datetime(_row_get(row, "updated_at")),
            }
        )
    return {"items": items}



def is_public_status(status: str | None) -> bool:
    """Only ongoing/completed stories are visible to readers."""
    s = (status or "").strip().lower()
    # Keep legacy published/submitted labels readable as ongoing. All other
    # states, including Draft and Unlisted, stay private to the author.
    return s in {"ongoing", "completed", "complete", "finished", "published", "publish", "live", "public", "submitted"}


def normalize_story_status(status: str | None) -> str:
    """Normalize to Draft | Ongoing | Completed (optional Unlisted)."""
    s = (status or "").strip()
    if not s:
        return "Draft"
    low = s.lower()
    if low in ("draft", "private", "unpublished", "hidden"):
        return "Draft"
    if low in ("unlisted",):
        return "Unlisted"
    if low in ("completed", "complete", "finished"):
        return "Completed"
    if low in ("ongoing", "published", "publish", "live", "public", "submitted"):
        return "Ongoing"
    if s in ("Draft", "Ongoing", "Completed", "Unlisted"):
        return s
    return "Draft"

def _require_story_owner(story_id: int, user: dict[str, Any]) -> dict[str, Any]:
    rows = fetch_all(
        "SELECT id, user_id FROM books WHERE id=%s LIMIT 1",
        (story_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Story not found")
    owner_id = int(_row_get(rows[0], "user_id") or 0)
    if owner_id != int(user["user_id"]):
        raise HTTPException(status_code=403, detail="Only the story owner can manage chapters")
    return rows[0]


@app.get("/api/write/chapters/{chapter_id}/revisions")
def get_story_chapter_revisions(
    chapter_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    chapter_rows = fetch_all(
        "SELECT story_id FROM chapters WHERE id=%s LIMIT 1",
        (chapter_id,),
    )
    if not chapter_rows:
        raise HTTPException(status_code=404, detail="Chapter not found")
    _require_story_owner(int(_row_get(chapter_rows[0], "story_id") or 0), user)
    rows = fetch_all(
        """
        SELECT id, chapter_id, title, content, notes, submission_status, scheduled_for, created_at
        FROM chapter_revisions
        WHERE chapter_id=%s
        ORDER BY created_at DESC, id DESC
        """,
        (chapter_id,),
    )
    return {
        "items": [
            {
                **row,
                "scheduled_for": _serialize_datetime(_row_get(row, "scheduled_for")),
                "created_at": _serialize_datetime(_row_get(row, "created_at")),
            }
            for row in rows
        ]
    }


@app.post("/api/write/chapters/{chapter_id}/revisions/{revision_id}/restore")
def restore_story_chapter_revision(
    chapter_id: int,
    revision_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    """Restore one previous revision into the live chapter (Inkitt-style)."""
    chapter_rows = fetch_all(
        "SELECT id, story_id, title, content, notes, submission_status, scheduled_for FROM chapters WHERE id=%s LIMIT 1",
        (chapter_id,),
    )
    if not chapter_rows:
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter = chapter_rows[0]
    _require_story_owner(int(_row_get(chapter, "story_id") or 0), user)

    rev_rows = fetch_all(
        """
        SELECT id, chapter_id, title, content, notes, submission_status, scheduled_for
        FROM chapter_revisions
        WHERE id=%s AND chapter_id=%s
        LIMIT 1
        """,
        (revision_id, chapter_id),
    )
    if not rev_rows:
        raise HTTPException(status_code=404, detail="Revision not found")
    rev = rev_rows[0]

    # Snapshot current chapter before restore
    try:
        _record_chapter_revision(
            chapter_id,
            title=str(_row_get(chapter, "title") or ""),
            content=str(_row_get(chapter, "content") or ""),
            notes=str(_row_get(chapter, "notes") or ""),
            submission_status=str(_row_get(chapter, "submission_status") or "draft"),
            scheduled_for=_row_get(chapter, "scheduled_for"),
        )
    except Exception as exc:
        LOGGER.warning("revision snapshot before restore failed: %s", exc)

    new_title = str(_row_get(rev, "title") or _row_get(chapter, "title") or "Chapter")
    new_content = str(_row_get(rev, "content") or "")
    new_notes = str(_row_get(rev, "notes") or "")
    new_status = str(_row_get(rev, "submission_status") or "draft")
    scheduled_value = _row_get(rev, "scheduled_for")
    if isinstance(scheduled_value, datetime):
        scheduled_value = scheduled_value.isoformat()

    execute_write(
        """
        UPDATE chapters
        SET title=%s, content=%s, notes=%s, submission_status=%s, scheduled_for=%s, updated_at=CURRENT_TIMESTAMP
        WHERE id=%s
        """,
        (new_title, new_content, new_notes, new_status, scheduled_value, chapter_id),
    )
    bump_content_version()
    return {
        "ok": True,
        "message": "Revision restored — other chapters unchanged",
        "chapter": {
            "id": chapter_id,
            "title": new_title,
            "content": new_content,
            "notes": new_notes,
            "submission_status": new_status,
            "scheduled_for": _serialize_datetime(scheduled_value),
        },
    }


def _word_count(text: str) -> int:
    return len([w for w in str(text or "").split() if w.strip()])


def _promote_author_and_maybe_publish(user_id: int, story_id: int, chapter_content: str) -> None:
    """A user becomes an author after publishing one non-empty chapter.
    If story is Completed/Published and has a >=50-word chapter, keep visible.
    If story is Draft/Ongoing without enough content, stays private.
    """
    words = _word_count(chapter_content)
    if words > 0:
        try:
            execute_write(
                "UPDATE app_users SET is_author=1, is_author_active=1 WHERE id=%s",
                (user_id,),
            )
        except Exception:
            try:
                execute_write("UPDATE app_users SET is_author=1 WHERE id=%s", (user_id,))
            except Exception:
                pass
    # Visibility: only Completed/Published stories with >=50 word chapter are public
    try:
        rows = fetch_all("SELECT status_text FROM books WHERE id=%s LIMIT 1", (story_id,))
        st = str((rows[0].get("status_text") if rows else "") or "").lower()
        if st in ("completed", "complete", "published") and words >= 50:
            execute_write(
                "UPDATE books SET status_text=%s, section_name=%s WHERE id=%s",
                ("Published" if "publish" in st or st == "published" else "Completed", "recently_updated", story_id),
            )
        elif st in ("completed", "complete", "published") and words < 50:
            # Not enough content — keep private
            execute_write(
                "UPDATE books SET status_text=%s WHERE id=%s",
                ("Draft", story_id),
            )
    except Exception as exc:
        LOGGER.warning("promote visibility failed: %s", exc)


@app.post("/api/books/{book_id}/chapters/{chapter_number}/view")
def record_public_chapter_view(
    book_id: int,
    chapter_number: int,
    user: dict[str, Any] | None = Depends(optional_user),
):
    rows = fetch_all(
        """
        SELECT b.user_id, b.status_text, c.submission_status
        FROM books b
        JOIN chapters c ON c.story_id=b.id
        WHERE b.id=%s AND c.chapter_number=%s
        ORDER BY c.id
        LIMIT 1
        """,
        (book_id, chapter_number),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Chapter not found")
    owner_id = int(_row_get(rows[0], "user_id") or 0)
    if not is_public_status(str(_row_get(rows[0], "status_text") or "")):
        raise HTTPException(status_code=404, detail="Chapter not found")
    chapter_status = str(_row_get(rows[0], "submission_status") or "draft").strip().lower()
    if chapter_status not in {"published", "submitted", "ongoing", "completed"}:
        raise HTTPException(status_code=404, detail="Chapter not found")
    actor_id = int(user["user_id"]) if user else None
    if actor_id != owner_id:
        _record_writer_analytics_event(
            book_id,
            "chapter_view",
            actor_user_id=actor_id,
            chapter_number=chapter_number,
        )
        _record_writer_analytics_event(
            book_id,
            "read",
            actor_user_id=actor_id,
            chapter_number=chapter_number,
        )
    return {"ok": True}


def _require_previous_chapters_published(story_id: int, chapter_number: int, exclude_id: int | None = None) -> None:
    """Enforce sequential chapter publication for every writer API client."""
    if chapter_number <= 1:
        return
    rows = fetch_all(
        "SELECT id, chapter_number, submission_status FROM chapters WHERE story_id=%s AND chapter_number<%s ORDER BY chapter_number, sort_order, id",
        (story_id, chapter_number),
    )
    # Submitted/scheduled chapters are not public until publication completes.
    published = {"published", "submitted", "ongoing", "completed"}
    by_number: dict[int, str] = {}
    for row in rows:
        if exclude_id is not None and int(_row_get(row, "id") or 0) == exclude_id:
            continue
        number = int(_row_get(row, "chapter_number") or 0)
        by_number[number] = str(_row_get(row, "submission_status") or "draft").strip().lower()
    for number in range(1, chapter_number):
        if by_number.get(number) not in published:
            raise HTTPException(status_code=400, detail=f"Publish Chapter {number} before Chapter {chapter_number}.")


def _require_completed_story_details(story_id: int) -> None:
    """Server-side gate used before a story or chapter can become public."""
    rows = fetch_all(
        """
        SELECT title, description, genre, primary_genre, cover_path
        FROM books
        WHERE id=%s
        LIMIT 1
        """,
        (story_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Story not found")
    row = rows[0]
    missing: list[str] = []
    if not str(_row_get(row, "title") or "").strip():
        missing.append("title")
    if not str(_row_get(row, "description") or "").strip():
        missing.append("summary")
    if not str(_row_get(row, "genre") or _row_get(row, "primary_genre") or "").strip():
        missing.append("genre")
    if missing:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "STORY_DETAILS_REQUIRED",
                "message": "Complete the story details before publishing a chapter.",
                "missing": missing,
            },
        )


def _sync_story_status_from_chapters(
    story_id: int, *, chapter_was_unpublished: bool = False
) -> None:
    """Keep story publication status aligned without undoing Completed."""
    live_rows = fetch_all(
        """
        SELECT id FROM chapters
        WHERE story_id=%s
          AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
              ('published', 'submitted', 'ongoing', 'completed')
        LIMIT 1
        """,
        (story_id,),
    )
    if not live_rows:
        status = "Draft"
    else:
        first_published = fetch_all(
            """
            SELECT id FROM chapters
            WHERE story_id=%s
              AND chapter_number=1
              AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                  ('published', 'submitted', 'ongoing', 'completed')
            LIMIT 1
            """,
            (story_id,),
        )
        if not first_published:
            status = "Draft"
            execute_write("UPDATE books SET status_text=%s WHERE id=%s", (status, story_id))
            return
        story_rows = fetch_all(
            "SELECT title, description, genre, primary_genre FROM books WHERE id=%s LIMIT 1",
            (story_id,),
        )
        story_row = story_rows[0] if story_rows else {}
        details_complete = bool(
            str(_row_get(story_row, "title") or "").strip()
            and str(_row_get(story_row, "description") or "").strip()
            and str(_row_get(story_row, "genre") or _row_get(story_row, "primary_genre") or "").strip()
        )
        if not details_complete:
            status = "Draft"
            execute_write("UPDATE books SET status_text=%s WHERE id=%s", (status, story_id))
            return
        current_rows = fetch_all(
            "SELECT status_text FROM books WHERE id=%s LIMIT 1", (story_id,)
        )
        current_status = str(
            _row_get(current_rows[0], "status_text") if current_rows else ""
        ).strip().lower()
        status = (
            "Completed"
            if current_status in {"completed", "complete", "finished"}
            and not chapter_was_unpublished
            else "Ongoing"
        )
    execute_write("UPDATE books SET status_text=%s WHERE id=%s", (status, story_id))


@app.post("/api/write/stories/{story_id}/chapters")
def create_story_chapter(
    story_id: int,
    payload: ChapterCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    try:
        _require_story_owner(story_id, user)

        chapter_number = payload.chapter_number
        if chapter_number is None:
            next_rows = fetch_all(
                "SELECT COALESCE(MAX(chapter_number), 0) + 1 AS next_chapter FROM chapters WHERE story_id=%s",
                (story_id,),
            )
            chapter_number = int(next_rows[0]["next_chapter"]) if next_rows else 1

        
        # Block duplicate chapter titles within the same story (case-insensitive)
        title_norm = (payload.title or "").strip()
        if title_norm:
            dup = fetch_all(
                """
                SELECT id FROM chapters
                WHERE story_id=%s AND LOWER(TRIM(title))=LOWER(%s)
                LIMIT 1
                """,
                (story_id, title_norm),
            )
            if dup:
                raise HTTPException(
                    status_code=400,
                    detail="A chapter with this title already exists in this story. Change the title to continue.",
                )

        submission_status = (payload.submission_status or "draft").strip() or "draft"
        if submission_status.lower() in {"published", "submitted", "ongoing", "completed", "scheduled"}:
            _require_previous_chapters_published(story_id, int(chapter_number))
            _require_completed_story_details(story_id)
        scheduled_for = _parse_optional_datetime(payload.scheduled_for)
        scheduled_value = (
            scheduled_for.isoformat() if isinstance(scheduled_for, datetime) else scheduled_for
        )
        row_id, _ = execute_write(
            """
            INSERT INTO chapters (
                story_id, chapter_number, title, content, notes, submission_status, scheduled_for, sort_order
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                story_id,
                chapter_number,
                payload.title or "Untitled",
                payload.content or "",
                payload.notes or "",
                submission_status,
                scheduled_value,
                chapter_number,
            ),
        )
        try:
            import os as _os
            # Skip revision log on Vercel cold path — shaves multi-second writes
            if not (_os.getenv("VERCEL") or _os.getenv("VERCEL_ENV")):
                _record_chapter_revision(
                    row_id,
                    payload.title or "Untitled",
                    payload.content or "",
                    payload.notes or "",
                    submission_status,
                    scheduled_for,
                )
        except Exception as rev_exc:
            LOGGER.warning("Chapter revision log failed (non-fatal): %s", rev_exc)
        try:
            # Promote author + visibility rules
            owner = fetch_all("SELECT user_id FROM books WHERE id=%s LIMIT 1", (story_id,))
            uid = int(owner[0]["user_id"]) if owner and owner[0].get("user_id") else None
            if uid:
                _promote_author_and_maybe_publish(uid, story_id, payload.content or "")
        except Exception as promo_exc:
            LOGGER.warning("chapter create promote: %s", promo_exc)
        try:
            _sync_story_status_from_chapters(story_id)
        except Exception as status_exc:
            LOGGER.warning("chapter create story-status sync failed: %s", status_exc)
        if submission_status.lower() in {"published", "ongoing", "completed"}:
            _notify_saved_book_readers(
                story_id, int(chapter_number), payload.title or ""
            )
        bump_content_version()
        return {"ok": True, "id": row_id}
    except HTTPException:
        raise
    except Exception as exc:
        LOGGER.exception("create_story_chapter failed for story %s: %s", story_id, exc)
        raise HTTPException(status_code=500, detail=f"Failed to create chapter: {exc}") from exc


@app.put("/api/write/chapters/{chapter_id}")
def update_story_chapter(
    chapter_id: int,
    payload: ChapterUpdateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    rows = fetch_all("SELECT * FROM chapters WHERE id=%s", (chapter_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Chapter not found")

    current = rows[0]
    _require_story_owner(int(_row_get(current, "story_id") or 0), user)
    next_title = payload.title or current["title"]
    # Unique title within same story (allow keeping own title)
    title_norm = (next_title or "").strip()
    if title_norm:
        story_id = int(_row_get(current, "story_id") or 0)
        dup = fetch_all(
            """
            SELECT id FROM chapters
            WHERE story_id=%s AND LOWER(TRIM(title))=LOWER(%s) AND id!=%s
            LIMIT 1
            """,
            (story_id, title_norm, chapter_id),
        )
        if dup:
            raise HTTPException(
                status_code=400,
                detail="A chapter with this title already exists in this story. Change the title to continue.",
            )
    next_content = payload.content if payload.content is not None else current["content"]
    next_notes = payload.notes if payload.notes is not None else _row_get(current, "notes", "")
    next_status = (payload.submission_status or _row_get(current, "submission_status") or "draft").strip() or "draft"
    current_status = str(_row_get(current, "submission_status") or "draft").strip().lower()
    live_statuses = {"published", "submitted", "ongoing", "completed"}
    if current_status in live_statuses and next_status.lower() not in live_statuses:
        latest_live_rows = fetch_all(
            """
            SELECT id, chapter_number FROM chapters
            WHERE story_id=%s
              AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                  ('published', 'submitted', 'ongoing', 'completed')
            ORDER BY chapter_number DESC, sort_order DESC, id DESC
            LIMIT 1
            """,
            (int(_row_get(current, "story_id") or 0),),
        )
        if latest_live_rows:
            latest_id = int(_row_get(latest_live_rows[0], "id") or 0)
            latest_number = int(_row_get(latest_live_rows[0], "chapter_number") or 0)
            if latest_id != chapter_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Please unpublish the latest chapter (Chapter {latest_number}) first.",
                )
    # Validate required story metadata when a chapter is explicitly being
    # published. Ordinary autosaves/renames of an existing published chapter
    # must remain editable even if older story metadata is incomplete.
    explicitly_publishing = payload.submission_status is not None and next_status.lower() in {
        "published", "submitted", "ongoing", "completed", "scheduled"
    }
    if explicitly_publishing:
        target_number = int(payload.chapter_number if payload.chapter_number is not None else _row_get(current, "chapter_number") or 1)
        _require_previous_chapters_published(int(_row_get(current, "story_id") or 0), target_number, exclude_id=chapter_id)
        _require_completed_story_details(int(_row_get(current, "story_id") or 0))
    # A chapter moved back to a private state must no longer retain a schedule.
    # Publishing immediately also clears any old schedule.
    next_scheduled_for = (
        None
        if next_status.lower() in {
            "draft",
            "published",
            "submitted",
            "ongoing",
            "completed",
        }
        else (
            _parse_optional_datetime(payload.scheduled_for)
            if payload.scheduled_for is not None
            else _row_get(current, "scheduled_for")
        )
    )
    # Normalize scheduled_for for both SQLite (TEXT) and MySQL (DATETIME).
    scheduled_value = next_scheduled_for
    if isinstance(scheduled_value, datetime):
        scheduled_value = scheduled_value.isoformat()

    execute_write(
        """
        UPDATE chapters
        SET chapter_number=%s, title=%s, content=%s, notes=%s, submission_status=%s,
            scheduled_for=%s, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.chapter_number
            if payload.chapter_number is not None
            else current["chapter_number"],
            next_title,
            next_content,
            next_notes,
            next_status,
            scheduled_value,
            payload.chapter_number
            if payload.chapter_number is not None
            else current["sort_order"],
            chapter_id,
        ),
    )
    # Do not treat SQLite rowcount==0 as failure: identical values still succeed.
    try:
        _record_chapter_revision(
            chapter_id,
            next_title,
            next_content,
            next_notes,
            next_status,
            next_scheduled_for if isinstance(next_scheduled_for, datetime) else (
                _parse_optional_datetime(str(next_scheduled_for)) if next_scheduled_for else None
            ),
        )
    except Exception as revision_exc:
        # The chapter update is already committed. Revision history is a
        # secondary feature and must not turn a successful unpublish into an
        # apparent failure for the author.
        LOGGER.warning("Chapter revision log failed (non-fatal): %s", revision_exc)
    try:
        owner = fetch_all("SELECT user_id FROM books WHERE id=%s LIMIT 1", (_row_get(current, "story_id"),))
        uid = int(owner[0]["user_id"]) if owner and owner[0].get("user_id") else None
        if uid:
            _promote_author_and_maybe_publish(uid, int(_row_get(current, "story_id")), next_content or "")
    except Exception as promo_exc:
        LOGGER.warning("chapter update promote: %s", promo_exc)
    try:
        chapter_was_unpublished = (
            current_status in live_statuses and next_status.lower() not in live_statuses
        )
        _sync_story_status_from_chapters(
            int(_row_get(current, "story_id") or 0),
            chapter_was_unpublished=chapter_was_unpublished,
        )
    except Exception as status_exc:
        LOGGER.warning("chapter story-status sync failed: %s", status_exc)
    if (
        next_status.lower() in {"published", "ongoing", "completed"}
        and current_status not in {"published", "ongoing", "completed"}
    ):
        _notify_saved_book_readers(
            int(_row_get(current, "story_id") or 0),
            int(
                payload.chapter_number
                if payload.chapter_number is not None
                else _row_get(current, "chapter_number") or 0
            ),
            next_title,
        )
    bump_content_version()
    return {"ok": True}


@app.delete("/api/write/chapters/{chapter_id}")
def delete_story_chapter(
    chapter_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    rows = fetch_all(
        """
        SELECT c.story_id, c.submission_status
        FROM chapters c
        WHERE c.id=%s
        LIMIT 1
        """,
        (chapter_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Chapter not found")
    story_id = int(_row_get(rows[0], "story_id") or 0)
    _require_story_owner(story_id, user)
    chapter_status = (
        str(_row_get(rows[0], "submission_status") or "draft").strip().lower()
    )
    if chapter_status in {"published", "submitted", "ongoing", "completed"}:
        raise HTTPException(
            status_code=409,
            detail="Published chapters cannot be deleted directly. Please unpublish the chapter first.",
        )
    if chapter_status == "scheduled":
        raise HTTPException(
            status_code=409,
            detail="Clear the chapter schedule before deleting it.",
        )
    if chapter_status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Only draft chapters can be deleted.",
        )
    _ensure_chapter_comments_table()
    use_sqlite = _live_use_sqlite()
    connection = get_connection()
    cursor = (
        connection.cursor()
        if use_sqlite
        else connection.cursor(dictionary=True)
    )
    try:
        if use_sqlite:
            cursor.execute("BEGIN IMMEDIATE")
        else:
            connection.start_transaction()

        lock_query = """
            SELECT story_id, submission_status, chapter_number
            FROM chapters
            WHERE id=%s
            LIMIT 1
        """
        if not use_sqlite:
            lock_query += " FOR UPDATE"
        cursor.execute(_to_db_query(lock_query), (chapter_id,))
        locked_rows = cursor.fetchall()
        if not locked_rows:
            raise HTTPException(status_code=404, detail="Chapter not found")
        locked = locked_rows[0]
        locked_story_id = int(_row_get(locked, "story_id") or 0)
        if locked_story_id != story_id:
            _require_story_owner(locked_story_id, user)
            story_id = locked_story_id

        locked_status = (
            str(_row_get(locked, "submission_status") or "draft").strip().lower()
        )
        if locked_status in {"published", "submitted", "ongoing", "completed"}:
            raise HTTPException(
                status_code=409,
                detail="Published chapters cannot be deleted directly. Please unpublish the chapter first.",
            )
        if locked_status == "scheduled":
            raise HTTPException(
                status_code=409,
                detail="Clear the chapter schedule before deleting it.",
            )
        if locked_status != "draft":
            raise HTTPException(
                status_code=409,
                detail="Only draft chapters can be deleted.",
            )
        chapter_number = int(_row_get(locked, "chapter_number") or 1)

        def execute_delete_query(query: str, params: tuple[Any, ...]) -> None:
            cursor.execute(_to_db_query(query), params)

        execute_delete_query(
            """
            DELETE FROM chapter_comment_likes
            WHERE comment_id IN (
                SELECT id FROM chapter_comments WHERE chapter_id=%s
            )
            """,
            (chapter_id,),
        )
        execute_delete_query(
            "DELETE FROM chapter_comments WHERE chapter_id=%s",
            (chapter_id,),
        )
        execute_delete_query(
            "DELETE FROM chapter_revisions WHERE chapter_id=%s",
            (chapter_id,),
        )
        execute_delete_query(
            "DELETE FROM chapter_reactions WHERE book_id=%s AND chapter_number=%s",
            (story_id, chapter_number),
        )
        execute_delete_query(
            "DELETE FROM chapters WHERE id=%s AND story_id=%s AND LOWER(TRIM(COALESCE(submission_status, 'draft')))='draft'",
            (chapter_id, story_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Chapter not found")

        cursor.execute(
            _to_db_query(
                """
                SELECT id, chapter_number
                FROM chapters
                WHERE story_id=%s
                ORDER BY chapter_number, sort_order, id
                """
            ),
            (story_id,),
        )
        remaining = cursor.fetchall()
        for number, chapter in enumerate(remaining or [], start=1):
            old_number = int(_row_get(chapter, "chapter_number") or number)
            if old_number != number:
                execute_delete_query(
                    """
                    UPDATE chapter_reactions
                    SET chapter_number=%s
                    WHERE book_id=%s AND chapter_number=%s
                    """,
                    (number, story_id, old_number),
                )
                execute_delete_query(
                    "UPDATE chapters SET chapter_number=%s, sort_order=%s WHERE id=%s AND story_id=%s",
                    (
                        number,
                        number,
                        int(_row_get(chapter, "id") or 0),
                        story_id,
                    ),
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()

    _sync_story_status_from_chapters(story_id)
    bump_content_version()
    return {"ok": True}




@app.post("/api/write/stories/{story_id}/chapters/reorder")
def reorder_story_chapters(
    story_id: int,
    payload: ChapterReorderRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Reorder chapters. Updates chapter_number + sort_order. Never deletes."""
    _require_story_owner(story_id, user)
    ordered = [int(x) for x in (payload.chapter_ids or []) if int(x) > 0]
    if not ordered:
        raise HTTPException(status_code=400, detail="chapter_ids required")

    existing = fetch_all(
        "SELECT id, submission_status FROM chapters WHERE story_id=%s",
        (story_id,),
    )
    existing_ids = {int(_row_get(r, "id") or 0) for r in existing}
    live_statuses = {"published", "submitted", "ongoing", "completed"}
    status_by_id = {
        int(_row_get(r, "id") or 0): str(_row_get(r, "submission_status") or "draft").strip().lower()
        for r in existing
    }
    live_numbers: list[int] = []
    for index, chapter_id in enumerate(ordered, start=1):
        if status_by_id.get(chapter_id) in live_statuses:
            live_numbers.append(index)
    if live_numbers:
        if live_numbers[0] != 1:
            raise HTTPException(status_code=400, detail="Chapter 1 must be the first published chapter.")
        if live_numbers != list(range(1, live_numbers[-1] + 1)):
            raise HTTPException(status_code=400, detail="Reordering would break sequential chapter publication.")
    if not existing_ids:
        raise HTTPException(status_code=404, detail="No chapters for this story")
    if set(ordered) != existing_ids:
        raise HTTPException(
            status_code=400,
            detail="chapter_ids must include every chapter of this story exactly once",
        )

    for index, chapter_id in enumerate(ordered, start=1):
        execute_write(
            """
            UPDATE chapters
            SET chapter_number=%s, sort_order=%s, updated_at=CURRENT_TIMESTAMP
            WHERE id=%s AND story_id=%s
            """,
            (index, index, chapter_id, story_id),
        )
    _sync_story_status_from_chapters(story_id)
    bump_content_version()
    return {"ok": True, "chapter_count": len(ordered), "message": "Chapters reordered"}


@app.post("/api/write/stories/{story_id}/chapters/publish-all")
@app.post("/api/write/stories/{story_id}/chapters/submit-all")
def publish_all_story_chapters(
    story_id: int,
    payload: ChapterPublishAllRequest | None = None,
    user: dict[str, Any] = Depends(require_user),
):
    """Publish eligible draft chapters (min word count). Story meta + other chapters untouched."""
    _require_story_owner(story_id, user)
    _require_completed_story_details(story_id)
    body = payload or ChapterPublishAllRequest()
    min_words = max(1, int(body.min_words or 60))
    only_ids = set(int(x) for x in (body.chapter_ids or []) if int(x) > 0)

    rows = fetch_all(
        """
        SELECT id, title, content, submission_status, chapter_number
        FROM chapters
        WHERE story_id=%s
        ORDER BY chapter_number, sort_order, id
        """,
        (story_id,),
    )
    submitted = []
    skipped = []
    for row in rows:
        cid = int(_row_get(row, "id") or 0)
        if only_ids and cid not in only_ids:
            continue
        status = str(_row_get(row, "submission_status") or "draft").strip().lower()
        if status in ("published", "submitted", "ongoing", "completed", "scheduled"):
            skipped.append({"id": cid, "reason": "already_public"})
            continue
        chapter_number = int(_row_get(row, "chapter_number") or 0)
        try:
            _require_previous_chapters_published(story_id, chapter_number, exclude_id=cid)
        except HTTPException as exc:
            skipped.append({"id": cid, "reason": "previous_chapter_unpublished", "detail": str(exc.detail)})
            continue
        content = str(_row_get(row, "content") or "").strip()
        words = len([w for w in content.split() if w])
        if words < min_words:
            skipped.append({"id": cid, "reason": f"below_{min_words}_words", "words": words})
            continue
        execute_write(
            """
            UPDATE chapters
            SET submission_status=%s, scheduled_for=NULL, updated_at=CURRENT_TIMESTAMP
            WHERE id=%s AND story_id=%s
            """,
            ("published", cid, story_id),
        )
        submitted.append(cid)

    if submitted:
        # Promote story to Ongoing if it was Draft — never wipe chapters
        try:
            _sync_story_status_from_chapters(story_id)
        except Exception as exc:
            LOGGER.warning("publish-all story status sync: %s", exc)
        for chapter_id in submitted:
            published_rows = fetch_all(
                "SELECT chapter_number, title FROM chapters WHERE id=%s LIMIT 1",
                (chapter_id,),
            )
            if published_rows:
                _notify_saved_book_readers(
                    story_id,
                    int(_row_get(published_rows[0], "chapter_number") or 0),
                    str(_row_get(published_rows[0], "title") or ""),
                )
        bump_content_version()

    return {
        "ok": True,
        "published_ids": submitted,
        "published_count": len(submitted),
        # Keep legacy response fields for installed mobile clients.
        "submitted_ids": submitted,
        "submitted_count": len(submitted),
        "skipped": skipped,
        "message": f"Published {len(submitted)} chapter(s) — others unchanged",
    }


def _ensure_tags_exist(names: list[str]) -> list[int]:
    normalized = [name.strip().lstrip('#') for name in names if name.strip()]
    if not normalized:
        return []

    placeholders = ",".join(["%s"] * len(normalized))
    existing = fetch_all(
        f"SELECT id, name FROM tags WHERE name IN ({placeholders})",
        tuple(normalized),
    )
    name_to_id = {row["name"]: row["id"] for row in existing}
    for name in normalized:
        if name not in name_to_id:
            execute_write(
                "INSERT INTO tags (name) VALUES (%s)",
                (name,),
            )

    all_rows = fetch_all(
        f"SELECT id, name FROM tags WHERE name IN ({placeholders})",
        tuple(normalized),
    )
    return [row["id"] for row in all_rows]


def _story_tag_ids(tag_names: list[str] | None) -> list[int]:
    """Resolve at most three existing admin-created hashtags, case-insensitively."""
    normalized = []
    seen = set()
    for raw_name in tag_names or []:
        name = str(raw_name or "").strip().lstrip("#").strip()
        key = name.casefold()
        if name and key not in seen:
            normalized.append(name)
            seen.add(key)
    if len(normalized) > 3:
        raise HTTPException(status_code=400, detail="A story can have at most 3 hashtags.")
    if not normalized:
        return []

    placeholders = ",".join(["%s"] * len(normalized))
    rows = fetch_all(
        f"SELECT id, name FROM tags WHERE LOWER(name) IN ({placeholders})",
        tuple(name.lower() for name in normalized),
    ) or []
    by_name = {
        str(_row_get(row, "name") or "").strip().casefold(): int(_row_get(row, "id"))
        for row in rows
        if _row_get(row, "id") is not None
    }
    missing = [name for name in normalized if name.casefold() not in by_name]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown hashtag(s): {', '.join(missing)}. Choose hashtags created by an admin.",
        )
    return [by_name[name.casefold()] for name in normalized]


def _set_story_tags(story_id: int, tag_names: list[str] | None) -> None:
    """Replace a story's hashtag links with existing admin-created hashtags."""
    if tag_names is None:
        return
    tag_ids = _story_tag_ids(tag_names)
    execute_write("DELETE FROM book_tags WHERE book_id=%s", (story_id,))
    for tag_id in tag_ids:
        if _live_use_sqlite():
            execute_write(
                "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (%s, %s)",
                (story_id, tag_id),
            )
        else:
            execute_write(
                "INSERT IGNORE INTO book_tags (book_id, tag_id) VALUES (%s, %s)",
                (story_id, tag_id),
            )

def _story_tags_for_book(book_id: int) -> list[str]:
    rows = fetch_all(
        "SELECT t.name FROM tags t JOIN book_tags bt ON bt.tag_id = t.id WHERE bt.book_id=%s ORDER BY t.name",
        (book_id,),
    )
    return [row["name"] for row in rows]


def _row_get(row: Any, key: str, default: Any = None) -> Any:
    if isinstance(row, dict):
        return row.get(key, default)
    try:
        return row[key]
    except (KeyError, IndexError):
        return default




def _ensure_book_meta_columns() -> None:
    """Best-effort writer metadata columns on books."""
    for sql in (
        "ALTER TABLE books ADD COLUMN audience VARCHAR(64) NULL",
        "ALTER TABLE books ADD COLUMN language VARCHAR(64) NULL",
        "ALTER TABLE books ADD COLUMN writer_settings TEXT NULL",
    ):
        try:
            execute_write(sql, ())
        except Exception:
            pass


def _ensure_book_view_count_column() -> None:
    """Add books.view_count if missing (MySQL / SQLite)."""
    try:
        rows = fetch_all("SELECT view_count FROM books LIMIT 1")
        _ = rows
    except Exception:
        try:
            execute_write("ALTER TABLE books ADD COLUMN view_count INT NOT NULL DEFAULT 0")
        except Exception:
            try:
                execute_write("ALTER TABLE books ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0")
            except Exception as exc:
                LOGGER.warning("ensure view_count column: %s", exc)


def _live_book_reviews_count(book_id: int | None) -> int:
    if not book_id:
        return 0
    try:
        rows = fetch_all(
            "SELECT COUNT(*) AS c FROM book_reviews WHERE book_id=%s",
            (int(book_id),),
        )
        if rows:
            return int(_row_get(rows[0], "c") or 0)
    except Exception as exc:
        LOGGER.warning("live reviews_count failed for book %s: %s", book_id, exc)
    return 0


def _increment_book_views(book_id: int) -> int:
    """Bump view_count and return new value."""
    _ensure_book_view_count_column()
    try:
        execute_write(
            "UPDATE books SET view_count = COALESCE(view_count, 0) + 1 WHERE id=%s",
            (int(book_id),),
        )
        rows = fetch_all("SELECT view_count FROM books WHERE id=%s", (int(book_id),))
        if rows:
            return int(_row_get(rows[0], "view_count") or 0)
    except Exception as exc:
        LOGGER.warning("increment views failed for book %s: %s", book_id, exc)
    return 0


_WRITER_ANALYTICS_TABLE_READY = False


def _ensure_writer_analytics_table() -> None:
    global _WRITER_ANALYTICS_TABLE_READY
    if _WRITER_ANALYTICS_TABLE_READY:
        return
    execute_write(
        """
        CREATE TABLE IF NOT EXISTS writer_analytics_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            story_id INT NOT NULL,
            chapter_number INT NOT NULL DEFAULT 0,
            actor_key BIGINT NOT NULL DEFAULT 0,
            event_type VARCHAR(24) NOT NULL,
            event_date DATE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_writer_event_day
                (story_id, chapter_number, actor_key, event_type, event_date),
            INDEX idx_writer_event_date (story_id, event_date, event_type)
        )
        """,
        (),
    )
    _WRITER_ANALYTICS_TABLE_READY = True


def _record_writer_analytics_event(
    story_id: int,
    event_type: str,
    *,
    actor_user_id: int | None = None,
    chapter_number: int = 0,
) -> None:
    try:
        _ensure_writer_analytics_table()
        execute_write(
            """
            INSERT IGNORE INTO writer_analytics_events
                (story_id, chapter_number, actor_key, event_type, event_date)
            VALUES (%s, %s, %s, %s, UTC_DATE())
            """,
            (
                int(story_id),
                max(0, int(chapter_number)),
                max(0, int(actor_user_id or 0)),
                event_type,
            ),
        )
    except Exception as exc:
        LOGGER.warning(
            "writer analytics event could not be recorded for story %s (%s): %s",
            story_id,
            event_type,
            exc,
        )


def _writer_event_metric(event_type: str) -> tuple[str | None, int]:
    if event_type in ("view", "chapter_view"):
        return "views", 1
    if event_type == "read":
        return "reads", 1
    if event_type in ("like", "unlike"):
        return "likes", -1 if event_type == "unlike" else 1
    if event_type in ("comment", "follow", "unfollow"):
        return ("comments", 1) if event_type == "comment" else (
            "follows", -1 if event_type == "unfollow" else 1
        )
    return None, 0


@app.get("/api/write/analytics")
def get_writer_analytics(
    period: str = Query(default="30d"),
    user: dict[str, Any] = Depends(require_user),
):
    """Return private, owner-scoped writing analytics and date-bucketed activity."""
    days = {"7d": 7, "30d": 30, "90d": 90, "365d": 365}.get(period, 30)
    _ensure_book_view_count_column()
    _ensure_book_likes_table()
    _ensure_chapter_comments_table()
    _ensure_author_follows_table()
    _ensure_writer_analytics_table()
    owner_id = int(user["user_id"])
    today_utc = datetime.now(timezone.utc).date()
    start_day = today_utc - timedelta(days=days - 1)
    start_date = start_day.isoformat()
    previous_start = (today_utc - timedelta(days=days * 2 - 1)).isoformat()
    previous_end = (start_day - timedelta(days=1)).isoformat()

    overview_rows = fetch_all(
        """
        SELECT
            COALESCE(SUM(b.view_count), 0) AS views,
            (SELECT COUNT(*) FROM writer_analytics_events e
             JOIN books eb ON eb.id=e.story_id
             WHERE eb.user_id=%s AND e.event_type='read') AS reads,
            (SELECT COUNT(*) FROM book_likes l
             JOIN books lb ON lb.id=l.book_id WHERE lb.user_id=%s) AS likes,
            (SELECT COUNT(*) FROM book_reviews r
             JOIN books rb ON rb.id=r.book_id WHERE rb.user_id=%s)
              + (SELECT COUNT(*) FROM chapter_comments cc
                 JOIN books cb ON cb.id=cc.book_id WHERE cb.user_id=%s) AS comments,
            (SELECT COUNT(*) FROM author_follows WHERE author_id=%s) AS followers,
            COUNT(DISTINCT CASE
                WHEN LOWER(TRIM(COALESCE(b.status_text, '')))
                     IN ('ongoing', 'completed', 'complete', 'finished', 'published',
                         'publish', 'live', 'public', 'submitted')
                THEN b.id END) AS published_stories,
            (SELECT COUNT(*) FROM chapters c
             JOIN books cb ON cb.id=c.story_id
             WHERE cb.user_id=%s
               AND LOWER(TRIM(COALESCE(c.submission_status, 'draft')))
                   IN ('published', 'submitted', 'ongoing', 'completed')) AS published_chapters
        FROM books b
        WHERE b.user_id=%s
        """,
        (owner_id, owner_id, owner_id, owner_id, owner_id, owner_id, owner_id),
    )
    overview_row = overview_rows[0] if overview_rows else {}

    story_rows = fetch_all(
        """
        SELECT b.id, b.title, b.cover_path, b.status_text,
               COALESCE(b.view_count, 0) AS views,
               (SELECT COUNT(*) FROM writer_analytics_events e
                WHERE e.story_id=b.id AND e.event_type='read') AS reads,
               (SELECT COUNT(*) FROM book_likes l WHERE l.book_id=b.id) AS likes,
               (SELECT COUNT(*) FROM book_reviews r WHERE r.book_id=b.id)
                 + (SELECT COUNT(*) FROM chapter_comments cc WHERE cc.book_id=b.id) AS comments,
               (SELECT COUNT(*) FROM chapters c
                WHERE c.story_id=b.id
                  AND LOWER(TRIM(COALESCE(c.submission_status, 'draft')))
                      IN ('published', 'submitted', 'ongoing', 'completed')) AS published_chapters
        FROM books b
        WHERE b.user_id=%s
        ORDER BY b.id DESC
        """,
        (owner_id,),
    )
    chapter_rows = fetch_all(
        """
        SELECT c.story_id, c.chapter_number, c.title,
               SUM(CASE WHEN e.event_type='chapter_view' THEN 1 ELSE 0 END) AS views,
               SUM(CASE WHEN e.event_type='read' THEN 1 ELSE 0 END) AS reads,
               (SELECT COUNT(*) FROM chapter_reactions cr
                WHERE cr.book_id=c.story_id AND cr.chapter_number=c.chapter_number) AS likes,
               (SELECT COUNT(*) FROM chapter_comments cc
                WHERE cc.chapter_id=c.id) AS comments
        FROM chapters c
        JOIN books b ON b.id=c.story_id AND b.user_id=%s
        LEFT JOIN writer_analytics_events e
          ON e.story_id=c.story_id AND e.chapter_number=c.chapter_number
         AND e.event_date >= %s
        GROUP BY c.id, c.story_id, c.chapter_number, c.title
        ORDER BY c.story_id, c.chapter_number, c.sort_order, c.id
        """,
        (owner_id, start_date),
    )
    chapters_by_story: dict[int, list[dict[str, Any]]] = {}
    for row in chapter_rows:
        story_id = int(_row_get(row, "story_id") or 0)
        chapters_by_story.setdefault(story_id, []).append({
            "chapter_number": int(_row_get(row, "chapter_number") or 0),
            "title": _row_get(row, "title") or "",
            "views": int(_row_get(row, "views") or 0),
            "reads": int(_row_get(row, "reads") or 0),
            "likes": int(_row_get(row, "likes") or 0),
            "comments": int(_row_get(row, "comments") or 0),
        })

    event_rows = fetch_all(
        """
        SELECT e.event_date, e.event_type,
               CASE WHEN e.event_type IN ('follow', 'unfollow')
                    THEN COUNT(DISTINCT e.actor_key)
                    ELSE COUNT(*) END AS total
        FROM writer_analytics_events e
        JOIN books b ON b.id=e.story_id
        WHERE b.user_id=%s AND e.event_date >= %s
        GROUP BY e.event_date, e.event_type
        ORDER BY e.event_date
        """,
        (owner_id, start_date),
    )
    previous_event_rows = fetch_all(
        """
        SELECT e.event_type,
               CASE WHEN e.event_type IN ('follow', 'unfollow')
                    THEN COUNT(DISTINCT e.actor_key)
                    ELSE COUNT(*) END AS total
        FROM writer_analytics_events e
        JOIN books b ON b.id=e.story_id
        WHERE b.user_id=%s AND e.event_date BETWEEN %s AND %s
        GROUP BY e.event_type
        """,
        (owner_id, previous_start, previous_end),
    )
    story_event_rows = fetch_all(
        """
        SELECT e.story_id, e.event_date, e.event_type, COUNT(*) AS total
        FROM writer_analytics_events e
        JOIN books b ON b.id=e.story_id
        WHERE b.user_id=%s AND e.event_date >= %s
        GROUP BY e.story_id, e.event_date, e.event_type
        ORDER BY e.story_id, e.event_date
        """,
        (owner_id, start_date),
    )
    story_series: dict[int, dict[str, dict[str, Any]]] = {}
    for row in story_event_rows:
        story_id = int(_row_get(row, "story_id") or 0)
        date_value = _row_get(row, "event_date")
        date_key = date_value.isoformat() if hasattr(date_value, "isoformat") else str(date_value)
        points = story_series.setdefault(story_id, {})
        point = points.setdefault(date_key, {
            "date": date_key,
            "views": 0,
            "reads": 0,
            "likes": 0,
            "comments": 0,
            "follows": 0,
        })
        event_type = str(_row_get(row, "event_type") or "")
        target_type, direction = _writer_event_metric(event_type)
        if target_type in point:
            point[target_type] += direction * int(_row_get(row, "total") or 0)
    series_by_date: dict[str, dict[str, Any]] = {}
    for row in event_rows:
        date_value = _row_get(row, "event_date")
        date_key = date_value.isoformat() if hasattr(date_value, "isoformat") else str(date_value)
        point = series_by_date.setdefault(date_key, {
            "date": date_key,
            "views": 0,
            "reads": 0,
            "likes": 0,
            "comments": 0,
            "follows": 0,
        })
        event_type = str(_row_get(row, "event_type") or "")
        target_type, direction = _writer_event_metric(event_type)
        if target_type in point:
            point[target_type] += direction * int(_row_get(row, "total") or 0)
    activity_totals = {
        "views": sum(point["views"] for point in series_by_date.values()),
        "reads": sum(point["reads"] for point in series_by_date.values()),
        "likes": sum(point["likes"] for point in series_by_date.values()),
        "comments": sum(point["comments"] for point in series_by_date.values()),
        "follows": sum(point["follows"] for point in series_by_date.values()),
    }
    previous_totals = {key: 0 for key in activity_totals}
    for row in previous_event_rows:
        event_type = str(_row_get(row, "event_type") or "")
        target_type, direction = _writer_event_metric(event_type)
        if target_type in previous_totals:
            previous_totals[target_type] += direction * int(_row_get(row, "total") or 0)

    return {
        "period": f"{days}d",
        "comparison": {"current": activity_totals, "previous": previous_totals},
        "overview": {
            "views": int(_row_get(overview_row, "views") or 0),
            "reads": int(_row_get(overview_row, "reads") or 0),
            "likes": int(_row_get(overview_row, "likes") or 0),
            "comments": int(_row_get(overview_row, "comments") or 0),
            "followers": int(_row_get(overview_row, "followers") or 0),
            "published_stories": int(_row_get(overview_row, "published_stories") or 0),
            "published_chapters": int(_row_get(overview_row, "published_chapters") or 0),
        },
        "stories": [
            {
                "id": int(_row_get(row, "id") or 0),
                "title": _row_get(row, "title") or "Untitled story",
                "cover_path": _row_get(row, "cover_path") or "",
                "status": _row_get(row, "status_text") or "Draft",
                "views": int(_row_get(row, "views") or 0),
                "reads": int(_row_get(row, "reads") or 0),
                "likes": int(_row_get(row, "likes") or 0),
                "comments": int(_row_get(row, "comments") or 0),
                "published_chapters": int(_row_get(row, "published_chapters") or 0),
                "chapters": chapters_by_story.get(int(_row_get(row, "id") or 0), []),
                "series": list(story_series.get(int(_row_get(row, "id") or 0), {}).values()),
            }
            for row in story_rows
        ],
        "series": list(series_by_date.values()),
    }


def _live_book_likes_count(book_id: int | None) -> int:
    """Count likes from book_likes table (source of truth)."""
    if book_id is None:
        return 0
    try:
        _ensure_book_likes_table()
        count_rows = fetch_all(
            "SELECT COUNT(*) AS c FROM book_likes WHERE book_id=%s",
            (int(book_id),),
        )
        return int(count_rows[0]["c"]) if count_rows else 0
    except Exception as exc:
        LOGGER.warning("live likes_count failed for book %s: %s", book_id, exc)
        return 0



def _serialize_book_light(row: Any) -> dict[str, Any]:
    """List-card serialization — no per-row COUNT/tag queries (fast)."""
    data = dict(row) if not isinstance(row, dict) else dict(row)
    cover = _normalize_cover_path(_row_get(row, "cover_path") or "")
    return {
        "id": _row_get(row, "id"),
        "user_id": _row_get(row, "user_id"),
        "author_user_id": _row_get(row, "user_id") or data.get("author_user_id"),
        "title": _row_get(row, "title") or data.get("title") or "Untitled",
        "author": _row_get(row, "author") or data.get("author") or "Author",
        "description": (_row_get(row, "description") or data.get("description") or "")[:400],
        "genre": _row_get(row, "genre") or data.get("genre") or "",
        "cover_path": cover,
        "accent_hex": _row_get(row, "accent_hex") or data.get("accent_hex") or "#00A88E",
        "status_text": _row_get(row, "status_text") or data.get("status_text") or "",
        "rating": _row_get(row, "rating") or data.get("rating") or "",
        "primary_genre": _row_get(row, "primary_genre") or data.get("primary_genre") or "",
        "secondary_genre": _row_get(row, "secondary_genre") or data.get("secondary_genre") or "",
        "is_completed": bool(_row_get(row, "is_completed") or data.get("is_completed") or 0),
        "likes_count": 0,
        "reviews_count": 0,
        "view_count": int(_row_get(row, "view_count") or data.get("view_count") or 0),
        "created_at": str(_row_get(row, "created_at") or data.get("created_at") or ""),
        "updated_at": str(_row_get(row, "updated_at") or data.get("updated_at") or ""),
        "tags": [],
    }


def _serialize_book(row: Any) -> dict[str, Any]:
    data = dict(row) if not isinstance(row, dict) else dict(row)
    book_id = _row_get(row, "id")
    live_likes = _live_book_likes_count(book_id)
    live_reviews = _live_book_reviews_count(book_id)
    try:
        view_count = int(_row_get(row, "view_count") or data.get("view_count") or 0)
    except Exception:
        view_count = 0
    # Author photo: prefer join column, then nested keys
    author_photo = (
        _row_get(row, "author_photo_url")
        or data.get("author_photo_url")
        or data.get("photo_url")
        or ""
    )
    if author_photo:
        author_photo = _normalize_cover_path(str(author_photo))
    warnings = str(
        _row_get(row, "content_warnings")
        or data.get("content_warnings")
        or data.get("content_warning")
        or ""
    ).strip()
    last_updated = (
        _serialize_datetime(_row_get(row, "updated_at"))
        if _row_get(row, "updated_at") is not None
        else str(data.get("last_updated") or data.get("updated_at") or "")
    )
    return {
        **data,
        "cover_path": _normalize_cover_path(_row_get(row, "cover_path")),
        "author_user_id": _row_get(row, "user_id") or data.get("author_user_id"),
        "author_photo_url": author_photo or "",
        "content_warnings": warnings,
        "content_warning": warnings,  # alias for clients
        "last_updated": last_updated,
        "tags": _story_tags_for_book(book_id),
        "likes_count": live_likes,
        "likes": live_likes,  # alias used by some clients
        "view_count": view_count,
        "views": view_count,
        "reviews_count": live_reviews,
        "review_count": live_reviews,
    }




@app.post("/api/write/stories")
def create_writer_story(
    payload: StoryCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    _story_tag_ids(payload.tags)
    tags_clean = [str(t).strip().lstrip("#") for t in (payload.tags or []) if str(t).strip()]
    # Tags optional on create — author can add later in settings
    cover = _normalize_cover_path(payload.cover_path or "")
    warnings = (payload.content_warnings or "").strip()
    title = (payload.title or "").strip() or "Untitled Story"
    author = (payload.author or "").strip() or "Author"
    description = (payload.description or "").strip()
    genre = (payload.genre or "").strip()
    # Draft by default. Visible to others only when status is Published/Completed
    # (requires at least one chapter with >= 50 words — enforced on chapter save / Complete).
    status = "Draft"
    story_id, _ = execute_write(
        """
        INSERT INTO books (
            user_id, title, author, description, cover_path, accent_hex, section_name,
            status_text, rating, genre, primary_genre, cta_label, sort_order, content_warnings
        )
        VALUES (%s, %s, %s, %s, %s, '#557E7A', 'recently_updated', %s, 0.0, %s, %s, 'Read now', 999, %s)
        """,
        (
            user["user_id"],
            title,
            author,
            description,
            cover,
            status,
            genre,
            genre,
            warnings,
        ),
    )
    _set_story_tags(story_id, payload.tags)
    if status == "Published":
        try:
            execute_write(
                "UPDATE books SET section_name=%s, sort_order=%s WHERE id=%s",
                ("recently_updated", 0, story_id),
            )
        except Exception:
            pass
    try:
        _ensure_book_meta_columns()
        aud = (payload.audience or "").strip() or "All Ages"
        lang = (payload.language or "").strip()
        execute_write(
            "UPDATE books SET audience=%s, language=%s WHERE id=%s",
            (aud, lang, story_id),
        )
    except Exception as _meta_exc:
        LOGGER.warning("create story meta save: %s", _meta_exc)
    # Author flag is set when first chapter with >= 50 words is saved (see chapter endpoints).
    bump_content_version()
    return {"ok": True, "id": story_id, "status_text": status}


@app.put("/api/write/stories/{story_id}")
@app.patch("/api/write/stories/{story_id}")
def update_writer_story(
    story_id: int,
    payload: StoryUpdateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Partial meta update only. Never deletes, inserts, or replaces chapters (Inkitt-style contract)."""
    rows = fetch_all(
        "SELECT * FROM books WHERE id=%s AND (user_id=%s OR user_id IS NULL)",
        (story_id, user["user_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Story not found")

    current = rows[0]
    if payload.tags is not None:
        _story_tag_ids(payload.tags)
    requested_status = (
        normalize_story_status(payload.status_text)
        if payload.status_text is not None
        else None
    )
    if requested_status is not None and requested_status.lower() == "draft":
        live_rows = fetch_all(
            """
            SELECT id FROM chapters
            WHERE story_id=%s
              AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                  ('published', 'submitted', 'ongoing', 'completed')
            LIMIT 1
            """,
            (story_id,),
        )
        if live_rows:
            requested_status = "Ongoing"
    if payload.status_text is not None and normalize_story_status(payload.status_text).lower() in {
        "published", "ongoing", "completed"
    }:
        next_title = payload.title if payload.title is not None else _row_get(current, "title")
        next_description = payload.description if payload.description is not None else _row_get(current, "description")
        next_genre = payload.genre if payload.genre is not None else (_row_get(current, "genre") or _row_get(current, "primary_genre"))
        if not str(next_title or "").strip() or not str(next_description or "").strip() or not str(
            next_genre or ""
        ).strip():
            raise HTTPException(status_code=400, detail="Complete the story summary and primary genre before publishing.")
        first_chapter = fetch_all(
            """
            SELECT id FROM chapters
            WHERE story_id=%s AND chapter_number=1
              AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                  ('published', 'submitted', 'ongoing', 'completed')
            LIMIT 1
            """,
            (story_id,),
        )
        if not first_chapter:
            raise HTTPException(status_code=400, detail="Publish Chapter 1 before publishing the story.")
    sets: list[str] = []
    params: list[Any] = []

    if payload.title is not None:
        sets.append("title=%s")
        params.append((payload.title or "").strip() or (_row_get(current, "title") or "Untitled Story"))
    if payload.author is not None:
        sets.append("author=%s")
        params.append((payload.author or "").strip() or (_row_get(current, "author") or "Author"))
    if payload.description is not None:
        sets.append("description=%s")
        params.append(payload.description)
    if payload.genre is not None:
        sets.append("genre=%s")
        params.append((payload.genre or "").strip())
        sets.append("primary_genre=%s")
        params.append((payload.genre or "").strip())
    if payload.cover_path is not None:
        sets.append("cover_path=%s")
        params.append(_normalize_cover_path(payload.cover_path))
    if payload.content_warnings is not None:
        sets.append("content_warnings=%s")
        params.append(
            payload.content_warnings.strip()
            if isinstance(payload.content_warnings, str)
            else payload.content_warnings
        )
    if payload.status_text is not None:
        sets.append("status_text=%s")
        params.append(requested_status or normalize_story_status(payload.status_text))
    if payload.audience is not None:
        sets.append("audience=%s")
        params.append(payload.audience or "")
    if payload.language is not None:
        sets.append("language=%s")
        params.append(payload.language or "")
    if payload.writer_settings is not None:
        sets.append("writer_settings=%s")
        params.append(json.dumps(payload.writer_settings, ensure_ascii=False, separators=(",", ":")))

    sets.append("user_id=%s")
    params.append(user["user_id"])

    if sets:
        _ensure_book_meta_columns()
        sql = f"UPDATE books SET {', '.join(sets)} WHERE id=%s"
        params.append(story_id)
        try:
            execute_write(sql, tuple(params))
        except Exception as exc:
            LOGGER.warning("partial story update retry without meta cols: %s", exc)
            optional_meta = ("audience", "language", "writer_settings")
            safe_sets = [s for s in sets if not s.startswith(optional_meta)]
            if safe_sets:
                safe_params: list[Any] = []
                i = 0
                for s in sets:
                    if s.startswith(optional_meta):
                        i += 1
                        continue
                    safe_params.append(params[i])
                    i += 1
                safe_params.append(story_id)
                execute_write(
                    f"UPDATE books SET {', '.join(safe_sets)} WHERE id=%s",
                    tuple(safe_params),
                )

    _sync_story_status_from_chapters(story_id)

    if payload.tags is not None:
        _set_story_tags(story_id, payload.tags)

    # Count only — NEVER delete/insert chapters on details update (Inkitt contract).
    chapter_count = 0
    try:
        cnt_rows = fetch_all(
            "SELECT COUNT(*) AS c FROM chapters WHERE story_id=%s",
            (story_id,),
        )
        chapter_count = int((cnt_rows[0].get("c") if cnt_rows else 0) or 0)
        if chapter_count == 0:
            # Legacy schema: some DBs used book_id
            try:
                cnt2 = fetch_all(
                    "SELECT COUNT(*) AS c FROM chapters WHERE book_id=%s",
                    (story_id,),
                )
                chapter_count = int((cnt2[0].get("c") if cnt2 else 0) or 0)
            except Exception:
                pass
    except Exception:
        try:
            cnt_rows = fetch_all(
                "SELECT COUNT(*) AS c FROM chapters WHERE book_id=%s",
                (story_id,),
            )
            chapter_count = int((cnt_rows[0].get("c") if cnt_rows else 0) or 0)
        except Exception:
            chapter_count = 0

    bump_content_version()
    return {
        "ok": True,
        "message": "Details updated — chapters unchanged",
        "story_id": story_id,
        "chapter_count": chapter_count,
        "chapters_untouched": True,
    }


@app.get("/api/write/stories/{story_id}")
def get_writer_story(story_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_book_meta_columns()
    try:
        rows = fetch_all(
            """
            SELECT id, user_id, title, author, description, genre, cover_path, accent_hex,
                   status_text, rating, content_warnings, audience, language, writer_settings
            FROM books WHERE id=%s LIMIT 1
            """,
            (story_id,),
        )
    except Exception:
        rows = fetch_all(
            "SELECT id, user_id, title, author, description, genre, cover_path, accent_hex, status_text, rating, content_warnings FROM books WHERE id=%s LIMIT 1",
            (story_id,),
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Story not found")
    story = dict(rows[0]) if not isinstance(rows[0], dict) else dict(rows[0])
    # Owner-only
    try:
        if int(_row_get(rows[0], "user_id") or 0) != int(user["user_id"]):
            raise HTTPException(status_code=403, detail="Not your story")
    except HTTPException:
        raise
    except Exception:
        pass
    out = {
        "id": _row_get(rows[0], "id"),
        "user_id": _row_get(rows[0], "user_id"),
        "title": _row_get(rows[0], "title") or "",
        "author": _row_get(rows[0], "author") or "",
        "description": _row_get(rows[0], "description") or "",
        "genre": _row_get(rows[0], "genre") or "",
        "cover_path": _normalize_cover_path(_row_get(rows[0], "cover_path")),
        "accent_hex": _row_get(rows[0], "accent_hex") or "#A1A1A1",
        "status_text": _row_get(rows[0], "status_text") or "Draft",
        "content_warnings": str(_row_get(rows[0], "content_warnings") or ""),
        "audience": str(_row_get(rows[0], "audience") or story.get("audience") or ""),
        "language": str(_row_get(rows[0], "language") or story.get("language") or ""),
        "tags": _story_tags_for_book(int(story_id)),
    }
    raw_settings = _row_get(rows[0], "writer_settings") or story.get("writer_settings") or "{}"
    try:
        parsed_settings = json.loads(raw_settings) if isinstance(raw_settings, str) else raw_settings
        out["writer_settings"] = parsed_settings if isinstance(parsed_settings, dict) else {}
    except (TypeError, ValueError):
        out["writer_settings"] = {}
    return out


@app.get("/api/books/{book_id}")
def get_public_book(book_id: int, user: dict[str, Any] | None = Depends(optional_user)):
    """Public book detail — Draft only visible to owner; never 500."""
    try:
        _ensure_book_view_count_column()
    except Exception:
        pass
    try:
        rows = fetch_all(
            """
            SELECT b.id, b.user_id, b.title, b.author, b.description, b.genre, b.cover_path,
                   b.accent_hex, b.status_text, b.rating, b.content_warnings,
                   COALESCE(b.view_count, 0) AS view_count,
                   u.photo_url AS author_photo_url,
                   u.display_name AS author_display_name
            FROM books b
            LEFT JOIN app_users u ON u.id = b.user_id
            WHERE b.id=%s
            """,
            (book_id,),
        )
    except Exception as exc:
        LOGGER.warning("get_public_book join failed, fallback: %s", exc)
        rows = fetch_all(
            """
            SELECT id, user_id, title, author, description, genre, cover_path,
                   accent_hex, status_text, rating, content_warnings
            FROM books WHERE id=%s
            """,
            (book_id,),
        )
    if not rows:
        raise HTTPException(status_code=404, detail="Book not found")
    status_raw = str(_row_get(rows[0], "status_text") or "")
    owner_id = int(_row_get(rows[0], "user_id") or 0)
    current_uid = int(user["user_id"]) if user and user.get("user_id") is not None else 0
    is_owner = current_uid > 0 and owner_id == current_uid
    if not is_public_status(status_raw) and not is_owner:
        live_chapters = fetch_all(
            """
            SELECT id FROM chapters
            WHERE story_id=%s
              AND LOWER(TRIM(COALESCE(submission_status, 'draft'))) IN
                  ('published', 'submitted', 'ongoing', 'completed')
            LIMIT 1
            """,
            (book_id,),
        )
        if not live_chapters:
            raise HTTPException(status_code=404, detail="Book not found")
    try:
        new_views = _increment_book_views(book_id)
    except Exception:
        new_views = int(_row_get(rows[0], "view_count") or 0)
    if not is_owner:
        _record_writer_analytics_event(
            book_id,
            "view",
            actor_user_id=current_uid or None,
        )
    try:
        data = _serialize_book(rows[0])
    except Exception as ser_exc:
        LOGGER.warning("serialize_book failed for %s: %s", book_id, ser_exc)
        r = rows[0]
        data = {
            "id": _row_get(r, "id"),
            "title": _row_get(r, "title") or "",
            "author": _row_get(r, "author") or "",
            "description": _row_get(r, "description") or "",
            "genre": _row_get(r, "genre") or "",
            "cover_path": _normalize_cover_path(_row_get(r, "cover_path") or ""),
            "status_text": _row_get(r, "status_text") or "",
            "rating": float(_row_get(r, "rating") or 0),
            "content_warnings": _row_get(r, "content_warnings") or "",
            "author_user_id": _row_get(r, "user_id"),
            "tags": [],
            "likes_count": 0,
            "view_count": new_views,
        }
    data["view_count"] = new_views
    data["views"] = new_views
    disp = str(_row_get(rows[0], "author_display_name") or "").strip()
    book_author = str(data.get("author") or "").strip()
    if disp and (
        not book_author
        or book_author.lower() in ("author", "unknown", "untitled")
    ):
        data["author"] = disp
    elif disp and book_author:
        # Prefer profile display name for readers
        data["author"] = disp
    data["author_display_name"] = disp or book_author
    return data



def _ensure_tags_schema() -> None:
    """Ensure tags table has description + cover_path (fixes 1054 on /api/tags)."""
    try:
        if _live_use_sqlite():
            info = fetch_all("PRAGMA table_info(tags)") or []
            names = set()
            for col in info:
                n = col.get("name") if isinstance(col, dict) else (col[1] if col and len(col) > 1 else None)
                if n:
                    names.add(n)
            if "description" not in names:
                execute_write("ALTER TABLE tags ADD COLUMN description TEXT NOT NULL DEFAULT ''", ())
            if "cover_path" not in names:
                execute_write("ALTER TABLE tags ADD COLUMN cover_path TEXT NOT NULL DEFAULT ''", ())
            if "created_by_admin" not in names:
                try:
                    execute_write("ALTER TABLE tags ADD COLUMN created_by_admin INTEGER NOT NULL DEFAULT 1", ())
                except Exception:
                    pass
        else:
            for col, ddl in (
                ("description", "ALTER TABLE tags ADD COLUMN description TEXT NULL"),
                ("cover_path", "ALTER TABLE tags ADD COLUMN cover_path VARCHAR(512) NOT NULL DEFAULT ''"),
                ("created_by_admin", "ALTER TABLE tags ADD COLUMN created_by_admin TINYINT NOT NULL DEFAULT 1"),
            ):
                try:
                    rows = fetch_all("SHOW COLUMNS FROM tags LIKE %s", (col,)) or []
                    if not rows:
                        execute_write(ddl, ())
                        LOGGER.info("Added tags.%s", col)
                except Exception as col_exc:
                    LOGGER.warning("tags.%s ensure: %s", col, col_exc)
        # book_tags table
        try:
            if _live_use_sqlite():
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS book_tags (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        book_id INTEGER NOT NULL,
                        tag_id INTEGER NOT NULL,
                        UNIQUE(book_id, tag_id)
                    )
                    """,
                    (),
                )
            else:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS book_tags (
                        book_id INT NOT NULL,
                        tag_id INT NOT NULL,
                        PRIMARY KEY (book_id, tag_id)
                    )
                    """,
                    (),
                )
        except Exception as bt_exc:
            LOGGER.warning("book_tags ensure: %s", bt_exc)
    except Exception as exc:
        LOGGER.warning("_ensure_tags_schema: %s", exc)


def _seed_book_tag_links(limit: int = 500) -> dict:
    """Link books to tags by matching genre / secondary_genre / section to tag names."""
    report = {"links": 0, "covers": 0}
    try:
        _ensure_tags_schema()
        tags = fetch_all("SELECT id, name, cover_path FROM tags") or []
        if not tags:
            return report
        by_name = {}
        for t in tags:
            nm = str(_row_get(t, "name") or "").strip().lower()
            if nm:
                by_name[nm] = t
        books = fetch_all(
            """
            SELECT id, genre, secondary_genre, primary_genre, cover_path
            FROM books
            WHERE LOWER(COALESCE(status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
            LIMIT %s
            """,
            (limit,),
        ) or []
        for b in books:
            bid = int(_row_get(b, "id") or 0)
            if not bid:
                continue
            candidates = []
            for key in ("genre", "secondary_genre", "primary_genre"):
                val = str(_row_get(b, key) or "").strip()
                if val:
                    candidates.append(val)
                    # also split "Romance/Drama"
                    for part in val.replace("/", ",").split(","):
                        p = part.strip()
                        if p:
                            candidates.append(p)
            seen = set()
            for c in candidates:
                key = c.lower()
                if key in seen:
                    continue
                seen.add(key)
                tag = by_name.get(key)
                if not tag:
                    # partial match
                    for tn, trow in by_name.items():
                        if tn in key or key in tn:
                            tag = trow
                            break
                if not tag:
                    continue
                tid = int(_row_get(tag, "id") or 0)
                try:
                    if _live_use_sqlite():
                        execute_write(
                            "INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (%s, %s)",
                            (bid, tid),
                        )
                    else:
                        execute_write(
                            "INSERT IGNORE INTO book_tags (book_id, tag_id) VALUES (%s, %s)",
                            (bid, tid),
                        )
                    report["links"] += 1
                except Exception:
                    pass
                # Seed tag cover from book cover if empty
                tcover = str(_row_get(tag, "cover_path") or "").strip()
                bcover = str(_row_get(b, "cover_path") or "").strip()
                if not tcover and bcover:
                    try:
                        execute_write(
                            "UPDATE tags SET cover_path=%s WHERE id=%s AND (cover_path IS NULL OR cover_path='')",
                            (bcover, tid),
                        )
                        report["covers"] += 1
                        # refresh cache in by_name
                        if isinstance(tag, dict):
                            tag["cover_path"] = bcover
                    except Exception:
                        pass
        LOGGER.info("book_tag_links: %s", report)
    except Exception as exc:
        LOGGER.warning("_seed_book_tag_links: %s", exc)
        report["error"] = str(exc)
    return report



@app.get("/api/tags")
def list_tags(q: str | None = None):
    global _TAGS_CACHE, _TAGS_CACHE_AT
    import time as _time
    if not q:
        now = _time.time()
        if _TAGS_CACHE is not None and (now - _TAGS_CACHE_AT) < _TAGS_CACHE_TTL:
            return _TAGS_CACHE

    _ensure_tags_schema()
    # Self-heal: if tags table empty, seed defaults (admin hashtags)
    try:
        cnt_rows = fetch_all("SELECT COUNT(*) AS c FROM tags")
        c = 0
        if cnt_rows:
            r = cnt_rows[0]
            c = int(r.get("c") if isinstance(r, dict) else r[0] or 0)
        if c == 0:
            from .startup_tasks import DEFAULT_TAGS
            for name in DEFAULT_TAGS:
                try:
                    execute_write(
                        "INSERT INTO tags (name) VALUES (%s)",
                        (name,),
                    )
                except Exception:
                    pass
            bump_content_version()
    except Exception as _seed_exc:
        LOGGER.warning("list_tags auto-seed: %s", _seed_exc)

    if q:
        like = f"%{q.strip().lstrip('#')}%"
        rows = fetch_all(
            """
            SELECT t.id, t.name, t.description, t.cover_path,
                   (SELECT COUNT(DISTINCT b.id)
                    FROM book_tags bt
                    JOIN books b ON b.id = bt.book_id
                    WHERE bt.tag_id = t.id
                      AND LOWER(COALESCE(b.status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
                   ) AS book_count,
                   (SELECT COUNT(*) FROM tag_follows tf WHERE tf.tag_id = t.id) AS followers_count
            FROM tags t
            WHERE t.name LIKE %s
            ORDER BY t.name LIMIT 20
            """,
            (like,),
        )
    else:
        rows = fetch_all(
            """
            SELECT t.id, t.name, t.description, t.cover_path,
                   (SELECT COUNT(DISTINCT b.id)
                    FROM book_tags bt
                    JOIN books b ON b.id = bt.book_id
                    WHERE bt.tag_id = t.id
                      AND LOWER(COALESCE(b.status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
                   ) AS book_count,
                   (SELECT COUNT(*) FROM tag_follows tf WHERE tf.tag_id = t.id) AS followers_count
            FROM tags t
            ORDER BY followers_count DESC, book_count DESC, t.name LIMIT 100
            """
        )
    payload = {
        "items": [
            {
                "id": row["id"],
                "name": row["name"],
                "description": row.get("description") or "",
                "cover_path": row.get("cover_path") or "",
                "book_count": int(row.get("book_count") or 0),
                "followers_count": int(row.get("followers_count") or 0),
            }
            for row in rows
        ]
    }
    if not q:
        _TAGS_CACHE = payload
        _TAGS_CACHE_AT = _time.time()
    return payload



@app.get("/api/tags/{tag_name:path}/books")
def list_books_by_tag(
    tag_name: str,
    sort: str | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Return published books for a hashtag. sort=top|recent|trending|liked"""
    from urllib.parse import unquote
    clean = unquote(tag_name or "").strip().lstrip("#")
    _ensure_tags_schema()
    # If no links yet, try auto-link genres once
    try:
        cnt = fetch_all(
            """
            SELECT COUNT(*) AS c FROM book_tags bt
            JOIN tags t ON t.id = bt.tag_id WHERE LOWER(t.name)=LOWER(%s)
            """,
            (clean,),
        ) or []
        c0 = cnt[0] if cnt else {}
        n = int((c0.get("c") if isinstance(c0, dict) else c0[0]) or 0)
        if n == 0:
            _seed_book_tag_links()
    except Exception:
        pass
    order = "b.rating DESC, b.id DESC"
    s = (sort or "top").strip().lower()
    if s in ("recent", "new"):
        order = "b.id DESC"
    elif s in ("trending", "views"):
        order = "COALESCE(b.view_count, 0) DESC, b.id DESC"
    elif s in ("liked", "most_liked", "likes"):
        _ensure_book_likes_table()
        order = (
            "(SELECT COUNT(*) FROM book_likes bl WHERE bl.book_id = b.id) DESC, "
            "COALESCE(b.rating, 0) DESC, b.id DESC"
        )
    else:
        order = "COALESCE(b.rating, 0) DESC, COALESCE(b.view_count, 0) DESC"
    rows = fetch_all(
        f"""
        SELECT b.* FROM books b
        JOIN book_tags bt ON bt.book_id = b.id
        JOIN tags t ON t.id = bt.tag_id
        WHERE LOWER(t.name) = LOWER(%s)
          AND LOWER(COALESCE(b.status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
        ORDER BY {order}
        LIMIT %s OFFSET %s
        """,
        (clean, limit + 1, offset),
    ) or []
    has_more = len(rows) > limit
    rows = rows[:limit]
    count_rows = fetch_all(
        """
        SELECT COUNT(DISTINCT b.id) AS c
        FROM books b
        JOIN book_tags bt ON bt.book_id = b.id
        JOIN tags t ON t.id = bt.tag_id
        WHERE LOWER(t.name) = LOWER(%s)
          AND LOWER(COALESCE(b.status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
        """,
        (clean,),
    ) or []
    total_count = int(_row_get(count_rows[0], "c") or 0) if count_rows else 0
    # Include tag meta
    tag_rows = fetch_all(
        "SELECT id, name, description, cover_path FROM tags WHERE LOWER(name)=LOWER(%s) LIMIT 1",
        (clean,),
    ) or []
    tag_meta = tag_rows[0] if tag_rows else {"name": clean}
    related_rows = fetch_all(
        """
        SELECT related.id, related.name, COUNT(DISTINCT shared.book_id) AS shared_stories
        FROM tags current_tag
        JOIN book_tags current_link ON current_link.tag_id=current_tag.id
        JOIN book_tags shared ON shared.book_id=current_link.book_id
        JOIN books published_book ON published_book.id=shared.book_id
        JOIN tags related ON related.id=shared.tag_id
        WHERE LOWER(current_tag.name)=LOWER(%s)
          AND related.id<>current_tag.id
          AND LOWER(COALESCE(published_book.status_text, 'draft')) NOT IN ('draft', 'unpublished', 'private')
        GROUP BY related.id, related.name
        ORDER BY shared_stories DESC, related.name ASC
        LIMIT 10
        """,
        (clean,),
    ) or []
    items = [_serialize_book(row) for row in rows]
    for item in items:
        cover_path = str(item.get("cover_path") or "")
        if cover_path.startswith("/uploads/"):
            local_cover = (UPLOAD_ROOT / cover_path.removeprefix("/uploads/")).resolve()
            try:
                local_cover.relative_to(UPLOAD_ROOT)
            except ValueError:
                item["cover_path"] = ""
            else:
                if not local_cover.is_file():
                    item["cover_path"] = ""

    return {
        "items": items,
        "tag": clean,
        "tag_meta": {
            "id": _row_get(tag_meta, "id"),
            "name": _row_get(tag_meta, "name") or clean,
            "description": _row_get(tag_meta, "description") or "",
            "cover_path": _row_get(tag_meta, "cover_path") or "",
            "book_count": total_count,
        },
        "has_more": has_more,
        "total_count": total_count,
        "related_tags": [
            {
                "id": _row_get(row, "id"),
                "name": _row_get(row, "name") or "",
                "shared_stories": int(_row_get(row, "shared_stories") or 0),
            }
            for row in related_rows
        ],
    }


def _ensure_tag_follows_table() -> None:
    """Users following hashtags (for notifications / personalization)."""
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS tag_follows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    tag_id INTEGER NOT NULL,
                    notify INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, tag_id)
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS tag_follows (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    tag_id INT NOT NULL,
                    notify TINYINT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_tag_follow (user_id, tag_id),
                    INDEX idx_tag_follows_tag (tag_id)
                )
                """,
                (),
            )

        # Always ensure notify column exists (table may predate the column, and may be empty).
        try:
            has_notify = False
            if _live_use_sqlite():
                info = fetch_all("PRAGMA table_info(tag_follows)") or []
                for col in info:
                    name = col.get("name") if isinstance(col, dict) else (col[1] if col and len(col) > 1 else None)
                    if name == "notify":
                        has_notify = True
                        break
                if not has_notify:
                    execute_write(
                        "ALTER TABLE tag_follows ADD COLUMN notify INTEGER NOT NULL DEFAULT 0",
                        (),
                    )
                    LOGGER.info("Added tag_follows.notify (sqlite)")
            else:
                cols = fetch_all("SHOW COLUMNS FROM tag_follows LIKE %s", ("notify",)) or []
                if not cols:
                    execute_write(
                        "ALTER TABLE tag_follows ADD COLUMN notify TINYINT NOT NULL DEFAULT 0",
                        (),
                    )
                    LOGGER.info("Added tag_follows.notify (mysql)")
        except Exception as col_exc:
            LOGGER.warning("tag_follows.notify ensure: %s", col_exc)
    except Exception as exc:
        LOGGER.warning("tag_follows ensure failed: %s", exc)


def _resolve_tag_id(tag_name: str) -> int | None:
    clean = (tag_name or "").strip().lstrip("#")
    if not clean:
        return None
    rows = fetch_all("SELECT id FROM tags WHERE name=%s LIMIT 1", (clean,))
    if rows:
        return int(_row_get(rows[0], "id") or 0) or None
    # Case-insensitive fallback
    rows = fetch_all("SELECT id FROM tags WHERE LOWER(name)=LOWER(%s) LIMIT 1", (clean,))
    if rows:
        return int(_row_get(rows[0], "id") or 0) or None
    return None


def _tag_follower_count(tag_id: int) -> int:
    try:
        rows = fetch_all(
            "SELECT COUNT(*) AS c FROM tag_follows WHERE tag_id=%s",
            (tag_id,),
        )
        return int(_row_get(rows[0], "c") or 0) if rows else 0
    except Exception:
        return 0


@app.post("/api/tags/{tag_name:path}/follow")
def follow_tag(tag_name: str, user: dict[str, Any] = Depends(require_user)):
    """Follow a hashtag so it can power recommendations / notify later."""
    _ensure_tag_follows_table()
    tag_id = _resolve_tag_id(tag_name)
    if not tag_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    uid = int(user["user_id"])
    if _live_use_sqlite():
        execute_write(
            "INSERT OR IGNORE INTO tag_follows (user_id, tag_id, notify) VALUES (%s, %s, 0)",
            (uid, tag_id),
        )
    else:
        execute_write(
            "INSERT IGNORE INTO tag_follows (user_id, tag_id, notify) VALUES (%s, %s, 0)",
            (uid, tag_id),
        )
    bump_content_version()
    return {
        "ok": True,
        "following": True,
        "tag": tag_name.strip().lstrip("#"),
        "followers": _tag_follower_count(tag_id),
    }


@app.get("/api/tags/{tag_name:path}/follow")
def check_tag_follow(tag_name: str, user: dict[str, Any] = Depends(require_user)):
    _ensure_tag_follows_table()
    tag_id = _resolve_tag_id(tag_name)
    if not tag_id:
        return {"following": False, "notify": False, "followers": 0}
    rows = fetch_all(
        "SELECT id, notify FROM tag_follows WHERE user_id=%s AND tag_id=%s LIMIT 1",
        (int(user["user_id"]), tag_id),
    )
    following = bool(rows)
    notify = bool(int(_row_get(rows[0], "notify") or 0)) if rows else False
    return {
        "following": following,
        "notify": notify,
        "followers": _tag_follower_count(tag_id),
    }


@app.delete("/api/tags/{tag_name:path}/follow")
def unfollow_tag(tag_name: str, user: dict[str, Any] = Depends(require_user)):
    _ensure_tag_follows_table()
    tag_id = _resolve_tag_id(tag_name)
    if not tag_id:
        return {"ok": True, "following": False, "followers": 0}
    execute_write(
        "DELETE FROM tag_follows WHERE user_id=%s AND tag_id=%s",
        (int(user["user_id"]), tag_id),
    )
    bump_content_version()
    return {
        "ok": True,
        "following": False,
        "tag": tag_name.strip().lstrip("#"),
        "followers": _tag_follower_count(tag_id),
    }


@app.post("/api/tags/{tag_name:path}/notify")
def set_tag_notify(
    tag_name: str,
    payload: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(require_user),
):
    """Toggle notification preference for a followed hashtag (auto-follows if needed)."""
    _ensure_tag_follows_table()
    tag_id = _resolve_tag_id(tag_name)
    if not tag_id:
        raise HTTPException(status_code=404, detail="Tag not found")
    uid = int(user["user_id"])
    body = payload or {}
    want = body.get("notify", True)
    notify_val = 1 if want in (True, 1, "1", "true", "True") else 0
    # Ensure follow row exists
    if _live_use_sqlite():
        execute_write(
            "INSERT OR IGNORE INTO tag_follows (user_id, tag_id, notify) VALUES (%s, %s, %s)",
            (uid, tag_id, notify_val),
        )
    else:
        execute_write(
            "INSERT IGNORE INTO tag_follows (user_id, tag_id, notify) VALUES (%s, %s, %s)",
            (uid, tag_id, notify_val),
        )
    execute_write(
        "UPDATE tag_follows SET notify=%s WHERE user_id=%s AND tag_id=%s",
        (notify_val, uid, tag_id),
    )
    bump_content_version()
    return {
        "ok": True,
        "following": True,
        "notify": bool(notify_val),
        "tag": tag_name.strip().lstrip("#"),
    }


@app.get("/api/me/followed-tags")
def list_my_followed_tags(user: dict[str, Any] = Depends(require_user)):
    _ensure_tag_follows_table()
    rows = fetch_all(
        """
        SELECT t.id, t.name, tf.notify,
               (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id = t.id) AS book_count
        FROM tag_follows tf
        JOIN tags t ON t.id = tf.tag_id
        WHERE tf.user_id = %s
        ORDER BY t.name
        """,
        (int(user["user_id"]),),
    )
    return {
        "items": [
            {
                "id": _row_get(r, "id"),
                "name": _row_get(r, "name"),
                "notify": bool(int(_row_get(r, "notify") or 0)),
                "book_count": int(_row_get(r, "book_count") or 0),
            }
            for r in (rows or [])
        ]
    }




@app.get("/api/me/followers")
def list_my_followers(user: dict[str, Any] = Depends(require_user)):
    """People who follow the current user."""
    _ensure_author_follows_table()
    uid = int(user["user_id"])
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.display_name, u.photo_url, u.bio
            FROM author_follows f
            JOIN app_users u ON u.id = f.user_id
            WHERE f.author_id=%s
            ORDER BY f.id DESC LIMIT 100
            """,
            (uid,),
        ) or []
    except Exception as exc:
        LOGGER.warning("list_my_followers: %s", exc)
        rows = []
    return {
        "items": [
            {
                "id": _row_get(r, "id"),
                "display_name": _row_get(r, "display_name") or "Reader",
                "photo_url": _row_get(r, "photo_url") or "",
                "bio": _row_get(r, "bio") or "",
            }
            for r in rows
        ]
    }


@app.get("/api/me/following")
def list_my_following(user: dict[str, Any] = Depends(require_user)):
    """Authors the current user follows."""
    _ensure_author_follows_table()
    uid = int(user["user_id"])
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.display_name, u.photo_url, u.bio
            FROM author_follows f
            JOIN app_users u ON u.id = f.author_id
            WHERE f.user_id=%s
            ORDER BY f.id DESC LIMIT 100
            """,
            (uid,),
        ) or []
    except Exception as exc:
        LOGGER.warning("list_my_following: %s", exc)
        rows = []
    return {
        "items": [
            {
                "id": _row_get(r, "id"),
                "display_name": _row_get(r, "display_name") or "Reader",
                "photo_url": _row_get(r, "photo_url") or "",
                "bio": _row_get(r, "bio") or "",
            }
            for r in rows
        ]
    }


@app.get("/api/users/{user_id}/followers")
def list_user_followers(user_id: int):
    _ensure_author_follows_table()
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.display_name, u.photo_url, u.bio
            FROM author_follows f
            JOIN app_users u ON u.id = f.user_id
            WHERE f.author_id=%s
            ORDER BY f.id DESC LIMIT 100
            """,
            (user_id,),
        ) or []
    except Exception:
        rows = []
    return {
        "items": [
            {
                "id": _row_get(r, "id"),
                "display_name": _row_get(r, "display_name") or "Reader",
                "photo_url": _row_get(r, "photo_url") or "",
                "bio": _row_get(r, "bio") or "",
            }
            for r in rows
        ]
    }


@app.get("/api/users/{user_id}/following")
def list_user_following(user_id: int):
    _ensure_author_follows_table()
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.display_name, u.photo_url, u.bio
            FROM author_follows f
            JOIN app_users u ON u.id = f.author_id
            WHERE f.user_id=%s
            ORDER BY f.id DESC LIMIT 100
            """,
            (user_id,),
        ) or []
    except Exception:
        rows = []
    return {
        "items": [
            {
                "id": _row_get(r, "id"),
                "display_name": _row_get(r, "display_name") or "Reader",
                "photo_url": _row_get(r, "photo_url") or "",
                "bio": _row_get(r, "bio") or "",
            }
            for r in rows
        ]
    }

@app.get("/api/me/reviews")
def list_my_reviews(user: dict[str, Any] = Depends(require_user)):
    """Reviews this user WROTE on stories (Profile > Reviews tab)."""
    try:
        rows = fetch_all(
            """
            SELECT r.id, r.rating, r.comment, r.created_at, r.book_id, r.user_id AS reviewer_id,
                   b.title, b.author, b.cover_path, b.accent_hex, b.primary_genre, b.status_text,
                   u.display_name AS reviewer_name, u.photo_url AS reviewer_photo
            FROM book_reviews r
            LEFT JOIN books b ON b.id = r.book_id
            LEFT JOIN app_users u ON u.id = r.user_id
            WHERE r.user_id = %s
            ORDER BY r.id DESC
            LIMIT 100
            """,
            (user["user_id"],),
        )
    except Exception as exc:
        LOGGER.warning("list_my_reviews (written) failed: %s", exc)
        rows = []
    items = []
    for row in (rows or []):
        comment = _row_get(row, "comment") or ""
        rating = int(_row_get(row, "rating") or 0)
        book_id = _row_get(row, "book_id")
        items.append({
            "id": _row_get(row, "id"),
            "rating": rating,
            "comment": comment,
            "body": comment,
            "created_at": str(_row_get(row, "created_at") or ""),
            "reviewer_name": _row_get(row, "reviewer_name") or "Reader",
            "reviewer_photo": _row_get(row, "reviewer_photo") or "",
            "user_id": _row_get(row, "reviewer_id"),
            "book_id": book_id,
            "book_title": _row_get(row, "title") or "Story",
            "book_author": _row_get(row, "author") or "",
            "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            "plot": min(5, max(1, rating or 1)),
            "writing_style": min(5, max(1, rating or 1)),
            "grammar": min(5, max(1, max(1, (rating or 1) - 1))),
            "book": {
                "id": book_id,
                "title": _row_get(row, "title") or "Story",
                "author": _row_get(row, "author") or "",
                "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
                "accent_hex": _row_get(row, "accent_hex") or "#A1A1A1",
                "primary_genre": _row_get(row, "primary_genre") or "",
                "status_text": _row_get(row, "status_text") or "",
            },
        })
    return {"items": items}


@app.get("/api/books/{book_id}/reviews")
def list_book_reviews(
    book_id: int,
    user: dict[str, Any] | None = Depends(optional_user),
):
    try:
        rows = fetch_all(
            """
            SELECT r.id, r.user_id, r.rating, r.comment, r.created_at,
                   r.title, r.plot_rating, r.style_rating, r.tech_rating,
                   u.display_name, u.photo_url
            FROM book_reviews r
            JOIN app_users u ON u.id = r.user_id
            WHERE r.book_id=%s
            ORDER BY r.created_at DESC
            """,
            (book_id,),
        )
    except Exception:
        rows = fetch_all(
            """
            SELECT r.id, r.user_id, r.rating, r.comment, r.created_at,
                   u.display_name
            FROM book_reviews r
            JOIN app_users u ON u.id = r.user_id
            WHERE r.book_id=%s
            ORDER BY r.created_at DESC
            """,
            (book_id,),
        )
    viewer_id = int(user["user_id"]) if user else None
    items = []
    for row in rows or []:
        comment = str(_row_get(row, "comment") or "")
        title = str(_row_get(row, "title") or "").strip()
        if not title and "\n\n" in comment:
            parts = comment.split("\n\n", 1)
            title = parts[0].strip()
            comment = parts[1].strip() if len(parts) > 1 else comment
        items.append(
            {
                "id": _row_get(row, "id"),
                "user_id": _row_get(row, "user_id"),
                "rating": _row_get(row, "rating"),
                "comment": comment,
                "title": title,
                "plot_rating": _row_get(row, "plot_rating"),
                "style_rating": _row_get(row, "style_rating"),
                "tech_rating": _row_get(row, "tech_rating"),
                "created_at": _row_get(row, "created_at"),
                "display_name": _row_get(row, "display_name") or "Reader",
                "photo_url": _row_get(row, "photo_url") or "",
                "is_mine": viewer_id is not None and int(_row_get(row, "user_id") or 0) == viewer_id,
            }
        )
    return {"items": items}


@app.post("/api/books/{book_id}/reviews")
def create_book_review(
    book_id: int,
    payload: ReviewCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    # Owner cannot review own book
    owner_rows = fetch_all(
        "SELECT user_id, title FROM books WHERE id=%s LIMIT 1", (book_id,)
    )
    owner_id = int(_row_get(owner_rows[0], "user_id") or 0) if owner_rows else 0
    if owner_id and owner_id == int(user["user_id"]):
        raise HTTPException(status_code=400, detail="You cannot review your own story")
    # One review per user per book
    existing = fetch_all(
        "SELECT id FROM book_reviews WHERE book_id=%s AND user_id=%s LIMIT 1",
        (book_id, user["user_id"]),
    )
    if existing:
        raise HTTPException(status_code=400, detail="You already reviewed this book")
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    title = (payload.title or "").strip()
    body = (payload.comment or "").strip()
    # Any length allowed (rating is required; comment optional/short OK)
    plot = int(payload.plot_rating or payload.rating)
    style = int(payload.style_rating or payload.rating)
    tech = int(payload.tech_rating or payload.rating)
    for v in (plot, style, tech):
        if v < 1 or v > 5:
            raise HTTPException(status_code=400, detail="Ratings must be between 1 and 5")
    # Review columns are provisioned during application startup. Do not run
    # ALTER TABLE on the request path: MySQL metadata locks can make a review
    # save successfully while the client times out waiting for the response.
    stored_comment = body if not title else f"{title}\n\n{body}"
    try:
        execute_write(
            """
            INSERT INTO book_reviews
              (book_id, user_id, rating, comment, title, plot_rating, style_rating, tech_rating)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (book_id, user["user_id"], payload.rating, stored_comment, title or None, plot, style, tech),
        )
    except Exception:
        execute_write(
            "INSERT INTO book_reviews (book_id, user_id, rating, comment) VALUES (%s, %s, %s, %s)",
            (book_id, user["user_id"], payload.rating, stored_comment),
        )
    _record_writer_analytics_event(
        book_id,
        "comment",
        actor_user_id=int(user["user_id"]),
    )
    # Update book average rating
    try:
        rows = fetch_all(
            "SELECT AVG(rating) AS avg_r FROM book_reviews WHERE book_id=%s",
            (book_id,),
        )
        avg = float(_row_get(rows[0], "avg_r") or 0) if rows else 0.0
        execute_write("UPDATE books SET rating=%s WHERE id=%s", (round(avg, 2), book_id))
    except Exception:
        pass
    bump_content_version()
    return {"ok": True}


@app.put("/api/books/{book_id}/reviews/mine")
def update_my_book_review(
    book_id: int,
    payload: ReviewCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Edit the current user's review on a book."""
    uid = int(user["user_id"])
    existing = fetch_all(
        "SELECT id FROM book_reviews WHERE book_id=%s AND user_id=%s LIMIT 1",
        (book_id, uid),
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Review not found")
    rid = int(_row_get(existing[0], "id") or 0)
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    title = (payload.title or "").strip()
    body = (payload.comment or "").strip()
    stored_comment = body if not title else f"{title}\n\n{body}"
    plot = int(payload.plot_rating or payload.rating)
    style = int(payload.style_rating or payload.rating)
    tech = int(payload.tech_rating or payload.rating)
    try:
        execute_write(
            """
            UPDATE book_reviews
            SET rating=%s, comment=%s, title=%s, plot_rating=%s, style_rating=%s, tech_rating=%s
            WHERE id=%s AND user_id=%s
            """,
            (payload.rating, stored_comment, title or None, plot, style, tech, rid, uid),
        )
    except Exception:
        execute_write(
            "UPDATE book_reviews SET rating=%s, comment=%s WHERE id=%s AND user_id=%s",
            (payload.rating, stored_comment, rid, uid),
        )
    try:
        rows = fetch_all(
            "SELECT AVG(rating) AS avg_r FROM book_reviews WHERE book_id=%s",
            (book_id,),
        )
        avg = float(_row_get(rows[0], "avg_r") or 0) if rows else 0.0
        execute_write("UPDATE books SET rating=%s WHERE id=%s", (round(avg, 2), book_id))
    except Exception:
        pass
    bump_content_version()
    return {"ok": True, "id": rid}


@app.delete("/api/books/{book_id}/reviews/mine")
def delete_my_book_review(
    book_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    """Delete the current user's review on a book."""
    uid = int(user["user_id"])
    existing = fetch_all(
        "SELECT id FROM book_reviews WHERE book_id=%s AND user_id=%s LIMIT 1",
        (book_id, uid),
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Review not found")
    rid = int(_row_get(existing[0], "id") or 0)
    execute_write(
        "DELETE FROM book_reviews WHERE id=%s AND user_id=%s",
        (rid, uid),
    )
    try:
        rows = fetch_all(
            "SELECT AVG(rating) AS avg_r FROM book_reviews WHERE book_id=%s",
            (book_id,),
        )
        avg = float(_row_get(rows[0], "avg_r") or 0) if rows else 0.0
        execute_write("UPDATE books SET rating=%s WHERE id=%s", (round(avg, 2), book_id))
    except Exception:
        pass
    bump_content_version()
    return {"ok": True}


_CHAPTER_COMMENTS_TABLE_READY = False


def _ensure_chapter_comments_table() -> None:
    """Memoized schema ensure — runs once per serverless instance."""
    global _CHAPTER_COMMENTS_TABLE_READY
    if _CHAPTER_COMMENTS_TABLE_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS chapter_comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chapter_id INTEGER NOT NULL,
                    book_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    body TEXT NOT NULL,
                    paragraph_index INTEGER DEFAULT -1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
            try:
                execute_write(
                    "ALTER TABLE chapter_comments ADD COLUMN paragraph_index INTEGER DEFAULT -1",
                    (),
                )
            except Exception:
                pass
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS chapter_comment_likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    comment_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(comment_id, user_id)
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS chapter_comments (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    chapter_id INT NOT NULL,
                    book_id INT NOT NULL,
                    user_id INT NOT NULL,
                    body TEXT NOT NULL,
                    paragraph_index INT DEFAULT -1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX (chapter_id),
                    INDEX (book_id),
                    INDEX (user_id),
                    INDEX (paragraph_index)
                )
                """,
                (),
            )
            try:
                execute_write(
                    "ALTER TABLE chapter_comments ADD COLUMN paragraph_index INT DEFAULT -1",
                    (),
                )
            except Exception:
                pass
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS chapter_comment_likes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    comment_id INT NOT NULL,
                    user_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_comment_like (comment_id, user_id),
                    INDEX (comment_id)
                )
                """,
                (),
            )
    except Exception as exc:
        LOGGER.warning("chapter_comments ensure failed: %s", exc)

    _CHAPTER_COMMENTS_TABLE_READY = True

def _resolve_chapter_id(book_id: int, chapter_number: int) -> int | None:
    rows = fetch_all(
        "SELECT id FROM chapters WHERE story_id=%s AND chapter_number=%s ORDER BY id LIMIT 1",
        (book_id, chapter_number),
    )
    if not rows:
        try:
            rows = fetch_all(
                "SELECT id FROM chapters WHERE book_id=%s AND chapter_number=%s ORDER BY id LIMIT 1",
                (book_id, chapter_number),
            )
        except Exception:
            rows = []
    if not rows:
        return None
    return int(rows[0]["id"])


def _serialize_comment_row(row: dict[str, Any]) -> dict[str, Any]:
    """Null-safe serializer for chapter comments (app_users has no username column)."""
    try:
        name = (
            (row.get("display_name") if isinstance(row, dict) else None)
            or (row.get("username") if isinstance(row, dict) else None)
            or "Reader"
        )
        avatar = ""
        if isinstance(row, dict):
            avatar = row.get("photo_url") or row.get("avatar_url") or ""
        created = row.get("created_at") if isinstance(row, dict) else None
        return {
            "id": row.get("id") if isinstance(row, dict) else None,
            "chapter_id": row.get("chapter_id") if isinstance(row, dict) else None,
            "book_id": row.get("book_id") if isinstance(row, dict) else None,
            "user_id": row.get("user_id") if isinstance(row, dict) else None,
            "body": (row.get("body") or "") if isinstance(row, dict) else "",
            "paragraph_index": int(row.get("paragraph_index") if row.get("paragraph_index") is not None else -1) if isinstance(row, dict) else -1,
            "display_name": name,
            "username": "",
            "photo_url": avatar,
            "created_at": str(created) if created is not None else "",
        }
    except Exception:
        return {
            "id": None,
            "chapter_id": None,
            "book_id": None,
            "user_id": None,
            "body": "",
            "display_name": "Reader",
            "username": "",
            "photo_url": "",
            "created_at": "",
        }


@app.get("/api/books/{book_id}/chapters/{chapter_number}/comments")
def list_chapter_comments(
    book_id: int,
    chapter_number: int,
    user: dict[str, Any] | None = Depends(optional_user),
):
    """Public list of comments for a chapter (by book + chapter number)."""
    try:
        _ensure_chapter_comments_table()
        chapter_id = _resolve_chapter_id(book_id, chapter_number)
        if chapter_id is None:
            return {"items": []}
        rows = fetch_all(
            """
            SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body,
                   COALESCE(c.paragraph_index, -1) AS paragraph_index,
                   c.created_at, u.display_name, u.photo_url
            FROM chapter_comments c
            LEFT JOIN app_users u ON u.id = c.user_id
            WHERE c.chapter_id = %s
            ORDER BY c.created_at DESC, c.id DESC
            """,
            (chapter_id,),
        )
        items = [_serialize_comment_row(r) for r in (rows or [])]
        for item in items:
            like_rows = fetch_all(
                "SELECT COUNT(*) AS c FROM chapter_comment_likes WHERE comment_id=%s",
                (item.get("id"),),
            )
            item["like_count"] = int(_row_get(like_rows[0], "c") or 0) if like_rows else 0
            item["liked"] = bool(
                user
                and fetch_all(
                    "SELECT id FROM chapter_comment_likes WHERE comment_id=%s AND user_id=%s LIMIT 1",
                    (item.get("id"), user["user_id"]),
                )
            )
        counts: dict[str, int] = {}
        chapter_items: list[dict[str, Any]] = []
        for it in items:
            pi = int(it.get("paragraph_index") if it.get("paragraph_index") is not None else -1)
            if pi >= 0:
                key = str(pi)
                counts[key] = counts.get(key, 0) + 1
            else:
                # Chapter-level only (not tied to a paragraph)
                chapter_items.append(it)
        return {
            "items": items,  # full list (paragraph UI filters by index)
            "chapter_items": chapter_items,  # chapter comments sheet only
            "paragraph_counts": counts,
            "chapter_count": len(chapter_items),
        }
    except Exception as exc:
        LOGGER.exception("list_chapter_comments failed: %s", exc)
        return {"items": [], "error": "Failed to load comments"}


@app.post("/api/books/{book_id}/chapters/{chapter_number}/comments")
def create_chapter_comment(
    book_id: int,
    chapter_number: int,
    payload: ChapterCommentCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Post a comment on a chapter. Requires auth. Owner cannot comment own story."""
    _ensure_chapter_comments_table()
    owner_rows = fetch_all(
        "SELECT user_id, title FROM books WHERE id=%s LIMIT 1", (book_id,)
    )
    owner_id = int(_row_get(owner_rows[0], "user_id") or 0) if owner_rows else 0
    book_title = str(_row_get(owner_rows[0], "title") or "your story") if owner_rows else "your story"
    paragraph_index = payload.paragraph_index
    if paragraph_index is None or int(paragraph_index) < 0:
        if owner_id and owner_id == int(user["user_id"]):
            raise HTTPException(
                status_code=400,
                detail="You cannot add a chapter-level comment to your own story",
            )
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Comment is too long")
    chapter_id = _resolve_chapter_id(book_id, chapter_number)
    if chapter_id is None:
        # Auto-create a stub chapter row so comments can still attach when
        # the reader opened content without a DB chapter id.
        execute_write(
            """
            INSERT INTO chapters (story_id, chapter_number, title, content, sort_order)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (book_id, chapter_number, f"Chapter {chapter_number}", "", chapter_number),
        )
        chapter_id = _resolve_chapter_id(book_id, chapter_number)
        if chapter_id is None:
            raise HTTPException(status_code=404, detail="Chapter not found")
    try:
        pidx = payload.paragraph_index
        if pidx is None:
            pidx = -1
        try:
            pidx = int(pidx)
        except Exception:
            pidx = -1
        execute_write(
            """
            INSERT INTO chapter_comments (chapter_id, book_id, user_id, body, paragraph_index)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (chapter_id, book_id, user["user_id"], body, pidx),
        )
        _record_writer_analytics_event(
            book_id,
            "comment",
            actor_user_id=int(user["user_id"]),
            chapter_number=chapter_number,
        )
        bump_content_version()
        rows = fetch_all(
            """
            SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body, c.created_at,
                   COALESCE(c.paragraph_index, -1) AS paragraph_index,
                   u.display_name, u.photo_url
            FROM chapter_comments c
            LEFT JOIN app_users u ON u.id = c.user_id
            WHERE c.chapter_id = %s AND c.user_id = %s
            ORDER BY c.id DESC
            LIMIT 1
            """,
            (chapter_id, user["user_id"]),
        )
        item = _serialize_comment_row(rows[0]) if rows else {"ok": True, "body": body, "display_name": "You"}
        if owner_id and owner_id != int(user["user_id"]):
            _send_push_to_user(
                owner_id,
                f"New comment on {book_title}",
                body[:180],
                {
                    "type": "comment",
                    "book_id": str(book_id),
                    "paragraph_index": str(pidx),
                },
                preference=(
                    "paragraph_comments" if pidx >= 0 else "comments"
                ),
            )
        return {"ok": True, "item": item}
    except Exception as exc:
        LOGGER.exception("create_chapter_comment failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to post comment: {exc}")




@app.get("/api/books/{book_id}/comments")
def list_book_comments(
    book_id: int,
    user: dict[str, Any] | None = Depends(optional_user),
):
    """Whole-story comments only (not chapter / paragraph comments)."""
    try:
        _ensure_chapter_comments_table()
        rows = fetch_all(
            """
            SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body,
                   COALESCE(c.paragraph_index, -1) AS paragraph_index,
                   c.created_at, u.display_name, u.photo_url
            FROM chapter_comments c
            LEFT JOIN app_users u ON u.id = c.user_id
            WHERE c.book_id = %s
              AND (c.chapter_id IS NULL OR c.chapter_id = 0)
              AND COALESCE(c.paragraph_index, -1) < 0
            ORDER BY c.created_at DESC, c.id DESC
            """,
            (book_id,),
        )
        items = [_serialize_comment_row(r) for r in (rows or [])]
        for item in items:
            like_rows = fetch_all(
                "SELECT COUNT(*) AS c FROM chapter_comment_likes WHERE comment_id=%s",
                (item.get("id"),),
            )
            item["like_count"] = int(_row_get(like_rows[0], "c") or 0) if like_rows else 0
            item["liked"] = bool(
                user
                and fetch_all(
                    "SELECT id FROM chapter_comment_likes WHERE comment_id=%s AND user_id=%s LIMIT 1",
                    (item.get("id"), user["user_id"]),
                )
            )
        return {"items": items}
    except Exception as exc:
        LOGGER.exception("list_book_comments failed: %s", exc)
        return {"items": [], "error": "Failed to load comments"}


@app.post("/api/books/{book_id}/comments")
def create_book_comment(
    book_id: int,
    payload: ChapterCommentCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Post a comment on the whole story (story detail page)."""
    _ensure_chapter_comments_table()
    owner_rows = fetch_all(
        "SELECT user_id, title FROM books WHERE id=%s LIMIT 1", (book_id,)
    )
    owner_id = int(_row_get(owner_rows[0], "user_id") or 0) if owner_rows else 0
    book_title = str(_row_get(owner_rows[0], "title") or "your story") if owner_rows else "your story"
    if owner_id and owner_id == int(user["user_id"]):
        raise HTTPException(status_code=400, detail="You cannot comment on your own story")
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Comment is too long")
    # Ensure chapter_id can be NULL for story-level comments (MySQL).
    try:
        from .database import USE_SQLITE as _us
        if not _us:
            execute_write(
                "ALTER TABLE chapter_comments MODIFY chapter_id INT NULL",
                (),
            )
    except Exception:
        pass
    execute_write(
        """
        INSERT INTO chapter_comments (chapter_id, book_id, user_id, body, paragraph_index)
        VALUES (NULL, %s, %s, %s, %s)
        """,
        (book_id, user["user_id"], body, -1),
    )
    bump_content_version()
    rows = fetch_all(
        """
        SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body, c.created_at,
               COALESCE(c.paragraph_index, -1) AS paragraph_index,
               u.display_name, u.photo_url
        FROM chapter_comments c
        LEFT JOIN app_users u ON u.id = c.user_id
        WHERE c.book_id = %s AND c.user_id = %s
          AND (c.chapter_id IS NULL OR c.chapter_id = 0)
        ORDER BY c.id DESC
        LIMIT 1
        """,
        (book_id, user["user_id"]),
    )
    item = _serialize_comment_row(rows[0]) if rows else {"ok": True, "body": body}
    item["like_count"] = 0
    item["liked"] = False
    if owner_id and owner_id != int(user["user_id"]):
        _send_push_to_user(
            owner_id,
            f"New comment on {book_title}",
            body[:180],
            {"type": "comment", "book_id": str(book_id), "paragraph_index": "-1"},
            preference="comments",
        )
    return item


@app.post("/api/chapter-comments/{comment_id}/like")
def toggle_chapter_comment_like(
    comment_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    _ensure_chapter_comments_table()
    comment_rows = fetch_all(
        "SELECT id, user_id, book_id FROM chapter_comments WHERE id=%s LIMIT 1",
        (comment_id,),
    )
    if not comment_rows:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment_owner_id = int(_row_get(comment_rows[0], "user_id") or 0)
    book_id = int(_row_get(comment_rows[0], "book_id") or 0)
    current = fetch_all(
        "SELECT id FROM chapter_comment_likes WHERE comment_id=%s AND user_id=%s LIMIT 1",
        (comment_id, user["user_id"]),
    )
    if current:
        execute_write(
            "DELETE FROM chapter_comment_likes WHERE comment_id=%s AND user_id=%s",
            (comment_id, user["user_id"]),
        )
        liked = False
    else:
        execute_write(
            "INSERT INTO chapter_comment_likes (comment_id, user_id) VALUES (%s, %s)",
            (comment_id, user["user_id"]),
        )
        liked = True
    counts = fetch_all(
        "SELECT COUNT(*) AS c FROM chapter_comment_likes WHERE comment_id=%s",
        (comment_id,),
    )
    if liked and comment_owner_id and comment_owner_id != int(user["user_id"]):
        _send_push_to_user(
            comment_owner_id,
            "Someone liked your comment",
            "Your comment received a like.",
            {
                "type": "like",
                "book_id": str(book_id),
                "comment_id": str(comment_id),
            },
            preference="likes",
        )
    bump_content_version()
    return {
        "ok": True,
        "liked": liked,
        "like_count": int(_row_get(counts[0], "c") or 0) if counts else 0,
    }



@app.put("/api/chapter-comments/{comment_id}")
def update_chapter_comment(
    comment_id: int,
    payload: ChapterCommentCreateRequest,
    user: dict[str, Any] = Depends(require_user),
):
    """Edit own comment only (story / chapter / paragraph)."""
    _ensure_chapter_comments_table()
    rows = fetch_all(
        "SELECT id, user_id FROM chapter_comments WHERE id=%s LIMIT 1",
        (comment_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Comment not found")
    owner = int(_row_get(rows[0], "user_id") or 0)
    if owner != int(user["user_id"]):
        raise HTTPException(status_code=403, detail="You can only edit your own comment")
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    if len(body) > 4000:
        raise HTTPException(status_code=400, detail="Comment is too long")
    execute_write(
        "UPDATE chapter_comments SET body=%s WHERE id=%s AND user_id=%s",
        (body, comment_id, user["user_id"]),
    )
    bump_content_version()
    out = fetch_all(
        """
        SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body, c.created_at,
               COALESCE(c.paragraph_index, -1) AS paragraph_index,
               u.display_name, u.photo_url
        FROM chapter_comments c
        LEFT JOIN app_users u ON u.id = c.user_id
        WHERE c.id = %s LIMIT 1
        """,
        (comment_id,),
    )
    item = _serialize_comment_row(out[0]) if out else {"ok": True, "id": comment_id, "body": body}
    return item


@app.delete("/api/chapter-comments/{comment_id}")
def delete_chapter_comment(
    comment_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    """Delete own comment only."""
    _ensure_chapter_comments_table()
    rows = fetch_all(
        "SELECT id, user_id FROM chapter_comments WHERE id=%s LIMIT 1",
        (comment_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Comment not found")
    owner = int(_row_get(rows[0], "user_id") or 0)
    if owner != int(user["user_id"]):
        raise HTTPException(status_code=403, detail="You can only delete your own comment")
    try:
        execute_write("DELETE FROM chapter_comment_likes WHERE comment_id=%s", (comment_id,))
    except Exception:
        pass
    execute_write(
        "DELETE FROM chapter_comments WHERE id=%s AND user_id=%s",
        (comment_id, user["user_id"]),
    )
    bump_content_version()
    return {"ok": True}


@app.get("/api/chapters/{chapter_id}/comments")
def list_comments_by_chapter_id(chapter_id: int):
    try:
        _ensure_chapter_comments_table()
        rows = fetch_all(
            """
            SELECT c.id, c.chapter_id, c.book_id, c.user_id, c.body,
                   COALESCE(c.paragraph_index, -1) AS paragraph_index,
                   c.created_at, u.display_name, u.photo_url
            FROM chapter_comments c
            LEFT JOIN app_users u ON u.id = c.user_id
            WHERE c.chapter_id = %s
            ORDER BY c.created_at DESC, c.id DESC
            """,
            (chapter_id,),
        )
        items = [_serialize_comment_row(r) for r in (rows or [])]
        counts: dict[str, int] = {}
        for it in items:
            pi = int(it.get("paragraph_index") if it.get("paragraph_index") is not None else -1)
            if pi >= 0:
                key = str(pi)
                counts[key] = counts.get(key, 0) + 1
        return {"items": items, "paragraph_counts": counts}
    except Exception as exc:
        LOGGER.exception("list_comments_by_chapter_id failed: %s", exc)
        return {"items": []}


_AUTHOR_FOLLOWS_TABLE_READY = False


_AUTHOR_FOLLOWS_READY = False

def _ensure_author_follows_table() -> None:
    global _AUTHOR_FOLLOWS_READY
    if _AUTHOR_FOLLOWS_READY:
        return
    """Memoized schema ensure — runs once per serverless instance."""
    global _AUTHOR_FOLLOWS_TABLE_READY
    if _AUTHOR_FOLLOWS_TABLE_READY:
        return
    """Ensure author_follows exists (SQLite + MySQL) and normalize legacy column names."""
    try:
        if USE_SQLITE:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS author_follows (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    author_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    notify INTEGER NOT NULL DEFAULT 0,
                    last_book_id INTEGER NOT NULL DEFAULT 0,
                    notify_since TEXT DEFAULT NULL,
                    UNIQUE(user_id, author_id)
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS author_follows (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    author_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    notify TINYINT(1) NOT NULL DEFAULT 0,
                    last_book_id INT NOT NULL DEFAULT 0,
                    notify_since TIMESTAMP NULL DEFAULT NULL,
                    UNIQUE KEY uq_follow (user_id, author_id)
                )
                """,
                (),
            )
    except Exception as exc:
        LOGGER.warning("author_follows create failed: %s", exc)

    if USE_SQLITE:
        try:
            columns = fetch_all("PRAGMA table_info(author_follows)")
            names = {str(_row_get(column, "name") or "").lower() for column in columns}
            if "notify" not in names:
                execute_write(
                    "ALTER TABLE author_follows ADD COLUMN notify INTEGER NOT NULL DEFAULT 0",
                    (),
                )
            if "last_book_id" not in names:
                execute_write(
                    "ALTER TABLE author_follows ADD COLUMN last_book_id INTEGER NOT NULL DEFAULT 0",
                    (),
                )
            if "notify_since" not in names:
                execute_write(
                    "ALTER TABLE author_follows ADD COLUMN notify_since TEXT DEFAULT NULL",
                    (),
                )
        except Exception as exc:
            LOGGER.warning("author_follows notification columns failed: %s", exc)
            return
        _AUTHOR_FOLLOWS_READY = True
        _AUTHOR_FOLLOWS_TABLE_READY = True
        return
    try:
        cols = fetch_all("SHOW COLUMNS FROM author_follows")
        names = {str(c.get("Field") or c.get("field") or "").lower() for c in cols}
        if not names:
            return
        if "user_id" not in names and "follower_user_id" in names:
            execute_write("ALTER TABLE author_follows ADD COLUMN user_id INT NULL", ())
            execute_write(
                "UPDATE author_follows SET user_id = follower_user_id WHERE user_id IS NULL",
                (),
            )
        if "author_id" not in names and "author_user_id" in names:
            execute_write("ALTER TABLE author_follows ADD COLUMN author_id INT NULL", ())
            execute_write(
                "UPDATE author_follows SET author_id = author_user_id WHERE author_id IS NULL",
                (),
            )
        if "notify" not in names:
            execute_write(
                "ALTER TABLE author_follows ADD COLUMN notify TINYINT(1) NOT NULL DEFAULT 0",
                (),
            )
        if "last_book_id" not in names:
            execute_write(
                "ALTER TABLE author_follows ADD COLUMN last_book_id INT NOT NULL DEFAULT 0",
                (),
            )
        if "notify_since" not in names:
            execute_write(
                "ALTER TABLE author_follows ADD COLUMN notify_since TIMESTAMP NULL DEFAULT NULL",
                (),
            )
    except Exception as exc:
        LOGGER.warning("author_follows column ensure failed: %s", exc)
    _AUTHOR_FOLLOWS_READY = True


    _AUTHOR_FOLLOWS_TABLE_READY = True

def _count_followers(author_id: int) -> int:
    try:
        _ensure_author_follows_table()
        rows = fetch_all(
            "SELECT COUNT(*) AS c FROM author_follows WHERE author_id=%s",
            (author_id,),
        )
        return int(rows[0]["c"]) if rows else 0
    except Exception as exc:
        LOGGER.warning("count followers failed for %s: %s", author_id, exc)
        return 0


def _count_following(user_id: int) -> int:
    try:
        _ensure_author_follows_table()
        rows = fetch_all(
            "SELECT COUNT(*) AS c FROM author_follows WHERE user_id=%s",
            (user_id,),
        )
        return int(rows[0]["c"]) if rows else 0
    except Exception as exc:
        LOGGER.warning("count following failed for %s: %s", user_id, exc)
        return 0


# backward-compatible alias
def _ensure_author_follows_columns() -> None:
    _ensure_author_follows_table()




_BOOK_LIKES_TABLE_READY = False


def _ensure_book_likes_table() -> None:
    """Memoized schema ensure — runs once per serverless instance."""
    global _BOOK_LIKES_TABLE_READY
    if _BOOK_LIKES_TABLE_READY:
        return
    try:
        if USE_SQLITE:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS book_likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    book_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, book_id)
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS book_likes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    book_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_book_like (user_id, book_id)
                )
                """,
                (),
            )
    except Exception as exc:
        LOGGER.warning("book_likes ensure failed: %s", exc)
    _BOOK_LIKES_TABLE_READY = True


@app.get("/api/books/{book_id}/like")
def get_book_like(book_id: int, user: dict[str, Any] | None = Depends(optional_user)):
    """Public: returns likes_count for everyone; includes liked=true only when authenticated."""
    _ensure_book_likes_table()
    liked = False
    if user is not None:
        rows = fetch_all(
            "SELECT id FROM book_likes WHERE user_id=%s AND book_id=%s",
            (user["user_id"], book_id),
        )
        liked = bool(rows)
    count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM book_likes WHERE book_id=%s",
        (book_id,),
    )
    bump_content_version()
    return {
        "liked": liked,
        "likes_count": int(count_rows[0]["c"]) if count_rows else 0,
    }


@app.post("/api/books/{book_id}/like")
def like_book(book_id: int, user: dict[str, Any] = Depends(require_user)):
    """One like per user; repeated calls stay idempotent. Owner cannot like own book."""
    _ensure_book_likes_table()
    owner_rows = fetch_all(
        "SELECT user_id, title FROM books WHERE id=%s LIMIT 1", (book_id,)
    )
    owner_id = int(_row_get(owner_rows[0], "user_id") or 0) if owner_rows else 0
    book_title = str(_row_get(owner_rows[0], "title") or "your story") if owner_rows else "your story"
    if owner_id and owner_id == int(user["user_id"]):
        count_rows = fetch_all(
            "SELECT COUNT(*) AS c FROM book_likes WHERE book_id=%s",
            (book_id,),
        )
        bump_content_version()
        return {
            "ok": False,
            "liked": False,
            "likes_count": int(count_rows[0]["c"]) if count_rows else 0,
            "self": True,
            "detail": "You cannot like your own story",
        }
    existing = fetch_all(
        "SELECT id FROM book_likes WHERE user_id=%s AND book_id=%s LIMIT 1",
        (user["user_id"], book_id),
    )
    if _live_use_sqlite():
        execute_write(
            "INSERT OR IGNORE INTO book_likes (user_id, book_id) VALUES (%s, %s)",
            (user["user_id"], book_id),
        )
    else:
        execute_write(
            "INSERT IGNORE INTO book_likes (user_id, book_id) VALUES (%s, %s)",
            (user["user_id"], book_id),
        )
    count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM book_likes WHERE book_id=%s",
        (book_id,),
    )
    if not existing:
        _record_writer_analytics_event(
            book_id,
            "like",
            actor_user_id=int(user["user_id"]),
        )
    if not existing and owner_id and owner_id != int(user["user_id"]):
        _send_push_to_user(
            owner_id,
            f"Someone liked {book_title}",
            "Your story received a like.",
            {"type": "like", "book_id": str(book_id)},
            preference="likes",
        )
    return {
        "ok": True,
        "liked": True,
        "likes_count": int(count_rows[0]["c"]) if count_rows else 0,
    }


@app.delete("/api/books/{book_id}/like")
def unlike_book(book_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_book_likes_table()
    _, affected = execute_write(
        "DELETE FROM book_likes WHERE user_id=%s AND book_id=%s",
        (user["user_id"], book_id),
    )
    if affected:
        _record_writer_analytics_event(
            book_id,
            "unlike",
            actor_user_id=int(user["user_id"]),
        )
    count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM book_likes WHERE book_id=%s",
        (book_id,),
    )
    return {
        "ok": True,
        "liked": False,
        "likes_count": int(count_rows[0]["c"]) if count_rows else 0,
    }

@app.post("/api/authors/{author_id}/follow")
def follow_author(author_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_author_follows_table()
    if not fetch_all("SELECT id FROM app_users WHERE id=%s LIMIT 1", (author_id,)):
        raise HTTPException(status_code=404, detail="Author not found")
    if user["user_id"] == author_id:
        # Soft no-op: self-follow is not an error (avoids red errors in the app)
        return {
            "ok": True,
            "following": False,
            "followers": _count_followers(author_id),
            "following_count": _count_following(user["user_id"]),
            "self": True,
        }
    was_following = bool(fetch_all(
        "SELECT id FROM author_follows WHERE user_id=%s AND author_id=%s LIMIT 1",
        (user["user_id"], author_id),
    ))
    if _live_use_sqlite():
        execute_write(
            """
            INSERT OR IGNORE INTO author_follows (user_id, author_id, last_book_id)
            VALUES (%s, %s, COALESCE((SELECT MAX(id) FROM books WHERE user_id=%s), 0))
            """,
            (user["user_id"], author_id, author_id),
        )
    else:
        execute_write(
            """
            INSERT IGNORE INTO author_follows (user_id, author_id, last_book_id)
            VALUES (%s, %s, COALESCE((SELECT MAX(id) FROM books WHERE user_id=%s), 0))
            """,
            (user["user_id"], author_id, author_id),
        )
    followers = _count_followers(author_id)
    following_count = _count_following(user["user_id"])
    if not was_following:
        author_stories = fetch_all(
            "SELECT id FROM books WHERE user_id=%s",
            (author_id,),
        )
        for author_story in author_stories:
            _record_writer_analytics_event(
                int(_row_get(author_story, "id") or 0),
                "follow",
                actor_user_id=int(user["user_id"]),
            )
    bump_content_version()
    return {
        "ok": True,
        "following": True,
        "notifications_enabled": False,
        "followers": followers,
        "following_count": following_count,
    }


@app.get("/api/authors/{author_id}/follow")
def check_author_follow(author_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_author_follows_table()
    rows = fetch_all(
        "SELECT id, notify FROM author_follows WHERE user_id=%s AND author_id=%s",
        (user["user_id"], author_id),
    )
    return {
        "following": bool(rows),
        "notifications_enabled": bool(int(_row_get(rows[0], "notify") or 0)) if rows else False,
    }


@app.put("/api/authors/{author_id}/notifications")
def set_author_notifications(
    author_id: int,
    payload: AuthorNotificationPreferenceRequest,
    user: dict[str, Any] = Depends(require_user),
):
    _ensure_author_follows_table()
    uid = int(user["user_id"])
    rows = fetch_all(
        "SELECT id FROM author_follows WHERE user_id=%s AND author_id=%s LIMIT 1",
        (uid, author_id),
    )
    if not rows:
        raise HTTPException(status_code=409, detail="Follow this author before enabling notifications")
    if payload.enabled:
        latest_book = fetch_all(
            """
            SELECT COALESCE(MAX(id), 0) AS latest_id
            FROM books
            WHERE user_id=%s
              AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'draft%%'
              AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'unpublish%%'
              AND LOWER(TRIM(COALESCE(status_text, ''))) NOT IN ('private', 'unlisted', '')
            """,
            (author_id,),
        )
        last_book_id = int(_row_get(latest_book[0], "latest_id") or 0) if latest_book else 0
        execute_write(
            """
            UPDATE author_follows
            SET notify=1, last_book_id=%s, notify_since=CURRENT_TIMESTAMP
            WHERE user_id=%s AND author_id=%s
            """,
            (last_book_id, uid, author_id),
        )
    else:
        execute_write(
            "UPDATE author_follows SET notify=0 WHERE user_id=%s AND author_id=%s",
            (uid, author_id),
        )
    bump_content_version()
    return {"ok": True, "notifications_enabled": payload.enabled}


@app.delete("/api/authors/{author_id}/follow")
def unfollow_author(author_id: int, user: dict[str, Any] = Depends(require_user)):
    _ensure_author_follows_table()
    was_following = bool(fetch_all(
        "SELECT id FROM author_follows WHERE user_id=%s AND author_id=%s LIMIT 1",
        (user["user_id"], author_id),
    ))
    _, affected = execute_write(
        "DELETE FROM author_follows WHERE user_id=%s AND author_id=%s",
        (user["user_id"], author_id),
    )
    if was_following and affected:
        author_stories = fetch_all(
            "SELECT id FROM books WHERE user_id=%s",
            (author_id,),
        )
        for author_story in author_stories:
            _record_writer_analytics_event(
                int(_row_get(author_story, "id") or 0),
                "unfollow",
                actor_user_id=int(user["user_id"]),
            )
    # Idempotent: treat missing row as already unfollowed
    followers = _count_followers(author_id)
    following_count = _count_following(user["user_id"])
    bump_content_version()
    return {
        "ok": True,
        "following": False,
        "notifications_enabled": False,
        "followers": followers,
        "following_count": following_count,
    }


@app.get("/api/authors/{author_id}/books")
def list_author_books(author_id: int, exclude_id: int | None = None):
    """Public list of published books by a given author (user_id)."""
    if exclude_id is not None:
        rows = fetch_all(
            """
            SELECT id, user_id, title, author, description, genre, cover_path, accent_hex,
                   status_text, rating
            FROM books
            WHERE user_id=%s AND id!=%s
              AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'draft%' AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'unpublish%' AND LOWER(TRIM(COALESCE(status_text, ''))) NOT IN ('private', 'unlisted', '')
            ORDER BY id DESC
            LIMIT 20
            """,
            (author_id, exclude_id),
        )
    else:
        rows = fetch_all(
            """
            SELECT id, user_id, title, author, description, genre, cover_path, accent_hex,
                   status_text, rating
            FROM books
            WHERE user_id=%s
              AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'draft%' AND LOWER(TRIM(COALESCE(status_text, ''))) NOT LIKE 'unpublish%' AND LOWER(TRIM(COALESCE(status_text, ''))) NOT IN ('private', 'unlisted', '')
            ORDER BY id DESC
            LIMIT 20
            """,
            (author_id,),
        )
    return {"items": [_serialize_book(row) for row in rows]}


@app.get("/api/authors/follow")
def fetch_authors_follow(
    ids: str = Query(default=""), user: dict[str, Any] = Depends(require_user)
):
    _ensure_author_follows_columns()
    # ids expected as comma-separated list of author ids, e.g. ids=1,2,3
    raw = ids or ""
    id_list = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            id_list.append(int(part))
        except ValueError:
            continue
    if not id_list:
        return {"following": {}}

    placeholders = ",".join(["%s"] * len(id_list))
    sql = f"SELECT author_id FROM author_follows WHERE user_id=%s AND author_id IN ({placeholders})"
    params: list[Any] = [user["user_id"]] + id_list
    rows = fetch_all(sql, tuple(params))
    followed = {r["author_id"] for r in rows}
    result = {str(i): (i in followed) for i in id_list}
    return {"following": result}


@app.delete("/api/write/stories/{story_id}")
def delete_writer_story(story_id: int, user: dict[str, Any] = Depends(require_user)):
    rows = fetch_all(
        "SELECT status_text FROM books WHERE id=%s AND user_id=%s LIMIT 1",
        (story_id, user["user_id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Story not found")
    story_status = str(_row_get(rows[0], "status_text") or "Draft").strip().lower()
    if story_status != "draft":
        raise HTTPException(
            status_code=409,
            detail="Move the story to Draft before deleting it",
        )
    chapters = fetch_all(
        "SELECT id FROM chapters WHERE story_id=%s LIMIT 1",
        (story_id,),
    )
    if chapters:
        raise HTTPException(
            status_code=409,
            detail="Delete all chapters before deleting the story.",
        )
    _, affected = execute_write(
        """
        DELETE FROM books
        WHERE id=%s AND user_id=%s
          AND LOWER(TRIM(COALESCE(status_text, 'draft'))) = 'draft'
          AND NOT EXISTS (
              SELECT 1 FROM chapters
              WHERE chapters.story_id=books.id
          )
        """,
        (story_id, user["user_id"]),
    )
    if affected == 0:
        still_exists = fetch_all(
            "SELECT id FROM books WHERE id=%s AND user_id=%s LIMIT 1",
            (story_id, user["user_id"]),
        )
        if still_exists:
            raise HTTPException(
                status_code=409,
                detail="The story changed. Refresh Manage Story and try again.",
            )
        raise HTTPException(status_code=404, detail="Story not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/bootstrap")
def admin_bootstrap(_: dict[str, Any] = Depends(require_admin)):
    categories = fetch_all(
        "SELECT id, name, topic_count, tab_group, sort_order, COALESCE(image_path, '') AS image_path FROM categories ORDER BY tab_group, sort_order, id"
    )
    books = fetch_all(
        """
        SELECT id, title, author, description, cover_path, accent_hex, section_name,
               status_text, rating, genre, cta_label, sort_order
        FROM books
        ORDER BY sort_order, id
        """
    )
    notifications = fetch_all(
        "SELECT id, tab_name, title, message, created_at, sort_order FROM notifications ORDER BY sort_order, id"
    )
    menu_items = fetch_all(
        "SELECT id, section_name, section_order, label, icon_name, route_name, sort_order FROM menu_items ORDER BY section_order, sort_order, id"
    )
    write_screen_rows = fetch_all(
        "SELECT id, manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta FROM write_screen ORDER BY id ASC LIMIT 1"
    )
    profile_rows = fetch_all(
        "SELECT id, display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak FROM profiles ORDER BY id ASC LIMIT 1"
    )
    reading_lists = fetch_all(
        "SELECT id, profile_id, name, story_count, cover_path, sort_order FROM reading_lists ORDER BY sort_order, id"
    )
    achievements = fetch_all(
        "SELECT id, group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order FROM achievements ORDER BY group_order, sort_order, id"
    )
    support_requests = fetch_all(
        "SELECT id, email, first_name, issue, subject, description, device_type, attachment_path, status, created_at FROM support_requests ORDER BY created_at DESC, id DESC"
    )

    return {
        "categories": categories,
        "books": [
            {**book, "cover_path": _normalize_cover_path(book["cover_path"])}
            for book in books
        ],
        "notifications": notifications,
        "menu_items": menu_items,
        "write_screen": write_screen_rows[0] if write_screen_rows else None,
        "profile": profile_rows[0] if profile_rows else None,
        "reading_lists": reading_lists,
        "achievements": achievements,
        "support_requests": support_requests,
        "stats": {
            "category_count": len(categories),
            "book_count": len(books),
            "notification_count": len(notifications),
            "menu_item_count": len(menu_items),
            "reading_list_count": len(reading_lists),
            "achievement_count": len(achievements),
            "support_request_count": len(support_requests),
        },
    }


@app.get("/api/admin/support-requests")
def admin_get_support_requests(_: dict[str, Any] = Depends(require_admin)):
    _ensure_support_request_columns()
    try:
        rows = fetch_all(
            "SELECT id, email, first_name, issue, subject, description, device_type, attachment_path, status, created_at, admin_reply, user_id, replied_at FROM support_requests ORDER BY created_at DESC, id DESC"
        )
    except Exception:
        rows = fetch_all(
            "SELECT id, email, first_name, issue, subject, description, device_type, attachment_path, status, created_at FROM support_requests ORDER BY created_at DESC, id DESC"
        )
    return {"items": rows}


@app.put("/api/admin/support-requests/{request_id}")
def admin_update_support_request(
    request_id: int,
    payload: SupportRequestUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    """Update status and/or store admin reply. Reply becomes a user notification."""
    _ensure_support_request_columns()
    rows = fetch_all("SELECT * FROM support_requests WHERE id=%s LIMIT 1", (request_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Support request not found")
    row = rows[0]
    status = payload.status if payload.status is not None else (_row_get(row, "status") or "open")
    reply = (payload.admin_reply or "").strip()
    if reply:
        try:
            execute_write(
                """
                UPDATE support_requests
                SET status=%s, admin_reply=%s, replied_at=CURRENT_TIMESTAMP
                WHERE id=%s
                """,
                (status, reply, request_id),
            )
        except Exception:
            execute_write(
                "UPDATE support_requests SET status=%s WHERE id=%s",
                (status, request_id),
            )
        # Create a durable user notification row if we can resolve the user
        uid = _row_get(row, "user_id")
        email = (_row_get(row, "email") or "").strip().lower()
        if not uid and email:
            try:
                urows = fetch_all(
                    "SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1",
                    (email,),
                )
                if urows:
                    uid = _row_get(urows[0], "id")
            except Exception:
                uid = None
        if uid:
            try:
                _ensure_user_support_notifications_table()
                execute_write(
                    """
                    INSERT INTO user_support_notifications
                        (user_id, support_request_id, title, message, is_read)
                    VALUES (%s, %s, %s, %s, 0)
                    """,
                    (
                        int(uid),
                        request_id,
                        "Support reply",
                        reply[:2000],
                    ),
                )
            except Exception as exc:
                LOGGER.warning("support reply notification: %s", exc)
    else:
        _, affected = execute_write(
            "UPDATE support_requests SET status=%s WHERE id=%s",
            (status, request_id),
        )
        if affected == 0:
            raise HTTPException(status_code=404, detail="Support request not found")
    bump_content_version()
    return {"ok": True, "status": status, "has_reply": bool(reply)}


_USER_SUPPORT_NOTIFICATIONS_TABLE_READY = False


def _ensure_user_support_notifications_table() -> None:
    global _USER_SUPPORT_NOTIFICATIONS_TABLE_READY
    if _USER_SUPPORT_NOTIFICATIONS_TABLE_READY:
        return
    try:
        if _live_use_sqlite():
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS user_support_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    support_request_id INTEGER,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    is_read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS user_support_notifications (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    support_request_id INT NULL,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    is_read TINYINT(1) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX (user_id)
                )
                """,
                (),
            )
        _USER_SUPPORT_NOTIFICATIONS_TABLE_READY = True
    except Exception as exc:
        LOGGER.warning("user_support_notifications table: %s", exc)



@app.get("/api/public/genre-covers")
def public_genre_covers(response: Response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    rows = fetch_all(
        """
        SELECT name, COALESCE(image_path, '') AS image_path
        FROM categories
        WHERE COALESCE(image_path, '') <> ''
        ORDER BY tab_group, sort_order, id
        """
    ) or []
    return {
        "items": [
            {
                "name": str(row.get("name") or ""),
                "image_path": str(row.get("image_path") or ""),
            }
            for row in rows
            if row.get("name") and row.get("image_path")
        ]
    }


@app.post("/api/admin/categories")
def admin_create_category(
    payload: CategoryCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write(
        "INSERT INTO categories (name, topic_count, tab_group, sort_order, image_path) VALUES (%s, %s, %s, %s, %s)",
        (payload.name, payload.topic_count, payload.tab_group, payload.sort_order, payload.image_path or ""),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to create category")
    bump_content_version()
    return {"ok": True}


@app.put("/api/admin/categories/{category_id}")
def admin_update_category(
    category_id: int,
    payload: CategoryUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM categories WHERE id=%s", (category_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Category not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE categories
        SET name=%s, topic_count=%s, tab_group=%s, sort_order=%s, image_path=%s
        WHERE id=%s
        """,
        (
            payload.name or current["name"],
            payload.topic_count if payload.topic_count is not None else current["topic_count"],
            payload.tab_group or current["tab_group"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            payload.image_path if payload.image_path is not None else current.get("image_path") or "",
            category_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update category")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/categories/{category_id}")
def admin_delete_category(
    category_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM categories WHERE id=%s", (category_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    bump_content_version()
    return {"ok": True}


@app.post("/api/admin/books")
def admin_create_book(
    payload: AdminBookCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    # Admin-created novels start private; chapter publication determines public status.
    status_text = "Draft"
    book_id, _ = execute_write(
        """
        INSERT INTO books (
            title, author, description, cover_path, accent_hex, section_name,
            status_text, rating, genre, cta_label, sort_order
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            payload.title,
            payload.author,
            payload.description,
            payload.cover_path,
            payload.accent_hex,
            payload.section_name,
            status_text,
            payload.rating,
            payload.genre,
            payload.cta_label,
            payload.sort_order,
        ),
    )
    # Optional chapters in the same request
    chapters = payload.chapters or []
    for i, ch in enumerate(chapters):
        if not isinstance(ch, dict):
            continue
        title = (ch.get("title") or f"Chapter {i + 1}").strip()
        content = (ch.get("content") or "").strip()
        if not title and not content:
            continue
        num = int(ch.get("chapter_number") or (i + 1))
        status = str(ch.get("submission_status") or "draft").strip().lower() or "draft"
        live_statuses = {"published", "submitted", "ongoing", "completed"}
        if status in live_statuses:
            if num > 1:
                _require_previous_chapters_published(book_id, num)
            _require_completed_story_details(book_id)
        try:
            execute_write(
                """
                INSERT INTO chapters (
                    story_id, chapter_number, title, content, notes, submission_status, sort_order
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (book_id, num, title or f"Chapter {num}", content, "", status, num),
            )
        except Exception as exc:
            LOGGER.warning("admin create chapter failed: %s", exc)
    _sync_story_status_from_chapters(book_id)
    bump_content_version()
    return {"ok": True, "id": book_id}


@app.get("/api/admin/books/{book_id}/chapters")
def admin_list_book_chapters(book_id: int, _: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        """
        SELECT id, story_id, chapter_number, title, content, notes, submission_status, sort_order
        FROM chapters WHERE story_id=%s ORDER BY chapter_number, sort_order, id
        """,
        (book_id,),
    )
    return {"items": rows or []}


@app.post("/api/admin/books/{book_id}/chapters")
def admin_create_book_chapter(
    book_id: int,
    payload: dict[str, Any],
    _: dict[str, Any] = Depends(require_admin),
):
    story = fetch_all("SELECT id FROM books WHERE id=%s", (book_id,))
    if not story:
        raise HTTPException(status_code=404, detail="Book not found")
    num = payload.get("chapter_number")
    if num is None:
        next_rows = fetch_all(
            "SELECT COALESCE(MAX(chapter_number), 0) + 1 AS n FROM chapters WHERE story_id=%s",
            (book_id,),
        )
        num = int(next_rows[0]["n"]) if next_rows else 1
    title = (payload.get("title") or f"Chapter {num}").strip()
    content = payload.get("content") or ""
    status = (payload.get("submission_status") or "draft").strip().lower() or "draft"
    if status in {"published", "submitted", "ongoing", "completed"}:
        _require_completed_story_details(book_id)
        _require_previous_chapters_published(book_id, int(num))
    row_id, _ = execute_write(
        """
        INSERT INTO chapters (
            story_id, chapter_number, title, content, notes, submission_status, sort_order
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (book_id, int(num), title, content, payload.get("notes") or "", status, int(num)),
    )
    _sync_story_status_from_chapters(book_id)
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.put("/api/admin/books/{book_id}")
def admin_update_book(
    book_id: int,
    payload: AdminBookUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM books WHERE id=%s", (book_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Book not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE books
        SET title=%s, author=%s, description=%s, cover_path=%s, accent_hex=%s,
            section_name=%s, status_text=%s, rating=%s, genre=%s, cta_label=%s, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.title or current["title"],
            payload.author or current["author"],
            payload.description or current["description"],
            payload.cover_path if payload.cover_path is not None else current["cover_path"],
            payload.accent_hex or current["accent_hex"],
            payload.section_name or current["section_name"],
            payload.status_text or current["status_text"],
            payload.rating if payload.rating is not None else current["rating"],
            payload.genre or current["genre"],
            payload.cta_label or current["cta_label"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            book_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update book")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/books/{book_id}")
def admin_delete_book(
    book_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM books WHERE id=%s", (book_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Book not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/notifications")
def admin_get_notifications(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, tab_name, title, message, created_at, sort_order FROM notifications ORDER BY sort_order, id"
    )
    return {"items": rows}


@app.post("/api/admin/notifications")
def admin_create_notification(
    payload: AdminNotificationCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    row_id, _ = execute_write(
        """
        INSERT INTO notifications (tab_name, title, message, created_at, sort_order)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            payload.tab_name,
            payload.title,
            payload.message,
            payload.created_at,
            payload.sort_order,
        ),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.put("/api/admin/notifications/{notification_id}")
def admin_update_notification(
    notification_id: int,
    payload: AdminNotificationUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM notifications WHERE id=%s", (notification_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Notification not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE notifications
        SET tab_name=%s, title=%s, message=%s, created_at=CURRENT_TIMESTAMP, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.tab_name or current["tab_name"],
            payload.title or current["title"],
            payload.message or current["message"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            notification_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update notification")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/notifications/{notification_id}")
def admin_delete_notification(
    notification_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM notifications WHERE id=%s", (notification_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/menu-items")
def admin_get_menu_items(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, section_name, section_order, label, icon_name, route_name, sort_order FROM menu_items ORDER BY section_order, sort_order, id"
    )
    return {"items": rows}


@app.post("/api/admin/menu-items")
def admin_create_menu_item(
    payload: AdminMenuItemCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    row_id, _ = execute_write(
        """
        INSERT INTO menu_items (section_name, section_order, label, icon_name, route_name, sort_order)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            payload.section_name,
            payload.section_order,
            payload.label,
            payload.icon_name,
            payload.route_name,
            payload.sort_order,
        ),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.put("/api/admin/menu-items/{menu_item_id}")
def admin_update_menu_item(
    menu_item_id: int,
    payload: AdminMenuItemUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM menu_items WHERE id=%s", (menu_item_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Menu item not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE menu_items
        SET section_name=%s, section_order=%s, label=%s, icon_name=%s, route_name=%s, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.section_name or current["section_name"],
            payload.section_order if payload.section_order is not None else current["section_order"],
            payload.label or current["label"],
            payload.icon_name or current["icon_name"],
            payload.route_name or current["route_name"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            menu_item_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update menu item")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/menu-items/{menu_item_id}")
def admin_delete_menu_item(
    menu_item_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM menu_items WHERE id=%s", (menu_item_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Menu item not found")
    bump_content_version()
    return {"ok": True}


def _validated_home_hero_image_path(image_path: str) -> str:
    path = (image_path or "").strip()
    if not path or len(path) > 2048:
        raise HTTPException(status_code=400, detail="A valid hero image path is required")
    if not path.startswith("/") and not path.lower().startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="Hero image path must be a site path or HTTP(S) URL")
    return path


@app.get("/api/home-hero-images")
def public_home_hero_images():
    _ensure_home_hero_images_table()
    rows = fetch_all(
        """
        SELECT id, title, image_path, sort_order
        FROM home_hero_images
        WHERE is_active=1
        ORDER BY sort_order ASC, id ASC
        LIMIT 5
        """
    ) or []
    return {"items": rows}


@app.get("/api/admin/home-hero-images")
def admin_list_home_hero_images(_: dict[str, Any] = Depends(require_admin)):
    _ensure_home_hero_images_table()
    rows = fetch_all(
        """
        SELECT id, title, image_path, sort_order, is_active, created_at
        FROM home_hero_images
        ORDER BY sort_order ASC, id ASC
        """
    ) or []
    return {"items": rows}


@app.post("/api/admin/home-hero-images")
def admin_create_home_hero_image(
    payload: HomeHeroImageCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_hero_images_table()
    title = (payload.title or "").strip()
    if len(title) > 160:
        raise HTTPException(status_code=400, detail="Hero image title must be 160 characters or fewer")
    image_path = _validated_home_hero_image_path(payload.image_path)
    count_rows = fetch_all("SELECT COUNT(*) AS c FROM home_hero_images") or []
    count_row = count_rows[0] if count_rows else {"c": 0}
    image_count = int(count_row.get("c") if isinstance(count_row, dict) else count_row[0] or 0)
    if image_count >= 5:
        raise HTTPException(status_code=400, detail="You can use up to five hero backgrounds. Delete one before adding another.")
    image_id, _ = execute_write(
        """
        INSERT INTO home_hero_images (title, image_path, sort_order, is_active)
        VALUES (%s, %s, %s, %s)
        """,
        (title, image_path, int(payload.sort_order), 1 if payload.is_active else 0),
    )
    bump_content_version()
    return {"ok": True, "id": image_id}


@app.put("/api/admin/home-hero-images/{image_id}")
def admin_update_home_hero_image(
    image_id: int,
    payload: HomeHeroImageUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_hero_images_table()
    rows = fetch_all("SELECT * FROM home_hero_images WHERE id=%s", (image_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Hero image not found")
    current = rows[0]
    title = current["title"] if payload.title is None else payload.title.strip()
    image_path = current["image_path"] if payload.image_path is None else _validated_home_hero_image_path(payload.image_path)
    sort_order = current["sort_order"] if payload.sort_order is None else int(payload.sort_order)
    is_active = current["is_active"] if payload.is_active is None else (1 if payload.is_active else 0)
    if len(title) > 160:
        raise HTTPException(status_code=400, detail="Hero image title must be 160 characters or fewer")
    execute_write(
        """
        UPDATE home_hero_images
        SET title=%s, image_path=%s, sort_order=%s, is_active=%s
        WHERE id=%s
        """,
        (title, image_path, sort_order, is_active, image_id),
    )
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/home-hero-images/{image_id}")
def admin_delete_home_hero_image(
    image_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_hero_images_table()
    _, affected = execute_write("DELETE FROM home_hero_images WHERE id=%s", (image_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Hero image not found")
    bump_content_version()
    return {"ok": True}




@app.get("/api/home-sections")
def public_home_sections():
    """Public list of active home slider sections (for Flutter labels/order)."""
    _ensure_home_slider_sections_table()
    rows = fetch_all(
        """
        SELECT id, section_key, label, description, sort_order, is_active
        FROM home_slider_sections
        WHERE is_active=1
        ORDER BY sort_order ASC, id ASC
        """
    ) or []
    return {"items": rows}


@app.get("/api/admin/home-sections")
def admin_list_home_sections(_: dict[str, Any] = Depends(require_admin)):
    _ensure_home_slider_sections_table()
    rows = fetch_all(
        """
        SELECT id, section_key, label, description, sort_order, is_active, created_at
        FROM home_slider_sections
        ORDER BY sort_order ASC, id ASC
        """
    ) or []
    # Attach book counts
    items = []
    for r in rows:
        key = r.get("section_key") if isinstance(r, dict) else r[1]
        try:
            cnt_rows = fetch_all(
                "SELECT COUNT(*) AS c FROM books WHERE section_name=%s",
                (key,),
            ) or []
            c0 = cnt_rows[0] if cnt_rows else {"c": 0}
            count = int(c0.get("c") if isinstance(c0, dict) else c0[0] or 0)
        except Exception:
            count = 0
        item = dict(r) if isinstance(r, dict) else {
            "id": r[0],
            "section_key": r[1],
            "label": r[2],
            "description": r[3],
            "sort_order": r[4],
            "is_active": r[5],
        }
        item["book_count"] = count
        items.append(item)
    return {"items": items}


@app.post("/api/admin/home-sections")
def admin_create_home_section(
    payload: HomeSliderSectionCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_slider_sections_table()
    key = (payload.section_key or "").strip().lower().replace(" ", "_")
    label = (payload.label or "").strip()
    if not key or not label:
        raise HTTPException(status_code=400, detail="section_key and label required")
    try:
        row_id, _ = execute_write(
            """
            INSERT INTO home_slider_sections
                (section_key, label, description, sort_order, is_active)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                key,
                label,
                (payload.description or "").strip(),
                int(payload.sort_order or 100),
                1 if payload.is_active else 0,
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not create section: {exc}") from exc
    bump_content_version()
    return {"ok": True, "id": row_id, "section_key": key}


@app.put("/api/admin/home-sections/{section_id}")
def admin_update_home_section(
    section_id: int,
    payload: HomeSliderSectionUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_slider_sections_table()
    rows = fetch_all("SELECT * FROM home_slider_sections WHERE id=%s", (section_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Section not found")
    cur = rows[0]
    if not isinstance(cur, dict):
        raise HTTPException(status_code=500, detail="Unexpected row format")
    new_key = (payload.section_key or cur["section_key"]).strip().lower().replace(" ", "_")
    old_key = cur["section_key"]
    label = (payload.label if payload.label is not None else cur["label"]).strip()
    desc = payload.description if payload.description is not None else cur.get("description") or ""
    sort_order = payload.sort_order if payload.sort_order is not None else cur["sort_order"]
    is_active = (
        (1 if payload.is_active else 0)
        if payload.is_active is not None
        else int(cur.get("is_active") or 0)
    )
    execute_write(
        """
        UPDATE home_slider_sections
        SET section_key=%s, label=%s, description=%s, sort_order=%s, is_active=%s
        WHERE id=%s
        """,
        (new_key, label, desc, int(sort_order), is_active, section_id),
    )
    # If key renamed, move books to new section_name
    if new_key != old_key:
        try:
            execute_write(
                "UPDATE books SET section_name=%s WHERE section_name=%s",
                (new_key, old_key),
            )
        except Exception as exc:
            LOGGER.warning("book section rename: %s", exc)
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/home-sections/{section_id}")
def admin_delete_home_section(
    section_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_home_slider_sections_table()
    rows = fetch_all("SELECT section_key FROM home_slider_sections WHERE id=%s", (section_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Section not found")
    key = rows[0].get("section_key") if isinstance(rows[0], dict) else rows[0][0]
    _, affected = execute_write("DELETE FROM home_slider_sections WHERE id=%s", (section_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Section not found")
    # Move books off this section to recently_updated so they don't disappear
    try:
        execute_write(
            "UPDATE books SET section_name=%s WHERE section_name=%s",
            ("recently_updated", key),
        )
    except Exception as exc:
        LOGGER.warning("reassign books after section delete: %s", exc)
    bump_content_version()
    return {"ok": True}


@app.post("/api/admin/home-sections/assign-books")
def admin_assign_books_to_section(
    payload: HomeSliderAssignBooksRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    """Assign one or more books to a home slider section_key."""
    _ensure_home_slider_sections_table()
    key = (payload.section_key or "").strip().lower().replace(" ", "_")
    if not key:
        raise HTTPException(status_code=400, detail="section_key required")
    if not payload.book_ids:
        raise HTTPException(status_code=400, detail="book_ids required")
    updated = 0
    for bid in payload.book_ids:
        try:
            _, n = execute_write(
                "UPDATE books SET section_name=%s WHERE id=%s",
                (key, int(bid)),
            )
            updated += int(n or 0)
        except Exception as exc:
            LOGGER.warning("assign book %s: %s", bid, exc)
    bump_content_version()
    return {"ok": True, "updated": updated, "section_key": key}


@app.get("/api/admin/home-sections/{section_key}/books")
def admin_list_section_books(
    section_key: str,
    _: dict[str, Any] = Depends(require_admin),
):
    key = section_key.strip().lower()
    rows = fetch_all(
        """
        SELECT id, title, author, cover_path, section_name, status_text, rating, genre
        FROM books
        WHERE section_name=%s
        ORDER BY sort_order ASC, id DESC
        LIMIT 200
        """,
        (key,),
    ) or []
    return {"items": rows, "section_key": key}


@app.get("/api/admin/write-screen")
def admin_get_write_screen(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta FROM write_screen ORDER BY id ASC LIMIT 1"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Write screen config not found")
    return rows[0]


@app.put("/api/admin/write-screen")
def admin_update_write_screen(
    payload: AdminWriteScreenUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT id FROM write_screen ORDER BY id ASC LIMIT 1")
    if not rows:
        execute_write(
            """
            INSERT INTO write_screen (manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                payload.manage_tabs,
                payload.story_tabs,
                payload.filter_label,
                payload.sort_label,
                payload.empty_title,
                payload.empty_cta,
            ),
        )
        bump_content_version()
        return {"ok": True}

    _, affected = execute_write(
        """
        UPDATE write_screen
        SET manage_tabs=%s, story_tabs=%s, filter_label=%s, sort_label=%s, empty_title=%s, empty_cta=%s
        WHERE id=%s
        """,
        (
            payload.manage_tabs,
            payload.story_tabs,
            payload.filter_label,
            payload.sort_label,
            payload.empty_title,
            payload.empty_cta,
            rows[0]["id"],
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update write screen config")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/profile")
def admin_get_profile(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak FROM profiles ORDER BY id ASC LIMIT 1"
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Profile not found")
    return rows[0]


@app.put("/api/admin/profile")
def admin_update_profile(
    payload: AdminProfileUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT id FROM profiles ORDER BY id ASC LIMIT 1")
    if not rows:
        execute_write(
            """
            INSERT INTO profiles (display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                payload.display_name,
                payload.username,
                payload.following,
                payload.followers,
                payload.blocked,
                payload.chapters_read,
                payload.social_karma,
                payload.day_streak,
            ),
        )
        bump_content_version()
        return {"ok": True}

    _, affected = execute_write(
        """
        UPDATE profiles
        SET display_name=%s, username=%s, following=%s, followers=%s, blocked=%s,
            chapters_read=%s, social_karma=%s, day_streak=%s
        WHERE id=%s
        """,
        (
            payload.display_name,
            payload.username,
            payload.following,
            payload.followers,
            payload.blocked,
            payload.chapters_read,
            payload.social_karma,
            payload.day_streak,
            rows[0]["id"],
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update profile")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/reading-lists")
def admin_get_reading_lists(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, profile_id, name, story_count, cover_path, sort_order FROM reading_lists ORDER BY sort_order, id"
    )
    return {"items": rows}


@app.post("/api/admin/reading-lists")
def admin_create_reading_list(
    payload: AdminReadingListCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    row_id, _ = execute_write(
        """
        INSERT INTO reading_lists (profile_id, name, story_count, cover_path, sort_order)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            payload.profile_id,
            payload.name,
            payload.story_count,
            payload.cover_path,
            payload.sort_order,
        ),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.put("/api/admin/reading-lists/{list_id}")
def admin_update_reading_list(
    list_id: int,
    payload: AdminReadingListUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM reading_lists WHERE id=%s", (list_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Reading list not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE reading_lists
        SET profile_id=%s, name=%s, story_count=%s, cover_path=%s, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.profile_id if payload.profile_id is not None else current["profile_id"],
            payload.name or current["name"],
            payload.story_count if payload.story_count is not None else current["story_count"],
            payload.cover_path if payload.cover_path is not None else current["cover_path"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            list_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update reading list")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/reading-lists/{list_id}")
def admin_delete_reading_list(
    list_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM reading_lists WHERE id=%s", (list_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Reading list not found")
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/achievements")
def admin_get_achievements(_: dict[str, Any] = Depends(require_admin)):
    rows = fetch_all(
        "SELECT id, group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order FROM achievements ORDER BY group_order, sort_order, id"
    )
    return {"items": rows}


@app.post("/api/admin/achievements")
def admin_create_achievement(
    payload: AdminAchievementCreateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    row_id, _ = execute_write(
        """
        INSERT INTO achievements (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            payload.group_name,
            payload.group_order,
            payload.title,
            payload.subtitle,
            payload.progress_label,
            payload.badge_value,
            payload.style,
            payload.sort_order,
        ),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


@app.put("/api/admin/achievements/{achievement_id}")
def admin_update_achievement(
    achievement_id: int,
    payload: AdminAchievementUpdateRequest,
    _: dict[str, Any] = Depends(require_admin),
):
    rows = fetch_all("SELECT * FROM achievements WHERE id=%s", (achievement_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Achievement not found")

    current = rows[0]
    _, affected = execute_write(
        """
        UPDATE achievements
        SET group_name=%s, group_order=%s, title=%s, subtitle=%s,
            progress_label=%s, badge_value=%s, style=%s, sort_order=%s
        WHERE id=%s
        """,
        (
            payload.group_name or current["group_name"],
            payload.group_order if payload.group_order is not None else current["group_order"],
            payload.title or current["title"],
            payload.subtitle or current["subtitle"],
            payload.progress_label or current["progress_label"],
            payload.badge_value or current["badge_value"],
            payload.style or current["style"],
            payload.sort_order if payload.sort_order is not None else current["sort_order"],
            achievement_id,
        ),
    )
    if affected == 0:
        raise HTTPException(status_code=400, detail="Failed to update achievement")
    bump_content_version()
    return {"ok": True}


@app.delete("/api/admin/achievements/{achievement_id}")
def admin_delete_achievement(
    achievement_id: int,
    _: dict[str, Any] = Depends(require_admin),
):
    _, affected = execute_write("DELETE FROM achievements WHERE id=%s", (achievement_id,))
    if affected == 0:
        raise HTTPException(status_code=404, detail="Achievement not found")
    bump_content_version()
    return {"ok": True}


# ----- Public profile data (wired to real tables) -----

@app.get("/api/users/{user_id}/stories")
def list_user_stories(user_id: int):
    """Public stories by this author using the shared schema-safe query."""
    return list_author_books(user_id)



@app.get("/api/users/{user_id}/reading-lists")
def list_user_reading_lists(user_id: int):
    """Public reading lists for a user profile.
    Note: reading_lists table has no is_public column in production — do not select it.
    """
    rows = fetch_all(
        """
        SELECT id, name, story_count, cover_path, sort_order
        FROM reading_lists
        WHERE user_id=%s
        ORDER BY sort_order, id DESC
        LIMIT 50
        """,
        (user_id,),
    )
    items = []
    for row in rows:
        cover = _normalize_cover_path(_row_get(row, "cover_path") or "")
        # collage covers from list items if available
        covers = []
        try:
            lid = _row_get(row, "id")
            if lid is not None:
                item_rows = fetch_all(
                    """
                    SELECT b.cover_path FROM reading_list_items rli
                    JOIN books b ON b.id = rli.book_id
                    WHERE rli.reading_list_id=%s
                    LIMIT 4
                    """,
                    (lid,),
                )
                for ir in item_rows:
                    p = _normalize_cover_path(_row_get(ir, "cover_path") or "")
                    if p:
                        covers.append(p)
        except Exception:
            pass
        items.append({
            "id": _row_get(row, "id"),
            "name": _row_get(row, "name") or "List",
            "story_count": int(_row_get(row, "story_count") or 0),
            "cover_path": cover,
            "covers": covers,
        })
    return {"items": items}


@app.get("/api/users/{user_id}/reviews")
def list_user_reviews(user_id: int):
    """Reviews written by this user."""
    rows = fetch_all(
        """
        SELECT r.id, r.book_id, r.user_id, r.rating, r.comment, r.created_at,
               b.title AS book_title, b.cover_path, b.author AS book_author,
               u.display_name AS reviewer_name
        FROM book_reviews r
        LEFT JOIN books b ON b.id = r.book_id
        LEFT JOIN app_users u ON u.id = r.user_id
        WHERE r.user_id=%s
        ORDER BY r.id DESC
        LIMIT 100
        """,
        (user_id,),
    )
    items = []
    for row in rows:
        comment = _row_get(row, "comment") or ""
        rating = int(_row_get(row, "rating") or 5)
        items.append({
            "id": _row_get(row, "id"),
            "book_id": _row_get(row, "book_id"),
            "book_title": _row_get(row, "book_title") or "Story",
            "book_author": _row_get(row, "book_author") or "",
            "cover_path": _normalize_cover_path(_row_get(row, "cover_path") or ""),
            "rating": rating,
            "comment": comment,
            "title": comment.split("\n")[0][:80] if comment else "Review",
            "plot": min(5, max(1, rating)),
            "writing_style": min(5, max(1, rating)),
            "grammar": min(5, max(1, max(1, rating - 1))),
            "created_at": str(_row_get(row, "created_at") or ""),
        })
    return {"items": items}


@app.get("/api/users/{user_id}/wall")
def list_user_wall(user_id: int):
    """Profile Wall: posts on this user's wall (single JOIN — avoids N+1 / 504 timeouts)."""
    _ensure_wall_posts_table()
    try:
        # One query with author join — never per-row SELECT (was timing out on Vercel 300s)
        rows = fetch_all(
            """
            SELECT w.id, w.user_id, w.target_user_id, w.body, w.image_path,
                   w.likes_count, w.created_at,
                   u.display_name AS sender_name,
                   u.photo_url AS sender_photo
            FROM wall_posts w
            LEFT JOIN app_users u ON u.id = w.user_id
            WHERE w.target_user_id=%s
            ORDER BY w.id DESC
            LIMIT 40
            """,
            (user_id,),
        )
    except Exception as exc:
        LOGGER.warning("list_user_wall query failed for %s: %s", user_id, exc)
        rows = []
    items = []
    for row in rows:
        uid = _row_get(row, "user_id")
        uname = (_row_get(row, "sender_name") or "User").strip() or "User"
        photo = _row_get(row, "sender_photo") or ""
        items.append({
            "id": _row_get(row, "id"),
            "user_id": uid,
            "sender_name": uname,
            "display_name": uname,
            "photo_url": photo,
            "body": _row_get(row, "body") or "",
            "message": _row_get(row, "body") or "",
            "image_path": _normalize_cover_path(_row_get(row, "image_path") or ""),
            "created_at": str(_row_get(row, "created_at") or ""),
            "likes": int(_row_get(row, "likes_count") or 0),
        })
    return {"items": items}


@app.post("/api/users/{user_id}/wall")
def post_user_wall(
    user_id: int,
    payload: dict[str, Any] | None = Body(default=None),
    user: dict[str, Any] = Depends(require_user),
):
    """Create a wall post on target user's profile (requires login)."""
    try:
        _ensure_wall_posts_table()
    except Exception as exc:
        LOGGER.warning("wall ensure before post: %s", exc)
    payload = payload or {}
    body = (payload.get("body") or payload.get("message") or payload.get("content") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Empty post")
    image_path = (
        payload.get("image_path")
        or payload.get("image_url")
        or payload.get("image")
        or ""
    )
    try:
        row_id, _ = execute_write(
            """
            INSERT INTO wall_posts (user_id, target_user_id, body, image_path, likes_count, created_at)
            VALUES (%s, %s, %s, %s, 0, CURRENT_TIMESTAMP)
            """,
            (user["user_id"], user_id, body, str(image_path) if image_path else ""),
        )
        return {"ok": True, "id": row_id, "body": body}
    except Exception as exc:
        LOGGER.exception("wall post failed: %s", exc)
        # Retry: force-add missing columns then insert
        try:
            global _WALL_POSTS_TABLE_READY
            _WALL_POSTS_TABLE_READY = False
            _ensure_wall_posts_table()
            try:
                row_id, _ = execute_write(
                    """
                    INSERT INTO wall_posts (user_id, target_user_id, body, image_path, likes_count, created_at)
                    VALUES (%s, %s, %s, %s, 0, CURRENT_TIMESTAMP)
                    """,
                    (user["user_id"], user_id, body, str(image_path) if image_path else ""),
                )
            except Exception:
                # Last resort: legacy schema without likes_count
                row_id, _ = execute_write(
                    """
                    INSERT INTO wall_posts (user_id, target_user_id, body, image_path, created_at)
                    VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
                    """,
                    (user["user_id"], user_id, body, str(image_path) if image_path else ""),
                )
            return {"ok": True, "id": row_id, "body": body}
        except Exception as exc2:
            LOGGER.exception("wall post retry failed: %s", exc2)
            raise HTTPException(
                status_code=500,
                detail=f"Could not create wall post. Please try again. ({type(exc2).__name__})",
            ) from exc2


def _ensure_wall_post_likes_table() -> None:
    """Per-user likes on wall posts (one like per account)."""
    try:
        if USE_SQLITE:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS wall_post_likes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(post_id, user_id)
                )
                """,
                (),
            )
        else:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS wall_post_likes (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    post_id INT NOT NULL,
                    user_id INT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE KEY uq_wall_like (post_id, user_id),
                    INDEX (post_id),
                    INDEX (user_id)
                )
                """,
                (),
            )
    except Exception as exc:
        LOGGER.warning("wall_post_likes ensure failed: %s", exc)


@app.delete("/api/wall/{post_id}")
def delete_wall_post(
    post_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    """Delete a wall post only when requested by its creator."""
    _ensure_wall_posts_table()
    rows = fetch_all(
        "SELECT user_id FROM wall_posts WHERE id=%s LIMIT 1",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")
    owner_id = int(_row_get(rows[0], "user_id") or 0)
    if owner_id != int(user["user_id"]):
        raise HTTPException(status_code=403, detail="You can only delete your own wall posts")
    execute_write(
        "DELETE FROM wall_posts WHERE id=%s AND user_id=%s",
        (post_id, owner_id),
    )
    bump_content_version()
    return {"ok": True, "id": post_id}


@app.post("/api/wall/{post_id}/like")
def like_wall_post(
    post_id: int,
    user: dict[str, Any] = Depends(require_user),
):
    """Toggle like on a wall post. One like per account; second tap unlikes."""
    _ensure_wall_posts_table()
    _ensure_wall_post_likes_table()
    rows = fetch_all(
        "SELECT id, user_id, target_user_id, likes_count FROM wall_posts WHERE id=%s LIMIT 1",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")
    uid = int(user["user_id"])
    existing = fetch_all(
        "SELECT id FROM wall_post_likes WHERE post_id=%s AND user_id=%s LIMIT 1",
        (post_id, uid),
    )
    if existing:
        execute_write(
            "DELETE FROM wall_post_likes WHERE post_id=%s AND user_id=%s",
            (post_id, uid),
        )
        liked = False
    else:
        try:
            execute_write(
                "INSERT INTO wall_post_likes (post_id, user_id) VALUES (%s, %s)",
                (post_id, uid),
            )
        except Exception:
            # race: already liked
            pass
        liked = True
    count_rows = fetch_all(
        "SELECT COUNT(*) AS c FROM wall_post_likes WHERE post_id=%s",
        (post_id,),
    )
    likes = int(_row_get(count_rows[0], "c") or 0) if count_rows else 0
    try:
        execute_write(
            "UPDATE wall_posts SET likes_count=%s WHERE id=%s",
            (likes, post_id),
        )
    except Exception:
        pass
    post_owner_id = int(
        _row_get(rows[0], "target_user_id")
        or _row_get(rows[0], "user_id")
        or 0
    )
    if liked and post_owner_id and post_owner_id != uid:
        _send_push_to_user(
            post_owner_id,
            "Someone liked your post",
            "Your post received a like.",
            {"type": "like", "post_id": str(post_id)},
            preference="likes",
        )
    bump_content_version()
    return {"ok": True, "likes": likes, "liked": liked}


@app.post("/api/wall/{post_id}/comment")
def comment_wall_post(
    post_id: int,
    payload: dict[str, Any],
    user: dict[str, Any] = Depends(require_user),
):
    """Add a short reply as a wall post on the same target wall."""
    _ensure_wall_posts_table()
    rows = fetch_all(
        "SELECT id, target_user_id, user_id, body FROM wall_posts WHERE id=%s LIMIT 1",
        (post_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Post not found")
    body = (payload.get("body") or payload.get("message") or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Empty comment")
    target = int(_row_get(rows[0], "target_user_id") or _row_get(rows[0], "user_id") or 0)
    parent_body = (_row_get(rows[0], "body") or "")[:80]
    reply = f"Re: {parent_body}\n{body}" if parent_body else body
    row_id, _ = execute_write(
        """
        INSERT INTO wall_posts (user_id, target_user_id, body, image_path, likes_count, created_at)
        VALUES (%s, %s, %s, %s, 0, CURRENT_TIMESTAMP)
        """,
        (user["user_id"], target, reply, ""),
    )
    bump_content_version()
    return {"ok": True, "id": row_id}


def _user_moderation_status(user_id: int) -> dict[str, Any]:
    """Fresh flags from DB after any admin action."""
    _ensure_user_moderation_columns()
    rows = fetch_all(
        """
        SELECT COALESCE(is_banned,0) AS is_banned,
               COALESCE(is_suspended,0) AS is_suspended,
               COALESCE(is_deleted,0) AS is_deleted,
               suspended_until,
               COALESCE(is_author_active,1) AS is_author_active
        FROM app_users WHERE id=%s LIMIT 1
        """,
        (user_id,),
    )
    if not rows:
        return {"ok": False, "error": "user not found", "id": user_id}
    r = rows[0]
    return {
        "ok": True,
        "id": user_id,
        "is_banned": _as_bool_flag(_row_get(r, "is_banned")),
        "is_suspended": _as_bool_flag(_row_get(r, "is_suspended")),
        "is_deleted": _as_bool_flag(_row_get(r, "is_deleted")),
        "suspended_until": str(_row_get(r, "suspended_until") or "") or None,
        "is_author_active": bool(int(_row_get(r, "is_author_active") if _row_get(r, "is_author_active") is not None else 1)),
    }


# ----- Admin: users list + ban / unban -----


@app.get("/api/admin/stats")
def admin_dashboard_stats(_: dict[str, Any] = Depends(require_admin)):
    """Lightweight dashboard counters for admin panel."""
    def _c(sql: str) -> int:
        try:
            rows = fetch_all(sql)
            return int(_row_get(rows[0], "c") or 0) if rows else 0
        except Exception:
            return 0

    books = _c("SELECT COUNT(*) AS c FROM books")
    published = _c(
        "SELECT COUNT(*) AS c FROM books WHERE LOWER(COALESCE(status_text,'')) LIKE '%%publish%%' "
        "OR LOWER(COALESCE(status_text,'')) LIKE '%%complete%%'"
    )
    drafts = _c(
        "SELECT COUNT(*) AS c FROM books WHERE LOWER(COALESCE(status_text,'')) LIKE '%%draft%%' "
        "OR LOWER(COALESCE(status_text,'')) LIKE '%%ongoing%%'"
    )
    users = _c("SELECT COUNT(*) AS c FROM app_users")
    authors = _c(
        "SELECT COUNT(DISTINCT user_id) AS c FROM books WHERE user_id IS NOT NULL AND user_id > 0"
    )
    reviews = _c("SELECT COUNT(*) AS c FROM book_reviews")
    reports = 0
    try:
        reports = _c("SELECT COUNT(*) AS c FROM story_reports")
    except Exception:
        reports = 0
    follows = 0
    try:
        follows = _c("SELECT COUNT(*) AS c FROM author_follows")
    except Exception:
        follows = 0
    return {
        "books": books,
        "published": published,
        "drafts": drafts,
        "users": users,
        "authors": authors,
        "reviews": reviews,
        "reports": reports,
        "follows": follows,
    }


@app.get("/api/admin/authors")
def admin_list_authors(_: dict[str, Any] = Depends(require_admin)):
    """Users who became authors by publishing / owning at least one book."""
    _ensure_user_moderation_columns()
    rows = []
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.email, u.display_name, u.photo_url, u.provider, u.bio,
                   COALESCE(u.is_banned, 0) AS is_banned,
                   COALESCE(u.is_suspended, 0) AS is_suspended,
                   COALESCE(u.is_deleted, 0) AS is_deleted,
                   u.suspended_until,
                   COALESCE(u.is_author, 0) AS is_author,
                   COALESCE(u.is_author_active, 1) AS is_author_active,
                   COALESCE(bc.story_count, 0) AS story_count,
                   COALESCE(fc.follower_count, 0) AS follower_count
            FROM app_users u
            INNER JOIN (
                SELECT user_id, COUNT(*) AS story_count
                FROM books
                WHERE user_id IS NOT NULL AND user_id > 0
                GROUP BY user_id
            ) bc ON bc.user_id = u.id
            LEFT JOIN (
                SELECT author_id, COUNT(*) AS follower_count
                FROM author_follows
                GROUP BY author_id
            ) fc ON fc.author_id = u.id
            ORDER BY bc.story_count DESC, u.id DESC
            LIMIT 500
            """
        ) or []
    except Exception as exc:
        LOGGER.warning("admin_list_authors join failed: %s", exc)
        try:
            rows = fetch_all(
                """
                SELECT u.id, u.email, u.display_name, u.photo_url, u.provider, u.bio,
                       0 AS is_banned, 0 AS is_suspended, 0 AS is_deleted,
                       NULL AS suspended_until,
                       1 AS is_author, 1 AS is_author_active,
                       (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) AS story_count,
                       0 AS follower_count
                FROM app_users u
                WHERE EXISTS (SELECT 1 FROM books b WHERE b.user_id = u.id)
                ORDER BY u.id DESC
                LIMIT 500
                """
            ) or []
        except Exception as e2:
            LOGGER.warning("admin_list_authors fallback failed: %s", e2)
            return {"items": []}

    items = []
    for row in rows:
        uid = _row_get(row, "id")
        story_count = int(_row_get(row, "story_count") or 0)
        items.append({
            "id": uid,
            "email": _row_get(row, "email") or "",
            "display_name": _row_get(row, "display_name") or "",
            "photo_url": _row_get(row, "photo_url") or "",
            "provider": _row_get(row, "provider") or "",
            "bio": _row_get(row, "bio") or "",
            "is_banned": _as_bool_flag(_row_get(row, "is_banned")),
            "is_suspended": _as_bool_flag(_row_get(row, "is_suspended")),
            "is_deleted": _as_bool_flag(_row_get(row, "is_deleted")),
            "suspended_until": str(_row_get(row, "suspended_until") or "") or None,
            "is_author": True,
            "is_author_active": _as_bool_flag(
                _row_get(row, "is_author_active")
                if _row_get(row, "is_author_active") is not None
                else 1
            ),
            "story_count": story_count,
            "follower_count": int(_row_get(row, "follower_count") or 0),
        })
    return {"items": items, "total": len(items)}


@app.get("/api/admin/reviews")
def admin_list_reviews(
    limit: int = 100,
    _: dict[str, Any] = Depends(require_admin),
):
    """Moderate user reviews across all books."""
    lim = max(1, min(int(limit or 100), 300))
    try:
        rows = fetch_all(
            f"""
            SELECT r.id, r.book_id, r.user_id, r.rating, r.comment, r.created_at,
                   b.title AS book_title,
                   u.display_name, u.email, u.photo_url
            FROM book_reviews r
            LEFT JOIN books b ON b.id = r.book_id
            LEFT JOIN app_users u ON u.id = r.user_id
            ORDER BY r.id DESC
            LIMIT {lim}
            """
        ) or []
    except Exception as exc:
        LOGGER.warning("admin_list_reviews failed: %s", exc)
        return {"items": []}
    items = []
    for row in rows:
        items.append({
            "id": _row_get(row, "id"),
            "book_id": _row_get(row, "book_id"),
            "book_title": _row_get(row, "book_title") or f"Book #{_row_get(row, 'book_id')}",
            "user_id": _row_get(row, "user_id"),
            "display_name": _row_get(row, "display_name") or "Reader",
            "email": _row_get(row, "email") or "",
            "photo_url": _row_get(row, "photo_url") or "",
            "rating": _row_get(row, "rating"),
            "comment": _row_get(row, "comment") or "",
            "created_at": str(_row_get(row, "created_at") or ""),
        })
    return {"items": items}


@app.delete("/api/admin/reviews/{review_id}")
def admin_delete_review(review_id: int, _: dict[str, Any] = Depends(require_admin)):
    try:
        execute_write("DELETE FROM book_reviews WHERE id=%s", (review_id,))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Delete failed: {exc}") from exc
    bump_content_version()
    return {"ok": True}


@app.get("/api/admin/users")
def admin_list_users(_: dict[str, Any] = Depends(require_admin)):
    """List users for admin panel. Single query — no N+1 (avoids Vercel timeout/CORS loss)."""
    _ensure_user_moderation_columns()
    try:
        rows = fetch_all(
            """
            SELECT u.id, u.email, u.display_name, u.photo_url, u.provider, u.bio,
                   COALESCE(u.is_banned, 0) AS is_banned,
                   COALESCE(u.is_suspended, 0) AS is_suspended,
                   COALESCE(u.is_deleted, 0) AS is_deleted,
                   u.suspended_until,
                   COALESCE(u.is_author, 0) AS is_author,
                   COALESCE(u.is_author_active, 1) AS is_author_active,
                   COALESCE(bc.story_count, 0) AS story_count,
                   COALESCE(fc.follower_count, 0) AS follower_count
            FROM app_users u
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS story_count FROM books
                WHERE user_id IS NOT NULL GROUP BY user_id
            ) bc ON bc.user_id = u.id
            LEFT JOIN (
                SELECT author_id, COUNT(*) AS follower_count FROM author_follows
                GROUP BY author_id
            ) fc ON fc.author_id = u.id
            ORDER BY u.id DESC
            LIMIT 500
            """
        )
    except Exception as list_exc:
        LOGGER.warning("admin_list_users rich select failed: %s", list_exc)
        try:
            rows = fetch_all(
                """
                SELECT id, email, display_name, photo_url, provider, bio
                FROM app_users
                ORDER BY id DESC
                LIMIT 500
                """
            )
        except Exception as e2:
            LOGGER.warning("admin_list_users basic select failed: %s", e2)
            return {"items": []}

    items = []
    for row in rows or []:
        uid = _row_get(row, "id")
        story_count = int(_row_get(row, "story_count") or 0)
        follower_count = int(_row_get(row, "follower_count") or 0)
        is_author = _as_bool_flag(_row_get(row, "is_author")) or story_count > 0
        items.append({
            "id": uid,
            "email": _row_get(row, "email") or "",
            "display_name": _row_get(row, "display_name") or "",
            "photo_url": _row_get(row, "photo_url") or "",
            "provider": _row_get(row, "provider") or "",
            "bio": _row_get(row, "bio") or "",
            "is_banned": _as_bool_flag(_row_get(row, "is_banned")),
            "is_suspended": _as_bool_flag(_row_get(row, "is_suspended")),
            "is_deleted": _as_bool_flag(_row_get(row, "is_deleted")),
            "suspended_until": str(_row_get(row, "suspended_until") or "") or None,
            "is_author": is_author,
            "is_author_active": _as_bool_flag(
                _row_get(row, "is_author_active")
                if _row_get(row, "is_author_active") is not None
                else 1
            ),
            "story_count": story_count,
            "follower_count": follower_count,
        })
    return {"items": items}


@app.post("/api/admin/users/{user_id}/ban")
def admin_ban_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    _ensure_user_moderation_columns()
    execute_write("UPDATE app_users SET is_banned=1 WHERE id=%s", (user_id,))
    bump_token_version(user_id)
    return _user_moderation_status(user_id)


@app.post("/api/admin/users/{user_id}/unban")
def admin_unban_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    _ensure_user_moderation_columns()
    execute_write("UPDATE app_users SET is_banned=0 WHERE id=%s", (user_id,))
    return _user_moderation_status(user_id)



@app.post("/api/admin/users/{user_id}/suspend")
def admin_suspend_user(
    user_id: int,
    payload: dict[str, Any] | None = None,
    _: dict[str, Any] = Depends(require_admin),
):
    """Suspend for N days (body: {"days": 7}). User cannot log in until suspended_until passes."""
    _ensure_user_moderation_columns()
    body = payload or {}
    days = int(body.get("days") or body.get("suspend_days") or 7)
    if days < 1:
        days = 1
    if days > 3650:
        days = 3650
    until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    execute_write(
        "UPDATE app_users SET is_suspended=1, suspended_until=%s WHERE id=%s",
        (until, user_id),
    )
    return {"ok": True, "is_suspended": True, "suspended_until": until, "days": days}


@app.post("/api/admin/users/{user_id}/unsuspend")
def admin_unsuspend_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    _ensure_user_moderation_columns()
    execute_write(
        "UPDATE app_users SET is_suspended=0, suspended_until=NULL WHERE id=%s",
        (user_id,),
    )
    return {"ok": True, "is_suspended": False}


@app.post("/api/admin/users/{user_id}/activate")
def admin_activate_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    """Clear ban + suspend flags — full access restored."""
    try:
        execute_write(
            "UPDATE app_users SET is_banned=0, is_suspended=0, is_deleted=0, suspended_until=NULL WHERE id=%s",
            (user_id,),
        )
    except Exception:
        try:
            execute_write("UPDATE app_users SET is_banned=0 WHERE id=%s", (user_id,))
        except Exception:
            pass
    return {"ok": True, "is_banned": False, "is_suspended": False}

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    """Soft-delete: keep row, flag is_deleted so login is permanently blocked until restored."""
    _ensure_user_moderation_columns()
    execute_write(
        "UPDATE app_users SET is_deleted=1 WHERE id=%s",
        (user_id,),
    )
    bump_token_version(user_id)
    return {"ok": True, "is_deleted": True}


@app.post("/api/admin/users/{user_id}/restore")
def admin_restore_user(user_id: int, _: dict[str, Any] = Depends(require_admin)):
    _ensure_user_moderation_columns()
    execute_write(
        "UPDATE app_users SET is_deleted=0, is_banned=0, is_suspended=0, suspended_until=NULL WHERE id=%s",
        (user_id,),
    )
    bump_token_version(user_id)
    return _user_moderation_status(user_id)


@app.post("/api/admin/users/{user_id}/author-active")
def admin_set_author_active(
    user_id: int,
    payload: dict[str, Any] | None = None,
    _: dict[str, Any] = Depends(require_admin),
):
    _ensure_user_moderation_columns()
    body = payload or {}
    active = 1 if body.get("active", True) in (True, 1, "1", "true", "True") else 0
    execute_write("UPDATE app_users SET is_author_active=%s WHERE id=%s", (active, user_id))
    return {"ok": True, "is_author_active": bool(active)}


# list_user_activity provided by activity_feed (others-only)

try:
    from .inkitt_routes import register_inkitt_routes

    def _fetch_one(query: str, params: tuple[Any, ...] | None = None):
        rows = fetch_all(query, params)
        return rows[0] if rows else None

    register_inkitt_routes(
        app,
        fetch_all=fetch_all,
        fetch_one=_fetch_one,
        execute_write=execute_write,
        require_user=require_user,
        require_admin=require_admin,
        bump_content_version=bump_content_version,
    )
except Exception as _inkitt_exc:
    LOGGER.warning("inkitt_routes not registered: %s", _inkitt_exc)


@app.get("/api/genres/{genre_name:path}/books")
def list_books_by_genre(genre_name: str, sort: str | None = None):
    """Return public stories for the Flutter genre detail screen."""
    from urllib.parse import unquote

    clean = unquote(genre_name or "").strip()
    if not clean:
        raise HTTPException(status_code=400, detail="Genre required")
    like = f"%{clean}%"
    order = "COALESCE(b.rating, 0) DESC, b.id DESC"
    if (sort or "top").strip().lower() in ("recent", "new"):
        order = "b.id DESC"
    elif (sort or "").strip().lower() in ("trending", "views"):
        order = "COALESCE(b.view_count, 0) DESC, b.id DESC"
    try:
        rows = fetch_all(
            f"""
            SELECT b.* FROM books b
            WHERE LOWER(TRIM(COALESCE(b.status_text, ''))) IN
                  ('ongoing', 'completed', 'complete', 'finished', 'published',
                   'publish', 'live', 'public', 'submitted')
              AND (
                LOWER(TRIM(COALESCE(NULLIF(b.primary_genre, ''),
                                    NULLIF(b.genre, ''), ''))) = LOWER(%s)
                OR LOWER(TRIM(COALESCE(b.secondary_genre, ''))) = LOWER(%s)
              )
            ORDER BY {order}
            LIMIT 100
            """,
            (clean, clean),
        ) or []
    except Exception as exc:
        LOGGER.exception("books by genre failed for %s: %s", clean, exc)
        raise HTTPException(status_code=500, detail="Could not load genre stories") from exc
    items = [_serialize_book(row) for row in rows]
    return {"genre": clean, "items": items, "count": len(items)}

try:
    from .admin_tags import register_admin_tag_routes
    register_admin_tag_routes(
        app,
        require_admin=require_admin,
        fetch_all=fetch_all,
        execute_write=execute_write,
        bump_content_version=bump_content_version,
        LOGGER=LOGGER,
    )
except Exception as _admin_tags_exc:
    LOGGER.warning("admin_tags routes not registered: %s", _admin_tags_exc)

try:
    from .story_reports import register_story_report_routes
    register_story_report_routes(
        app,
        require_user=require_user,
        require_admin=require_admin,
        fetch_all=fetch_all,
        execute_write=execute_write,
        bump_content_version=bump_content_version,
        LOGGER=LOGGER,
        USE_SQLITE=USE_SQLITE,
    )
except Exception as _story_reports_exc:
    LOGGER.warning("story_reports routes not registered: %s", _story_reports_exc)

try:
    from .activity_feed import register_activity_routes
    register_activity_routes(
        app,
        fetch_all=fetch_all,
        LOGGER=LOGGER,
        helpers={
            "row_get": _row_get,
            "normalize_cover_path": _normalize_cover_path,
            "ensure_book_likes_table": _ensure_book_likes_table,
            "ensure_chapter_comments_table": _ensure_chapter_comments_table,
            "ensure_author_follows_table": _ensure_author_follows_table,
            "ensure_wall_posts_table": _ensure_wall_posts_table,
        },
    )
except Exception as _activity_exc:
    LOGGER.warning("activity_feed routes not registered: %s", _activity_exc)

try:
    from .chapter_reactions import register_chapter_reaction_routes
    register_chapter_reaction_routes(
        app,
        require_user=require_user,
        fetch_all=fetch_all,
        execute_write=execute_write,
        bump_content_version=bump_content_version,
        LOGGER=LOGGER,
        USE_SQLITE=USE_SQLITE,
    )
except Exception as _chapter_reactions_exc:
    LOGGER.warning("chapter_reactions routes not registered: %s", _chapter_reactions_exc)



# ---------------------------------------------------------------------------
# Professional auth hardening (token_version, secure email, device guest)
# Safe if module missing — base require_user/create_user_token already hardened.
# ---------------------------------------------------------------------------
try:
    import sys as _sys
    from .auth_professional import apply_professional_auth as _apply_pro_auth
    _apply_pro_auth(_sys.modules[__name__])
    LOGGER.info("auth_professional hardening applied")
except Exception as _auth_pro_exc:
    try:
        import sys as _sys
        import auth_professional as _ap
        _ap.apply_professional_auth(_sys.modules[__name__])
        LOGGER.info("auth_professional hardening applied (flat import)")
    except Exception as _auth_pro_exc2:
        LOGGER.warning("auth_professional not applied: %s / %s", _auth_pro_exc, _auth_pro_exc2)
