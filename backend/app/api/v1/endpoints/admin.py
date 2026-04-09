import asyncio
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.cache import cache
from app.core.config import get_settings
from app.core.security import hash_password
from app.db.deps import get_current_user, get_database

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


class StoryStatusPayload(BaseModel):
    status: str


class StoryCoverPayload(BaseModel):
    cover_image: str


class BulkCommentActionPayload(BaseModel):
    comment_ids: list[str] = Field(min_length=1)
    action: str


class SiteSettingsPayload(BaseModel):
    site_name: str = Field(min_length=2, max_length=64)
    logo_url: str | None = None


class AdminPushNotificationPayload(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=2, max_length=500)


class AdminHashtagPayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class AdminLanguagePayload(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    country: str = Field(default="Unknown", max_length=60)
    status: str = Field(default="active", max_length=20)
    is_default: bool = False


class AdminLanguageUpdatePayload(BaseModel):
    country: str | None = Field(default=None, max_length=60)
    status: str | None = Field(default=None, max_length=20)
    is_default: bool | None = None


class AdminAvatarPayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    gender: str = Field(default="unknown", max_length=20)
    image_url: str = Field(min_length=5, max_length=500)


class AdminGenrePayload(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon_url: str = Field(default="", max_length=500)
    status: str = Field(default="active", max_length=20)


class AdminGenreUpdatePayload(BaseModel):
    icon_url: str | None = Field(default=None, max_length=500)
    status: str | None = Field(default=None, max_length=20)


class AdminUserPayload(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=120)
    full_name: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=30)
    country: str = Field(default="", max_length=80)
    preferred_language: str = Field(default="", max_length=40)
    gender: str = Field(default="", max_length=30)
    profile_image: str = Field(default="", max_length=500)
    role: str = Field(default="user", max_length=40)
    is_admin: bool = False
    is_banned: bool = False


class AdminUserUpdatePayload(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=40)
    email: str | None = Field(default=None, min_length=5, max_length=160)
    password: str | None = Field(default=None, min_length=6, max_length=120)
    full_name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=30)
    country: str | None = Field(default=None, max_length=80)
    preferred_language: str | None = Field(default=None, max_length=40)
    gender: str | None = Field(default=None, max_length=30)
    profile_image: str | None = Field(default=None, max_length=500)
    role: str | None = Field(default=None, max_length=40)
    is_admin: bool | None = None
    is_banned: bool | None = None


class AdminSettingsDocumentPayload(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)


class AdminCmsPagePayload(BaseModel):
    slug: str = Field(min_length=2, max_length=120)
    title: str = Field(min_length=2, max_length=120)
    excerpt: str = Field(default="", max_length=240)
    content: str = Field(min_length=2)
    is_published: bool = True


def ensure_admin(user: dict) -> None:
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")


def _default_site_settings() -> dict:
    return {
        "site_name": "Bixbi",
        "logo_url": "",
        "contact_email": "support@bixbi.app",
        "dark_logo_url": "",
        "light_logo_url": "",
        "splash_image_url": "",
        "copyright_text": f"Copyright {datetime.now(timezone.utc).year} Bixbi. All rights reserved.",
        "primary_color": "#1278ff",
        "secondary_color": "#35a0ff",
        "sms_config": {
            "provider": "Twilio",
            "provider_secondary": "MSG 91",
            "account_sid": "",
            "auth_token": "",
            "phone_number": "",
        },
        "mail_setup": {
            "mailer": "smtp",
            "host": "",
            "port": "587",
            "encryption": "tls",
            "username": "",
            "password": "",
            "from_address": "",
        },
        "aws_media": {
            "access_key": "",
            "secret_access_key": "",
            "bucket_name": "",
            "bucket_url": "",
        },
        "firebase": {
            "credentials_file_url": "",
            "info_text": "Open Firebase Console, generate a service account key, and upload the JSON file here.",
        },
        "payment": {
            "active_provider": "razorpay",
            "razorpay_enabled": False,
            "stripe_public_key": "",
            "stripe_secret_key": "",
            "paypal_enabled": False,
        },
        "login_config": {
            "email_enabled": True,
            "mobile_otp_enabled": True,
            "facebook_enabled": False,
            "google_enabled": True,
            "apple_enabled": False,
        },
        "purchase_code": {
            "code": "",
            "status": "active",
        },
    }


def _merge_site_settings(settings_doc: dict | None) -> dict:
    merged = _default_site_settings()
    if not settings_doc:
        return merged

    for key, value in settings_doc.items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def _slugify(value: str) -> str:
    lowered = value.strip().lower().replace("_", "-")
    slug = "-".join(part for part in lowered.split() if part)
    return slug or "page"


def _safe_int(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)

    text = str(value).strip().replace(",", "")
    if not text:
        return default

    try:
        return int(float(text))
    except (TypeError, ValueError):
        return default


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _as_utc_datetime(value: Any) -> datetime | None:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _percent_change(current: float, previous: float) -> float:
    if previous <= 0:
        return 100.0 if current > 0 else 0.0
    return ((current - previous) / previous) * 100


def _normalize_role(value: str | None, *, is_admin: bool = False) -> str:
    role = str(value or "").strip().lower()
    if role in {"super_admin", "super-admin"}:
        return "super_admin"
    if role in {"admin", "moderator", "editor", "user"}:
        return role
    return "admin" if is_admin else "user"


async def _save_upload_image(image: UploadFile) -> str:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    data = await image.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be <= 8MB")

    ext = Path(image.filename or "image.png").suffix or ".png"
    file_name = f"admin-upload-{uuid4()}{ext}"
    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file_name
    file_path.write_bytes(data)
    return f"{settings.public_backend_base_url.rstrip('/')}/uploads/{file_name}"


async def _fetch_story_metrics(database: AsyncIOMotorDatabase) -> tuple[dict[str, int], dict[str, int]]:
    comment_rows = await database.comments.aggregate([
        {"$group": {"_id": "$story_id", "count": {"$sum": 1}}}
    ]).to_list(length=5000)
    like_rows = await database.likes.aggregate([
        {"$group": {"_id": "$story_id", "count": {"$sum": 1}}}
    ]).to_list(length=5000)
    return (
        {row.get("_id"): _safe_int(row.get("count", 0), 0) for row in comment_rows},
        {row.get("_id"): _safe_int(row.get("count", 0), 0) for row in like_rows},
    )


async def _fetch_users_by_ids(database: AsyncIOMotorDatabase, user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}
    rows = await database.users.find(
        {"_id": {"$in": list({item for item in user_ids if item})}},
        {"username": 1, "email": 1, "full_name": 1, "profile_image": 1, "country": 1, "country_code": 1, "preferred_language": 1, "is_banned": 1},
    ).to_list(length=2000)
    return {row["_id"]: row for row in rows}


async def _build_admin_story_rows(database: AsyncIOMotorDatabase, *, sort_field: str, limit: int = 100) -> list[dict]:
    stories = await database.stories.find({}).sort(sort_field, -1).limit(limit).to_list(length=limit)
    comment_counts, like_counts = await _fetch_story_metrics(database)
    users = await _fetch_users_by_ids(database, [story.get("author_id", "") for story in stories])

    rows: list[dict] = []
    for index, story in enumerate(stories, start=1):
        author = users.get(story.get("author_id", ""), {})
        rows.append(
            {
                "sl": index,
                "id": story.get("_id"),
                "image": story.get("cover_image", ""),
                "title": story.get("title", "Untitled"),
                "username": author.get("username", "unknown"),
                "email": author.get("email", ""),
                "author_name": author.get("full_name") or author.get("username", "Unknown"),
                "posted_at": story.get("created_at") or story.get("updated_at"),
                "likes": _safe_int(like_counts.get(story.get("_id"), story.get("likes", 0)), 0),
                "comments": _safe_int(comment_counts.get(story.get("_id"), 0), 0),
                "views": _safe_int(story.get("views", 0), 0),
                "status": story.get("status", "published"),
                "category": (story.get("categories") or ["Fiction"])[0],
                "language": author.get("preferred_language", "English"),
            }
        )
    return rows


async def _build_report_rows(database: AsyncIOMotorDatabase, report_kind: str) -> list[dict]:
    if report_kind == "story":
        query = {"$or": [{"report_kind": "story"}, {"report_kind": "post"}, {"report_kind": {"$exists": False}}]}
    else:
        query = {"report_kind": report_kind}

    reports = await database.reports.find(query).sort("updated_at", -1).limit(200).to_list(length=200)

    user_ids: list[str] = []
    story_ids: list[str] = []
    chapter_ids: list[str] = []
    comment_ids: list[str] = []
    for report in reports:
        user_ids.extend([_to_text(report.get("user_id")), _to_text(report.get("target_user_id"))])
        if report.get("story_id"):
            story_ids.append(_to_text(report.get("story_id")))
        if report.get("chapter_id"):
            chapter_ids.append(_to_text(report.get("chapter_id")))
        if report.get("comment_id"):
            comment_ids.append(_to_text(report.get("comment_id")))

    users = await _fetch_users_by_ids(database, user_ids)
    stories = await database.stories.find({"_id": {"$in": list({item for item in story_ids if item})}}, {"title": 1, "cover_image": 1}).to_list(length=500)
    chapters = await database.chapters.find({"_id": {"$in": list({item for item in chapter_ids if item})}}, {"title": 1, "story_id": 1}).to_list(length=500)
    comments = await database.comments.find({"_id": {"$in": list({item for item in comment_ids if item})}}, {"content": 1, "story_id": 1}).to_list(length=500)
    story_lookup = {row["_id"]: row for row in stories}
    chapter_lookup = {row["_id"]: row for row in chapters}
    comment_lookup = {row["_id"]: row for row in comments}

    items: list[dict] = []
    for index, report in enumerate(reports, start=1):
        reporter = users.get(_to_text(report.get("user_id")), {})
        target_user = users.get(_to_text(report.get("target_user_id")), {})
        target_story = story_lookup.get(_to_text(report.get("story_id")), {})
        target_chapter = chapter_lookup.get(_to_text(report.get("chapter_id")), {})
        target_comment = comment_lookup.get(_to_text(report.get("comment_id")), {})
        entity_type = _to_text(report.get("reported_entity_type") or report.get("report_kind") or "story")
        items.append(
            {
                "sl": index,
                "id": _to_text(report.get("_id")),
                "created_at": report.get("created_at") or report.get("updated_at"),
                "reason": report.get("reason", ""),
                "status": report.get("status", "open"),
                "report_kind": _to_text(report.get("report_kind") or "story"),
                "reported_entity_type": entity_type,
                "reported_by": {
                    "id": _to_text(report.get("user_id")),
                    "name": reporter.get("full_name") or reporter.get("username", "Unknown User"),
                    "email": reporter.get("email", ""),
                    "image": reporter.get("profile_image", ""),
                },
                "reported_user": {
                    "id": _to_text(report.get("target_user_id")),
                    "name": target_user.get("full_name") or target_user.get("username", "Unknown User"),
                    "email": target_user.get("email", ""),
                    "image": target_user.get("profile_image", ""),
                    "status": "active" if target_user and not target_user.get("is_banned", False) else "inactive",
                },
                "story": {
                    "id": _to_text(report.get("story_id")),
                    "title": target_story.get("title", "Unknown Story"),
                    "image": target_story.get("cover_image", ""),
                },
                "chapter": {
                    "id": _to_text(report.get("chapter_id")),
                    "title": target_chapter.get("title", ""),
                    "story_id": _to_text(target_chapter.get("story_id") or report.get("story_id")),
                },
                "comment": {
                    "id": _to_text(report.get("comment_id")),
                    "content": _to_text(target_comment.get("content"))[:220],
                    "story_id": _to_text(target_comment.get("story_id") or report.get("story_id")),
                },
            }
        )
    return items


async def _build_country_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await database.users.aggregate([
        {"$match": {"country": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": "$country", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
    ]).to_list(length=200)
    return [{"country": row.get("_id", "Unknown"), "count": _safe_int(row.get("count", 0), 0)} for row in rows]


async def _build_hashtag_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    story_rows = await database.stories.aggregate([
        {"$match": {"tags": {"$exists": True, "$ne": []}}},
        {"$unwind": "$tags"},
        {"$group": {"_id": {"$toLower": "$tags"}, "story_count": {"$sum": 1}}},
    ]).to_list(length=500)
    catalog_rows = await database.hashtag_catalog.find({}).sort("name", 1).to_list(length=500)
    counts = {row.get("_id", ""): _safe_int(row.get("story_count", 0), 0) for row in story_rows}
    tags = {row.get("name", "").lower(): row for row in catalog_rows}
    all_names = sorted({*counts.keys(), *tags.keys()})
    return [
        {
            "name": name,
            "story_count": counts.get(name, 0),
            "status": tags.get(name, {}).get("status", "active"),
            "created_at": tags.get(name, {}).get("created_at"),
        }
        for name in all_names
        if name
    ]


async def _build_language_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    aggregate_rows = await database.users.aggregate([
        {"$match": {"preferred_language": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": "$preferred_language", "users_count": {"$sum": 1}}},
    ]).to_list(length=300)
    catalog_rows = await database.language_catalog.find({}).sort("name", 1).to_list(length=300)
    counts = {row.get("_id", ""): _safe_int(row.get("users_count", 0), 0) for row in aggregate_rows}
    catalogs = {row.get("name", ""): row for row in catalog_rows}
    all_names = sorted({*counts.keys(), *catalogs.keys()})
    return [
        {
            "name": name,
            "users_count": counts.get(name, 0),
            "country": catalogs.get(name, {}).get("country", "Unknown"),
            "status": catalogs.get(name, {}).get("status", "active"),
            "is_default": bool(catalogs.get(name, {}).get("is_default", False)),
        }
        for name in all_names
        if name
    ]


async def _build_block_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await database.user_blocks.find({}).sort("created_at", -1).limit(200).to_list(length=200)
    users = await _fetch_users_by_ids(database, [row.get("blocked_user_id", "") for row in rows] + [row.get("blocked_by_user_id", "") for row in rows])
    items: list[dict] = []
    for index, row in enumerate(rows, start=1):
        blocked_user = users.get(row.get("blocked_user_id", ""), {})
        blocked_by = users.get(row.get("blocked_by_user_id", ""), {})
        items.append(
            {
                "sl": index,
                "id": row.get("_id"),
                "created_at": row.get("created_at"),
                "blocked_to": {
                    "name": blocked_user.get("full_name") or blocked_user.get("username", "Unknown User"),
                    "email": blocked_user.get("email", ""),
                    "image": blocked_user.get("profile_image", ""),
                },
                "blocked_by": {
                    "name": blocked_by.get("full_name") or blocked_by.get("username", "Unknown User"),
                    "email": blocked_by.get("email", ""),
                    "image": blocked_by.get("profile_image", ""),
                },
            }
        )
    return items


async def _build_avatar_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await database.avatar_library.find({}).sort("created_at", -1).to_list(length=300)
    return [
        {
            "id": row.get("_id"),
            "name": row.get("name", "Avatar"),
            "gender": row.get("gender", "unknown"),
            "image_url": row.get("image_url", ""),
        }
        for row in rows
    ]


async def _build_push_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await database.push_notifications.find({}).sort("created_at", -1).limit(200).to_list(length=200)
    return [
        {
            "id": row.get("_id"),
            "title": row.get("title", "Untitled"),
            "description": row.get("description", ""),
            "status": row.get("status", "sent"),
            "recipient_count": _safe_int(row.get("recipient_count", 0), 0),
            "created_at": row.get("created_at"),
        }
        for row in rows
    ]


async def _build_admin_users_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await list_users(current_user={"is_admin": True}, database=database)
    admin_roles = {"super_admin", "admin", "moderator", "editor"}
    return [
        {
            **row,
            "role": _normalize_role(row.get("role"), is_admin=bool(row.get("is_admin", False))),
        }
        for row in rows
        if bool(row.get("is_admin", False)) or _normalize_role(row.get("role"), is_admin=False) in admin_roles
    ]


async def _build_genre_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    story_rows = await database.stories.aggregate([
        {"$match": {"categories": {"$exists": True, "$ne": []}}},
        {"$unwind": "$categories"},
        {"$group": {"_id": {"$toLower": "$categories"}, "story_count": {"$sum": 1}}},
    ]).to_list(length=400)
    catalog_rows = await database.genre_catalog.find({}).sort("name", 1).to_list(length=400)
    counts = {row.get("_id", ""): _safe_int(row.get("story_count", 0), 0) for row in story_rows}
    catalogs = {str(row.get("name", "")).strip().lower(): row for row in catalog_rows}
    all_names = sorted({*counts.keys(), *catalogs.keys()})
    return [
        {
            "name": catalogs.get(name, {}).get("name") or name.title(),
            "icon_url": catalogs.get(name, {}).get("icon_url", ""),
            "status": catalogs.get(name, {}).get("status", "active"),
            "story_count": counts.get(name, 0),
            "created_at": catalogs.get(name, {}).get("created_at"),
        }
        for name in all_names
        if name
    ]


async def _build_cms_rows(database: AsyncIOMotorDatabase) -> list[dict]:
    rows = await database.cms_pages.find({}).sort("updated_at", -1).to_list(length=100)
    return [
        {
            "id": str(row.get("_id") or row.get("slug") or ""),
            "slug": str(row.get("slug", "")),
            "title": row.get("title", "Untitled"),
            "excerpt": row.get("excerpt", ""),
            "content": row.get("content", ""),
            "is_published": bool(row.get("is_published", True)),
            "updated_at": row.get("updated_at"),
        }
        for row in rows
    ]


@router.get("/analytics")
async def analytics(
    period_days: int = Query(default=30, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    now = datetime.now(timezone.utc)
    history_days = max(60, period_days * 2)
    start_history = now - timedelta(days=history_days - 1)
    start_current = now - timedelta(days=period_days - 1)
    start_prev = now - timedelta(days=(period_days * 2) - 1)
    end_prev = now - timedelta(days=period_days)

    users = await database.users.count_documents({})
    stories_count = await database.stories.count_documents({})
    comments = await database.comments.count_documents({})
    likes = await database.likes.count_documents({})
    reports_open = await database.reports.count_documents({"status": "open"})
    banned_users = await database.users.count_documents({"is_banned": True})
    hidden_comments = await database.comments.count_documents({"status": "hidden"})
    badges_earned = await database.badges.count_documents({})

    user_rows_60d = await database.users.find(
        {"created_at": {"$gte": start_history}},
        {"created_at": 1},
    ).to_list(length=200000)
    activity_rows_60d = await database.user_activity.find(
        {"created_at": {"$gte": start_history}},
        {"created_at": 1, "action_type": 1, "read_time": 1},
    ).to_list(length=500000)
    like_rows_60d = await database.likes.find(
        {"created_at": {"$gte": start_history}},
        {"created_at": 1},
    ).to_list(length=500000)
    comment_rows_28d = await database.comments.find(
        {"created_at": {"$gte": now - timedelta(days=max(27, period_days - 1))}},
        {"created_at": 1},
    ).to_list(length=300000)

    day_labels_30 = []
    day_to_index_30: dict[date, int] = {}
    for offset in range(period_days - 1, -1, -1):
        day = (now - timedelta(days=offset)).date()
        day_labels_30.append(day.strftime("%d %b") if period_days > 31 else str(day.day))
        day_to_index_30[day] = len(day_labels_30) - 1

    day_labels_7 = []
    day_to_index_7: dict[date, int] = {}
    for offset in range(6, -1, -1):
        day = (now - timedelta(days=offset)).date()
        day_labels_7.append(day.strftime("%a"))
        day_to_index_7[day] = len(day_labels_7) - 1

    daily_user_reg_30 = [0] * period_days
    daily_user_reg_7 = [0] * 7

    for row in user_rows_60d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        key = created_at.date()
        if key in day_to_index_30:
            daily_user_reg_30[day_to_index_30[key]] += 1
        if key in day_to_index_7:
            daily_user_reg_7[day_to_index_7[key]] += 1

    cumulative_user_growth_30: list[int] = []
    running_total = 0
    for value in daily_user_reg_30:
        running_total += value
        cumulative_user_growth_30.append(running_total)

    story_views_30 = [0] * period_days
    daily_reads_7 = [0] * 7
    read_time_30_total = 0
    read_time_30_count = 0
    read_time_prev_total = 0
    read_time_prev_count = 0
    read_actions = {"open_story", "chapter_view", "read", "view", "open", "continue_reading"}

    monthly_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    month_reads = [0] * 12

    for row in activity_rows_60d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue

        action_type = str(row.get("action_type") or "").strip().lower()
        row_date = created_at.date()

        if row_date in day_to_index_30 and (action_type in read_actions or not action_type):
            story_views_30[day_to_index_30[row_date]] += 1
        if row_date in day_to_index_7 and (action_type in read_actions or not action_type):
            daily_reads_7[day_to_index_7[row_date]] += 1

        if created_at >= start_current:
            read_time = _safe_int(row.get("read_time", 0), 0)
            if read_time > 0:
                read_time_30_total += read_time
                read_time_30_count += 1
        elif start_prev <= created_at <= end_prev:
            read_time = _safe_int(row.get("read_time", 0), 0)
            if read_time > 0:
                read_time_prev_total += read_time
                read_time_prev_count += 1

        month_reads[max(0, min(11, created_at.month - 1))] += 1

    month_likes = [0] * 12
    likes_30d = 0
    likes_prev_30d = 0
    for row in like_rows_60d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        month_likes[max(0, min(11, created_at.month - 1))] += 1
        if created_at >= start_current:
            likes_30d += 1
        elif start_prev <= created_at <= end_prev:
            likes_prev_30d += 1

    week_labels = ["W1", "W2", "W3", "W4"]
    weekly_likes = [0, 0, 0, 0]
    weekly_comments = [0, 0, 0, 0]

    for row in like_rows_60d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        days_ago = (now.date() - created_at.date()).days
        if 0 <= days_ago < max(28, period_days):
            idx = min(3, days_ago // 7)
            weekly_likes[3 - idx] += 1

    for row in comment_rows_28d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        days_ago = (now.date() - created_at.date()).days
        if 0 <= days_ago < max(28, period_days):
            idx = min(3, days_ago // 7)
            weekly_comments[3 - idx] += 1

    genre_rows = await database.stories.aggregate([
        {"$match": {"categories": {"$exists": True, "$ne": []}}},
        {"$unwind": "$categories"},
        {"$group": {"_id": "$categories", "value": {"$sum": 1}}},
        {"$sort": {"value": -1}},
        {"$limit": 6},
    ]).to_list(length=6)

    current_user_growth_30 = sum(daily_user_reg_30)
    previous_user_growth_30 = await database.users.count_documents({
        "created_at": {"$gte": start_prev, "$lte": end_prev},
    })

    current_story_views_30 = sum(story_views_30)
    previous_story_views_30 = 0
    for row in activity_rows_60d:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        action_type = str(row.get("action_type") or "").strip().lower()
        if action_type not in read_actions and action_type:
            continue
        if start_prev <= created_at <= end_prev:
            previous_story_views_30 += 1

    avg_read_time_30 = (read_time_30_total / read_time_30_count) if read_time_30_count else 0
    avg_read_time_prev = (read_time_prev_total / read_time_prev_count) if read_time_prev_count else 0

    return {
        "period_days": period_days,
        "total_users": users,
        "total_stories": stories_count,
        "total_comments": comments,
        "total_likes": likes,
        "open_reports": reports_open,
        "banned_users": banned_users,
        "hidden_comments": hidden_comments,
        "badges_earned": badges_earned,
        "kpis": {
            "user_growth": current_user_growth_30,
            "user_growth_change": round(_percent_change(current_user_growth_30, previous_user_growth_30), 1),
            "story_views": current_story_views_30,
            "story_views_change": round(_percent_change(current_story_views_30, previous_story_views_30), 1),
            "avg_read_time_minutes": round(avg_read_time_30 / 60, 1),
            "avg_read_time_change": round(_percent_change(avg_read_time_30, avg_read_time_prev), 1),
            "total_likes": likes,
            "total_likes_change": round(_percent_change(likes_30d, likes_prev_30d), 1),
        },
        "charts": {
            "daily_views": {"labels": day_labels_30, "values": story_views_30},
            "monthly_reads": {"labels": monthly_labels, "values": month_reads},
            "monthly_likes": {"labels": monthly_labels, "values": month_likes},
            "weekly_engagement": {
                "labels": week_labels,
                "likes": weekly_likes,
                "comments": weekly_comments,
            },
            "dashboard_user_growth_7": {"labels": day_labels_7, "values": daily_user_reg_7},
            "dashboard_daily_reads_7": {"labels": day_labels_7, "values": daily_reads_7},
            "user_growth_period": {"labels": day_labels_30, "values": cumulative_user_growth_30},
            "story_views_period": {"labels": day_labels_30, "values": story_views_30},
            "genre_distribution": {
                "labels": [str(row.get("_id") or "Unknown") for row in genre_rows],
                "values": [_safe_int(row.get("value", 0), 0) for row in genre_rows],
            },
        },
    }


@router.get("/monetization")
async def monetization(
    period_days: int = Query(default=30, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    now = datetime.now(timezone.utc)
    start_year = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    start_prev = now - timedelta(days=(period_days * 2) - 1)
    end_prev = now - timedelta(days=period_days)

    monthly_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly_subscriptions = [0] * 12
    monthly_coin_sales = [0] * 12

    bookmark_rows = await database.bookmarks.find(
        {"created_at": {"$gte": start_year}},
        {"created_at": 1, "user_id": 1},
    ).to_list(length=500000)
    like_rows = await database.likes.find(
        {"created_at": {"$gte": start_year}},
        {"created_at": 1},
    ).to_list(length=500000)

    bookmark_rows_period = [
        row for row in bookmark_rows if (_as_utc_datetime(row.get("created_at")) or start_year) >= start_prev
    ]
    like_rows_period = [
        row for row in like_rows if (_as_utc_datetime(row.get("created_at")) or start_year) >= start_prev
    ]

    for row in bookmark_rows:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        monthly_subscriptions[max(0, min(11, created_at.month - 1))] += 1

    for row in like_rows:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is None:
            continue
        monthly_coin_sales[max(0, min(11, created_at.month - 1))] += 1

    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    prev_month_end = month_start - timedelta(seconds=1)
    prev_month_start = datetime(prev_month_end.year, prev_month_end.month, 1, tzinfo=timezone.utc)

    subs_this_month = sum(1 for row in bookmark_rows if (_as_utc_datetime(row.get("created_at")) or start_year) >= month_start)
    subs_prev_month = sum(
        1
        for row in bookmark_rows
        if prev_month_start <= (_as_utc_datetime(row.get("created_at")) or start_year) <= prev_month_end
    )

    users_this_month = {str(row.get("user_id") or "") for row in bookmark_rows if (_as_utc_datetime(row.get("created_at")) or start_year) >= month_start}
    users_prev_month = {
        str(row.get("user_id") or "")
        for row in bookmark_rows
        if prev_month_start <= (_as_utc_datetime(row.get("created_at")) or start_year) <= prev_month_end
    }
    users_this_month.discard("")
    users_prev_month.discard("")

    premium_subs = len(users_this_month)
    renewals_pct = round((len(users_this_month.intersection(users_prev_month)) / max(1, len(users_prev_month))) * 100, 1)

    coin_sales = sum(monthly_coin_sales)
    total_revenue = round((sum(monthly_subscriptions) * 2.99) + (coin_sales * 0.35), 2)
    coin_sales_this_month = sum(1 for row in like_rows if (_as_utc_datetime(row.get("created_at")) or start_year) >= month_start)
    coin_sales_prev_month = sum(
        1
        for row in like_rows
        if prev_month_start <= (_as_utc_datetime(row.get("created_at")) or start_year) <= prev_month_end
    )

    period_labels = []
    period_subscriptions = []
    period_coin_sales = []
    day_map_subs: dict[date, int] = defaultdict(int)
    day_map_coins: dict[date, int] = defaultdict(int)

    for row in bookmark_rows_period:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is not None:
            day_map_subs[created_at.date()] += 1

    for row in like_rows_period:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is not None:
            day_map_coins[created_at.date()] += 1

    for offset in range(period_days - 1, -1, -1):
        day = (now - timedelta(days=offset)).date()
        period_labels.append(day.strftime("%d %b") if period_days > 31 else str(day.day))
        period_subscriptions.append(day_map_subs.get(day, 0))
        period_coin_sales.append(day_map_coins.get(day, 0))

    subs_current_period = sum(period_subscriptions)
    coins_current_period = sum(period_coin_sales)
    subs_previous_period = sum(
        1
        for row in bookmark_rows_period
        if start_prev <= (_as_utc_datetime(row.get("created_at")) or start_year) <= end_prev
    )
    coins_previous_period = sum(
        1
        for row in like_rows_period
        if start_prev <= (_as_utc_datetime(row.get("created_at")) or start_year) <= end_prev
    )

    return {
        "period_days": period_days,
        "total_revenue": total_revenue,
        "premium_subs": premium_subs,
        "coin_sales": coin_sales_this_month,
        "renewals_pct": renewals_pct,
        "kpi_changes": {
            "revenue_change": round(_percent_change(subs_current_period * 2.99 + coins_current_period * 0.35, subs_previous_period * 2.99 + coins_previous_period * 0.35), 1),
            "premium_subs_change": round(_percent_change(subs_this_month, subs_prev_month), 1),
            "coin_sales_change": round(_percent_change(coin_sales_this_month, coin_sales_prev_month), 1),
            "renewals_change": 0.0,
        },
        "charts": {
            "labels": period_labels,
            "subscriptions": period_subscriptions,
            "coin_sales": period_coin_sales,
            "monthly_labels": monthly_labels,
            "monthly_subscriptions": monthly_subscriptions,
            "monthly_coin_sales": monthly_coin_sales,
        },
    }


@router.get("/users")
async def list_users(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    ensure_admin(current_user)

    story_stats_rows = await database.stories.aggregate(
        [
            {
                "$group": {
                    "_id": "$author_id",
                    "books_count": {"$sum": 1},
                    "reads_count": {"$sum": "$views"},
                }
            }
        ]
    ).to_list(length=5000)
    story_stats = {row["_id"]: row for row in story_stats_rows}

    cursor = database.users.find({}).sort("created_at", -1).limit(500)
    users: list[dict] = []
    async for user in cursor:
        user_story_stats = story_stats.get(user["_id"], {})
        is_active = bool(not user.get("is_banned", False) and user.get("is_email_verified", False))
        users.append(
            {
                "id": user["_id"],
                "username": user.get("username", ""),
                "name": user.get("full_name", ""),
                "full_name": user.get("full_name", ""),
                "email": user.get("email", ""),
                "mobile": user.get("phone", ""),
                "phone": user.get("phone", ""),
                "gender": user.get("gender", ""),
                "country": user.get("country", ""),
                "preferred_language": user.get("preferred_language", ""),
                "profile_image": user.get("profile_image", ""),
                "date_of_birth": user.get("date_of_birth", ""),
                "role": _normalize_role(user.get("role"), is_admin=bool(user.get("is_admin", False))),
                "is_admin": user.get("is_admin", False),
                "is_banned": user.get("is_banned", False),
                "is_email_verified": user.get("is_email_verified", False),
                "followers_count": user.get("followers_count", 0),
                "reads_count": _safe_int(user_story_stats.get("reads_count", 0), 0),
                "books_count": _safe_int(user_story_stats.get("books_count", 0), 0),
                "status": "active" if is_active else "inactive",
                "created_at": user.get("created_at"),
            }
        )
    return users


@router.post("/users")
async def create_user(
    payload: AdminUserPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    username = payload.username.strip()
    email = payload.email.strip().lower()
    if await database.users.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username already exists")
    if await database.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")

    now = datetime.now(timezone.utc)
    user_id = str(uuid4())
    document = {
        "_id": user_id,
        "username": username,
        "email": email,
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name.strip(),
        "phone": payload.phone.strip(),
        "country": payload.country.strip(),
        "preferred_language": payload.preferred_language.strip(),
        "gender": payload.gender.strip(),
        "profile_image": payload.profile_image.strip(),
        "role": _normalize_role(payload.role, is_admin=payload.is_admin),
        "is_admin": payload.is_admin,
        "is_banned": payload.is_banned,
        "is_email_verified": True,
        "bio": "",
        "favorite_genres": [],
        "followers_count": 0,
        "following_count": 0,
        "profile_completed": False,
        "onboarding_status": "active",
        "created_at": now,
        "updated_at": now,
    }
    await database.users.insert_one(document)
    return {"message": "User created", "id": user_id}


@router.patch("/users/{user_id}")
async def update_user(
    user_id: str,
    payload: AdminUserUpdatePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    existing = await database.users.find_one({"_id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    updates: dict[str, Any] = {}
    data = payload.model_dump(exclude_unset=True)

    if "username" in data:
        username = str(data["username"] or "").strip()
        if not username:
            raise HTTPException(status_code=400, detail="Username is required")
        if username != existing.get("username") and await database.users.find_one({"username": username}):
            raise HTTPException(status_code=400, detail="Username already exists")
        updates["username"] = username

    if "email" in data:
        email = str(data["email"] or "").strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required")
        if email != existing.get("email") and await database.users.find_one({"email": email}):
            raise HTTPException(status_code=400, detail="Email already exists")
        updates["email"] = email

    if "password" in data and data["password"]:
        updates["password_hash"] = hash_password(str(data["password"]))

    for field in ["full_name", "phone", "country", "preferred_language", "gender", "profile_image"]:
        if field in data:
            updates[field] = str(data[field] or "").strip()

    if "role" in data:
        current_is_admin = bool(data.get("is_admin", existing.get("is_admin", False)))
        updates["role"] = _normalize_role(data.get("role"), is_admin=current_is_admin)

    for field in ["is_admin", "is_banned"]:
        if field in data:
            updates[field] = bool(data[field])

    if "is_admin" in updates and "role" not in updates:
        updates["role"] = _normalize_role(existing.get("role"), is_admin=bool(updates["is_admin"]))

    if not updates:
        raise HTTPException(status_code=400, detail="No user changes supplied")

    updates["updated_at"] = datetime.now(timezone.utc)
    await database.users.update_one({"_id": user_id}, {"$set": updates})
    return {"message": "User updated"}


@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="You cannot ban yourself")

    await database.users.update_one({"_id": user_id}, {"$set": {"is_banned": True}})
    return {"message": "User banned"}


@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.users.update_one({"_id": user_id}, {"$set": {"is_banned": False}})
    return {"message": "User unbanned"}


@router.get("/admin-users")
async def list_admin_users(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    return {"items": await _build_admin_users_rows(database)}


class AdminRolePayload(BaseModel):
    role: str = Field(min_length=1, max_length=40)


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    payload: AdminRolePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    existing = await database.users.find_one({"_id": user_id}, {"_id": 1, "is_admin": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    role = _normalize_role(payload.role, is_admin=bool(existing.get("is_admin", False)))
    is_admin = role in {"super_admin", "admin", "moderator", "editor"}
    await database.users.update_one(
        {"_id": user_id},
        {"$set": {"role": role, "is_admin": is_admin, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"message": "User role updated", "role": role, "is_admin": is_admin}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    if user_id == current_user["_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    user = await database.users.find_one({"_id": user_id}, {"_id": 1})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    authored_story_ids = [
        row.get("_id")
        for row in await database.stories.find({"author_id": user_id}, {"_id": 1}).to_list(length=5000)
        if row.get("_id")
    ]

    if authored_story_ids:
        await database.stories.delete_many({"_id": {"$in": authored_story_ids}})
        await database.chapters.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.comments.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.likes.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.bookmarks.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.reading_history.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.views.delete_many({"story_id": {"$in": authored_story_ids}})
        await database.reports.delete_many({"story_id": {"$in": authored_story_ids}})

    await database.comments.delete_many({"user_id": user_id})
    await database.likes.delete_many({"user_id": user_id})
    await database.bookmarks.delete_many({"user_id": user_id})
    await database.reading_history.delete_many({"user_id": user_id})
    await database.notifications.delete_many({"user_id": user_id})
    await database.followers.delete_many({"$or": [{"follower_id": user_id}, {"target_id": user_id}]})
    await database.user_blocks.delete_many({"$or": [{"blocked_user_id": user_id}, {"blocked_by_user_id": user_id}]})
    await database.user_activity.delete_many({"user_id": user_id})
    await database.reports.delete_many({"$or": [{"user_id": user_id}, {"target_user_id": user_id}]})
    await database.badges.delete_many({"user_id": user_id})
    await database.users.delete_one({"_id": user_id})

    cache.invalidate_prefix("discovery:")
    return {"message": "User and related records deleted"}


@router.get("/reports")
async def list_reports(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    ensure_admin(current_user)
    cursor = database.reports.find({}).sort("updated_at", -1).limit(300)
    reports: list[dict] = []
    async for report in cursor:
        reports.append(
            {
                "id": str(report.get("_id", "")),
                "story_id": str(report.get("story_id", "")),
                "chapter_id": str(report.get("chapter_id", "")),
                "comment_id": str(report.get("comment_id", "")),
                "user_id": str(report.get("user_id", "")),
                "target_user_id": str(report.get("target_user_id", "")),
                "report_kind": str(report.get("report_kind", "story")),
                "reported_entity_type": str(report.get("reported_entity_type", report.get("report_kind", "story"))),
                "reason": report.get("reason", ""),
                "status": report.get("status", "open"),
                "created_at": report.get("created_at"),
                "updated_at": report.get("updated_at"),
            }
        )
    return reports


@router.post("/reports/{report_id}/resolve")
async def resolve_report(
    report_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.reports.update_one({"_id": report_id}, {"$set": {"status": "resolved"}})
    return {"message": "Report resolved"}


@router.delete("/stories/{story_id}")
async def delete_story(
    story_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.stories.delete_one({"_id": story_id})
    await database.chapters.delete_many({"story_id": story_id})
    await database.comments.delete_many({"story_id": story_id})
    await database.likes.delete_many({"story_id": story_id})
    await database.bookmarks.delete_many({"story_id": story_id})
    await database.reading_history.delete_many({"story_id": story_id})
    await database.views.delete_many({"story_id": story_id})
    await database.reports.delete_many({"story_id": story_id})
    cache.invalidate_prefix("discovery:")
    return {"message": "Story and related records deleted"}


@router.get("/stories")
async def list_stories_for_admin(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    ensure_admin(current_user)

    users = await database.users.find({}, {"_id": 1, "username": 1, "full_name": 1, "preferred_language": 1}).to_list(length=4000)
    user_lookup = {user["_id"]: user for user in users}

    cursor = database.stories.find({}).sort("updated_at", -1).limit(300)
    stories: list[dict] = []
    async for story in cursor:
        author = user_lookup.get(story.get("author_id", ""), {})
        categories = story.get("categories") or []
        stories.append(
            {
                "id": story["_id"],
                "title": story.get("title", ""),
                "author_id": story.get("author_id", ""),
                "author_username": author.get("username", "Unknown"),
                "author_name": author.get("full_name") or author.get("username", "Unknown"),
                "publisher": author.get("full_name") or author.get("username", "Unknown"),
                "cover_image": story.get("cover_image", ""),
                "category": categories[0] if categories else "Fiction",
                "language": author.get("preferred_language") or "English",
                "status": story.get("status", "published"),
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "created_at": story.get("created_at"),
                "updated_at": story.get("updated_at"),
            }
        )
    return stories


@router.get("/dashboard")
async def dashboard_summary(
    period_days: int = Query(default=7, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    total_users = await database.users.count_documents({})
    active_users = await database.users.count_documents({"is_banned": False, "is_email_verified": True})
    inactive_users = max(0, total_users - active_users)
    total_books = await database.stories.count_documents({})
    active_books = await database.stories.count_documents({"status": "published"})
    pending_books = await database.stories.count_documents({"status": {"$ne": "published"}})
    total_downloads = await database.bookmarks.count_documents({})

    now = datetime.now(timezone.utc)
    start_period = now - timedelta(days=period_days - 1)

    story_rows = await database.stories.find(
        {},
        {"title": 1, "cover_image": 1, "categories": 1, "status": 1, "created_at": 1, "views": 1, "author_id": 1},
    ).sort("created_at", -1).limit(12).to_list(length=12)
    total_views = sum(_safe_int(item.get("views", 0), 0) for item in story_rows)
    total_views_all_rows = await database.stories.aggregate([
        {"$group": {"_id": None, "views": {"$sum": "$views"}}}
    ]).to_list(length=1)
    if total_views_all_rows:
        total_views = _safe_int(total_views_all_rows[0].get("views", 0), 0)

    trending_rows = await database.stories.find(
        {},
        {"_id": 1, "title": 1, "cover_image": 1, "views": 1, "categories": 1, "author_id": 1},
    ).sort("views", -1).limit(8).to_list(length=8)

    author_ids = [row.get("author_id", "") for row in trending_rows if row.get("author_id")]
    author_lookup = await _fetch_users_by_ids(database, author_ids)

    trending_stories: list[dict] = []
    for index, row in enumerate(trending_rows, start=1):
        author = author_lookup.get(row.get("author_id", ""), {})
        trending_stories.append(
            {
                "rank": index,
                "id": row.get("_id"),
                "title": row.get("title", "Untitled"),
                "image": row.get("cover_image", ""),
                "author_name": author.get("full_name") or author.get("username") or "Unknown",
                "category": (row.get("categories") or ["Fiction"])[0],
                "views": _safe_int(row.get("views", 0), 0),
            }
        )

    recent_reports_raw = await database.reports.find(
        {},
        {
            "_id": 1,
            "reason": 1,
            "status": 1,
            "created_at": 1,
            "report_kind": 1,
            "story_id": 1,
            "target_user_id": 1,
            "user_id": 1,
        },
    ).sort("created_at", -1).limit(8).to_list(length=8)
    report_user_ids = [
        _to_text(item.get("target_user_id"))
        for item in recent_reports_raw
        if _to_text(item.get("target_user_id"))
    ]
    report_user_ids.extend([
        _to_text(item.get("user_id"))
        for item in recent_reports_raw
        if _to_text(item.get("user_id"))
    ])
    report_story_ids = [_to_text(item.get("story_id")) for item in recent_reports_raw if _to_text(item.get("story_id"))]

    report_users = await _fetch_users_by_ids(database, report_user_ids)
    report_stories_rows = await database.stories.find(
        {"_id": {"$in": list({item for item in report_story_ids if item})}},
        {"_id": 1, "title": 1},
    ).to_list(length=200)
    report_story_lookup = {row.get("_id"): row for row in report_stories_rows}

    recent_reports: list[dict] = []
    for row in recent_reports_raw:
        target_user_id = _to_text(row.get("target_user_id"))
        reporter_id = _to_text(row.get("user_id"))
        story_id = _to_text(row.get("story_id"))
        target_user = report_users.get(target_user_id, {})
        reporter = report_users.get(reporter_id, {})
        story = report_story_lookup.get(story_id, {})
        reason = _to_text(row.get("reason")) or "Report submitted"
        recent_reports.append(
            {
                "id": _to_text(row.get("_id")),
                "reason": reason,
                "status": row.get("status", "open"),
                "report_kind": _to_text(row.get("report_kind") or "story"),
                "created_at": row.get("created_at"),
                "reported_user_id": target_user_id,
                "reported_user_name": target_user.get("full_name") or target_user.get("username") or "Unknown user",
                "reporter_name": reporter.get("full_name") or reporter.get("username") or "Unknown reporter",
                "story_id": story_id,
                "story_title": story.get("title") or "Story",
            }
        )

    recent_activity_rows = await database.user_activity.find(
        {"created_at": {"$gte": start_period}},
        {"user_id": 1, "post_id": 1, "action_type": 1, "created_at": 1},
    ).sort("created_at", -1).limit(max(20, period_days * 2)).to_list(length=max(20, period_days * 2))

    activity_user_ids = [_to_text(item.get("user_id")) for item in recent_activity_rows if _to_text(item.get("user_id"))]
    activity_post_ids = [_to_text(item.get("post_id")) for item in recent_activity_rows if _to_text(item.get("post_id"))]
    activity_users = await _fetch_users_by_ids(database, activity_user_ids)
    activity_stories_rows = await database.stories.find(
        {"_id": {"$in": list({item for item in activity_post_ids if item})}},
        {"_id": 1, "title": 1},
    ).to_list(length=300)
    activity_story_lookup = {row.get("_id"): row for row in activity_stories_rows}

    recent_activities: list[dict] = []
    for row in recent_activity_rows:
        user_id = _to_text(row.get("user_id"))
        post_id = _to_text(row.get("post_id"))
        user = activity_users.get(user_id, {})
        story = activity_story_lookup.get(post_id, {})
        recent_activities.append(
            {
                "id": f"{user_id}-{post_id}-{_to_text(row.get('created_at'))}",
                "user_id": user_id,
                "user_name": user.get("full_name") or user.get("username") or "Reader",
                "story_id": post_id,
                "story_title": story.get("title") or "Story",
                "action_type": _to_text(row.get("action_type") or "activity"),
                "created_at": row.get("created_at"),
            }
        )

    user_growth_labels = []
    user_growth_values = []
    daily_reads_values = []
    daily_reads_by_date: dict[date, int] = defaultdict(int)
    for row in recent_activity_rows:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is not None:
            daily_reads_by_date[created_at.date()] += 1

    users_by_date: dict[date, int] = defaultdict(int)
    users_7d_rows = await database.users.find(
        {"created_at": {"$gte": start_period}},
        {"created_at": 1},
    ).to_list(length=100000)
    for row in users_7d_rows:
        created_at = _as_utc_datetime(row.get("created_at"))
        if created_at is not None:
            users_by_date[created_at.date()] += 1

    for offset in range(period_days - 1, -1, -1):
        day = (now - timedelta(days=offset)).date()
        user_growth_labels.append(day.strftime("%a") if period_days <= 14 else day.strftime("%d %b"))
        user_growth_values.append(users_by_date.get(day, 0))
        daily_reads_values.append(daily_reads_by_date.get(day, 0))

    recent_books = []
    for item in story_rows:
        recent_books.append(
            {
                "id": item.get("_id"),
                "image": item.get("cover_image", ""),
                "title": item.get("title", "Untitled"),
                "category": (item.get("categories") or ["Fiction"])[0],
                "status": item.get("status", "published"),
                "created_at": item.get("created_at"),
            }
        )

    return {
        "period_days": period_days,
        "summary": {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": inactive_users,
            "total_books": total_books,
            "active_books": active_books,
            "pending_books": pending_books,
            "total_downloads": total_downloads,
            "total_views": total_views,
        },
        "recent_books": recent_books,
        "charts": {
            "user_growth": {"labels": user_growth_labels, "values": user_growth_values},
            "daily_reads": {"labels": user_growth_labels, "values": daily_reads_values},
        },
        "trending_stories": trending_stories,
        "recent_reports": recent_reports,
        "recent_activities": recent_activities,
    }


@router.get("/categories")
async def admin_categories(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    rows = await database.stories.aggregate(
        [
            {"$match": {"categories": {"$exists": True, "$ne": []}}},
            {"$unwind": "$categories"},
            {
                "$group": {
                    "_id": "$categories",
                    "books_count": {"$sum": 1},
                    "created_at": {"$min": "$created_at"},
                }
            },
            {"$sort": {"_id": 1}},
        ]
    ).to_list(length=300)
    return {
        "items": [
            {
                "name": row.get("_id", "Unknown"),
                "status": "active",
                "books_count": row.get("books_count", 0),
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    }


@router.get("/languages")
async def admin_languages(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    rows = await database.users.aggregate(
        [
            {"$match": {"preferred_language": {"$exists": True, "$ne": ""}}},
            {
                "$group": {
                    "_id": "$preferred_language",
                    "users_count": {"$sum": 1},
                    "active_users": {
                        "$sum": {"$cond": [{"$eq": ["$is_banned", False]}, 1, 0]}
                    },
                }
            },
            {"$sort": {"users_count": -1, "_id": 1}},
        ]
    ).to_list(length=200)
    return {
        "items": [
            {
                "name": row.get("_id", "Unknown"),
                "users_count": row.get("users_count", 0),
                "active_users": row.get("active_users", 0),
                "status": "active",
            }
            for row in rows
        ]
    }


@router.get("/book-requests")
async def admin_book_requests(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    rows = await database.reports.find({}).sort("updated_at", -1).limit(200).to_list(length=200)
    story_ids = [row.get("story_id") for row in rows if row.get("story_id")]
    user_ids = [row.get("user_id") for row in rows if row.get("user_id")]
    stories = await database.stories.find({"_id": {"$in": story_ids}}, {"title": 1}).to_list(length=500)
    users = await database.users.find({"_id": {"$in": user_ids}}, {"username": 1, "full_name": 1}).to_list(length=500)
    story_lookup = {item["_id"]: item.get("title", "Unknown Story") for item in stories}
    user_lookup = {item["_id"]: item.get("full_name") or item.get("username", "Unknown User") for item in users}
    return {
        "items": [
            {
                "id": row.get("_id"),
                "title": story_lookup.get(row.get("story_id"), "Unknown Story"),
                "requested_by": user_lookup.get(row.get("user_id"), "Unknown User"),
                "reason": row.get("reason", ""),
                "status": row.get("status", "open"),
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    }


@router.get("/setup")
async def admin_setup(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    site_settings = await database.site_settings.find_one({"_id": "default"}) or _default_site_settings()
    admins = await database.users.find({"is_admin": True}, {"username": 1, "email": 1, "full_name": 1, "profile_image": 1, "created_at": 1}).to_list(length=50)
    return {
        "site_name": site_settings.get("site_name", "Wingsaga"),
        "logo_url": site_settings.get("logo_url", ""),
        "admins": [
            {
                "id": item.get("_id"),
                "username": item.get("username", ""),
                "email": item.get("email", ""),
                "name": item.get("full_name", ""),
                "image": item.get("profile_image", ""),
                "created_at": item.get("created_at"),
            }
            for item in admins
        ],
    }


@router.get("/recommendations-debug")
async def recommendation_debug(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    last_activity = await database.user_activity.find({}, {"user_id": 1, "post_id": 1, "action_type": 1, "created_at": 1, "scroll_depth": 1, "read_time": 1}).sort("created_at", -1).limit(10).to_list(length=10)
    cache_keys = sorted(cache.keys("recommendations:"))
    per_story_views = await database.stories.find({}, {"title": 1, "views": 1}).sort("views", -1).limit(20).to_list(length=20)

    return {
        "last_activity": last_activity,
        "cache_keys": cache_keys,
        "per_story_views": [
            {"story_id": item.get("_id"), "title": item.get("title", "Untitled"), "views": _safe_int(item.get("views", 0), 0)}
            for item in per_story_views
        ],
    }


@router.patch("/stories/{story_id}/status")
async def update_story_status(
    story_id: str,
    payload: StoryStatusPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    allowed = {"published", "draft", "archived"}
    normalized = payload.status.strip().lower()
    if normalized not in allowed:
        raise HTTPException(status_code=400, detail="Status must be one of: published, draft, archived")

    result = await database.stories.update_one(
        {"_id": story_id},
        {"$set": {"status": normalized, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Story not found")

    cache.invalidate_prefix("discovery:")
    return {"message": f"Story status updated to {normalized}"}


@router.patch("/stories/{story_id}/cover")
async def update_story_cover(
    story_id: str,
    payload: StoryCoverPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    cover_image = payload.cover_image.strip()
    if not cover_image:
        raise HTTPException(status_code=400, detail="Cover image URL is required")

    result = await database.stories.update_one(
        {"_id": story_id},
        {"$set": {"cover_image": cover_image, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Story not found")

    cache.invalidate_prefix("discovery:")
    return {"message": "Story cover updated"}


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.comments.delete_one({"_id": comment_id})
    return {"message": "Comment deleted"}


@router.get("/comments")
async def list_comments_for_admin(
    status: str = "all",
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    ensure_admin(current_user)
    query: dict = {}
    normalized = status.strip().lower()
    if normalized in {"visible", "hidden"}:
        query["status"] = normalized

    cursor = database.comments.find(query).sort("created_at", -1).limit(500)
    comments: list[dict] = []
    async for comment in cursor:
        comments.append(
            {
                "id": comment["_id"],
                "story_id": comment.get("story_id", ""),
                "user_id": comment.get("user_id", ""),
                "content": comment.get("content", ""),
                "status": comment.get("status", "visible"),
                "created_at": comment.get("created_at"),
            }
        )
    return comments


@router.post("/comments/{comment_id}/hide")
async def hide_comment(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.comments.update_one({"_id": comment_id}, {"$set": {"status": "hidden"}})
    return {"message": "Comment hidden"}


@router.post("/comments/{comment_id}/show")
async def show_comment(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.comments.update_one({"_id": comment_id}, {"$set": {"status": "visible"}})
    return {"message": "Comment visible"}


@router.post("/comments/bulk-action")
async def bulk_comment_action(
    payload: BulkCommentActionPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    action = payload.action.strip().lower()
    if action not in {"hide", "show", "delete"}:
        raise HTTPException(status_code=400, detail="Action must be one of: hide, show, delete")

    if action == "delete":
        result = await database.comments.delete_many({"_id": {"$in": payload.comment_ids}})
        changed = result.deleted_count
    elif action == "hide":
        result = await database.comments.update_many({"_id": {"$in": payload.comment_ids}}, {"$set": {"status": "hidden"}})
        changed = result.modified_count
    else:
        result = await database.comments.update_many({"_id": {"$in": payload.comment_ids}}, {"$set": {"status": "visible"}})
        changed = result.modified_count

    return {"message": f"Bulk action '{action}' applied", "affected": changed}


@router.get("/badges/summary")
async def badge_summary(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    pipeline = [
        {
            "$group": {
                "_id": {"badge_key": "$badge_key", "title": "$title", "tier": "$tier"},
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"_id.title": 1, "_id.tier": 1}},
    ]
    rows = await database.badges.aggregate(pipeline).to_list(length=200)
    items = [
        {
            "badge_key": row["_id"].get("badge_key"),
            "title": row["_id"].get("title"),
            "tier": row["_id"].get("tier"),
            "count": row.get("count", 0),
        }
        for row in rows
    ]
    return {"items": items}


@router.get("/site-settings")
async def get_site_settings_admin(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    settings_doc = await database.site_settings.find_one({"_id": "default"})
    if not settings_doc:
        return _default_site_settings()

    return {
        "site_name": settings_doc.get("site_name") or "Wingsaga",
        "logo_url": settings_doc.get("logo_url") or "",
    }


@router.patch("/site-settings")
async def update_site_settings(
    payload: SiteSettingsPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    await database.site_settings.update_one(
        {"_id": "default"},
        {
            "$set": {
                "site_name": payload.site_name.strip() or "Wingsaga",
                "logo_url": (payload.logo_url or "").strip(),
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "_id": "default",
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    return {"message": "Site settings updated"}


@router.post("/site-settings/logo")
async def upload_site_logo(
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    data = await image.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be <= 5MB")

    ext = Path(image.filename or "logo.png").suffix or ".png"
    file_name = f"site-logo-{uuid4()}{ext}"

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file_name
    file_path.write_bytes(data)

    logo_url = f"{settings.public_backend_base_url.rstrip('/')}/uploads/{file_name}"
    await database.site_settings.update_one(
        {"_id": "default"},
        {
            "$set": {
                "logo_url": logo_url,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "_id": "default",
                "site_name": "Wingsaga",
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    return {"message": "Logo uploaded", "logo_url": logo_url}


@router.get("/settings/full")
async def get_full_settings(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    settings_doc = await database.site_settings.find_one({"_id": "default"})
    return _merge_site_settings(settings_doc)


@router.patch("/settings/full")
async def update_full_settings(
    payload: AdminSettingsDocumentPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    existing = _merge_site_settings(await database.site_settings.find_one({"_id": "default"}))
    incoming = payload.settings or {}
    for key, value in incoming.items():
        if isinstance(existing.get(key), dict) and isinstance(value, dict):
            existing[key] = {**existing[key], **value}
        else:
            existing[key] = value

    existing["site_name"] = str(existing.get("site_name") or "Bixbi").strip() or "Bixbi"
    existing["logo_url"] = str(existing.get("logo_url") or existing.get("light_logo_url") or "").strip()
    existing["updated_at"] = datetime.now(timezone.utc)
    existing.pop("created_at", None)

    await database.site_settings.update_one(
        {"_id": "default"},
        {"$set": existing, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"message": "Settings updated", "settings": existing}


@router.get("/cms-pages")
async def list_cms_pages(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    return {"items": await _build_cms_rows(database)}


@router.post("/cms-pages")
async def create_cms_page(
    payload: AdminCmsPagePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    slug = _slugify(payload.slug)
    now = datetime.now(timezone.utc)
    await database.cms_pages.update_one(
        {"slug": slug},
        {
            "$set": {
                "slug": slug,
                "title": payload.title.strip(),
                "excerpt": payload.excerpt.strip(),
                "content": payload.content,
                "is_published": payload.is_published,
                "updated_at": now,
            },
            "$setOnInsert": {"_id": slug, "created_at": now},
        },
        upsert=True,
    )
    return {"message": "CMS page saved", "slug": slug}


@router.patch("/cms-pages/{slug}")
async def update_cms_page(
    slug: str,
    payload: AdminCmsPagePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    normalized_slug = _slugify(slug)
    await database.cms_pages.update_one(
        {"slug": normalized_slug},
        {
            "$set": {
                "title": payload.title.strip(),
                "excerpt": payload.excerpt.strip(),
                "content": payload.content,
                "is_published": payload.is_published,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return {"message": "CMS page updated"}


@router.delete("/cms-pages/{slug}")
async def delete_cms_page(
    slug: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.cms_pages.delete_one({"slug": _slugify(slug)})
    return {"message": "CMS page deleted"}


@router.post("/push-notifications")
async def create_push_notification(
    payload: AdminPushNotificationPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    now = datetime.now(timezone.utc)
    notification_id = str(uuid4())
    recipients = await database.users.find({"is_banned": {"$ne": True}}, {"_id": 1}).to_list(length=5000)
    recipient_ids = [item.get("_id") for item in recipients if item.get("_id")]

    if recipient_ids:
        await database.notifications.insert_many([
            {
                "_id": f"{notification_id}::{user_id}",
                "user_id": user_id,
                "type": "broadcast",
                "message": f"{payload.title.strip()}: {payload.description.strip()}",
                "is_read": False,
                "created_at": now,
            }
            for user_id in recipient_ids
        ])

    await database.push_notifications.insert_one(
        {
            "_id": notification_id,
            "title": payload.title.strip(),
            "description": payload.description.strip(),
            "status": "sent",
            "recipient_count": len(recipient_ids),
            "created_at": now,
        }
    )
    return {"message": "Push notification sent", "recipient_count": len(recipient_ids)}


@router.post("/hashtags")
async def create_hashtag(
    payload: AdminHashtagPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    name = payload.name.strip().lstrip("#").lower()
    if not name:
        raise HTTPException(status_code=400, detail="Hashtag name is required")
    await database.hashtag_catalog.update_one(
        {"name": name},
        {
            "$set": {"status": "active"},
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    return {"message": "Hashtag saved"}


@router.delete("/hashtags/{tag_name}")
async def delete_hashtag(
    tag_name: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.hashtag_catalog.delete_one({"name": tag_name.strip().lstrip("#").lower()})
    return {"message": "Hashtag deleted"}


@router.post("/languages")
async def create_language(
    payload: AdminLanguagePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    if payload.is_default:
        await database.language_catalog.update_many({}, {"$set": {"is_default": False}})
    await database.language_catalog.update_one(
        {"name": payload.name.strip()},
        {
            "$set": {
                "country": payload.country.strip() or "Unknown",
                "status": payload.status.strip().lower() or "active",
                "is_default": payload.is_default,
            },
            "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
    return {"message": "Language saved"}


@router.patch("/languages/{language_name}")
async def update_language(
    language_name: str,
    payload: AdminLanguageUpdatePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    updates: dict[str, Any] = {}
    if payload.country is not None:
        updates["country"] = payload.country.strip() or "Unknown"
    if payload.status is not None:
        updates["status"] = payload.status.strip().lower() or "active"
    if payload.is_default is not None:
        if payload.is_default:
            await database.language_catalog.update_many({}, {"$set": {"is_default": False}})
        updates["is_default"] = payload.is_default
    if not updates:
        raise HTTPException(status_code=400, detail="No language changes supplied")
    await database.language_catalog.update_one({"name": language_name}, {"$set": updates})
    return {"message": "Language updated"}


@router.delete("/languages/{language_name}")
async def delete_language(
    language_name: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.language_catalog.delete_one({"name": language_name})
    return {"message": "Language deleted"}


@router.get("/avatars")
async def list_avatars(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    return {"items": await _build_avatar_rows(database)}


@router.post("/uploads/image")
async def upload_admin_image(
    image: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    ensure_admin(current_user)
    image_url = await _save_upload_image(image)
    return {"message": "Image uploaded", "image_url": image_url}


@router.get("/genres")
async def list_genres(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    return {"items": await _build_genre_rows(database)}


@router.post("/genres")
async def create_genre(
    payload: AdminGenrePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Genre name is required")
    await database.genre_catalog.update_one(
        {"name": name},
        {
            "$set": {
                "icon_url": payload.icon_url.strip(),
                "status": payload.status.strip().lower() or "active",
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "name": name,
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    return {"message": "Genre saved"}


@router.patch("/genres/{genre_name}")
async def update_genre(
    genre_name: str,
    payload: AdminGenreUpdatePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    updates: dict[str, Any] = {}
    if payload.icon_url is not None:
        updates["icon_url"] = payload.icon_url.strip()
    if payload.status is not None:
        updates["status"] = payload.status.strip().lower() or "active"
    if not updates:
        raise HTTPException(status_code=400, detail="No genre changes supplied")
    updates["updated_at"] = datetime.now(timezone.utc)
    await database.genre_catalog.update_one({"name": genre_name}, {"$set": updates})
    return {"message": "Genre updated"}


@router.delete("/genres/{genre_name}")
async def delete_genre(
    genre_name: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.genre_catalog.delete_one({"name": genre_name})
    return {"message": "Genre deleted"}


@router.post("/avatars")
async def create_avatar(
    payload: AdminAvatarPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    avatar_id = str(uuid4())
    await database.avatar_library.insert_one(
        {
            "_id": avatar_id,
            "name": payload.name.strip(),
            "gender": payload.gender.strip().lower() or "unknown",
            "image_url": payload.image_url.strip(),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"message": "Avatar created", "id": avatar_id}


@router.patch("/avatars/{avatar_id}")
async def update_avatar(
    avatar_id: str,
    payload: AdminAvatarPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.avatar_library.update_one(
        {"_id": avatar_id},
        {"$set": {"name": payload.name.strip(), "gender": payload.gender.strip().lower() or "unknown", "image_url": payload.image_url.strip()}},
    )
    return {"message": "Avatar updated"}


@router.delete("/avatars/{avatar_id}")
async def delete_avatar(
    avatar_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)
    await database.avatar_library.delete_one({"_id": avatar_id})
    return {"message": "Avatar deleted"}


@router.get("/panel-data")
async def admin_panel_data(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    task_specs: list[tuple[str, Any, Any]] = [
        ("dashboard", dashboard_summary(period_days=7, current_user=current_user, database=database), {}),
        ("analytics", analytics(period_days=30, current_user=current_user, database=database), {}),
        ("monetization", monetization(period_days=30, current_user=current_user, database=database), {}),
        ("users", list_users(current_user=current_user, database=database), []),
        ("admin_users", _build_admin_users_rows(database), []),
        ("stories", _build_admin_story_rows(database, sort_field="created_at", limit=120), []),
        ("user_reports", _build_report_rows(database, "user"), []),
        ("story_reports", _build_report_rows(database, "story"), []),
        ("chapter_reports", _build_report_rows(database, "chapter"), []),
        ("comment_reports", _build_report_rows(database, "comment"), []),
        ("post_reports", _build_report_rows(database, "story"), []),
        ("country_users", _build_country_rows(database), []),
        ("hashtags", _build_hashtag_rows(database), []),
        ("languages", _build_language_rows(database), []),
        ("genres", _build_genre_rows(database), []),
        ("blocks", _build_block_rows(database), []),
        ("avatars", _build_avatar_rows(database), []),
        ("push_notifications", _build_push_rows(database), []),
        ("settings", get_full_settings(current_user=current_user, database=database), {}),
        ("cms_pages", _build_cms_rows(database), []),
        ("debug", recommendation_debug(current_user=current_user, database=database), {}),
    ]

    results = await asyncio.gather(*(item[1] for item in task_specs), return_exceptions=True)
    response: dict[str, Any] = {}
    errors: dict[str, str] = {}

    for (name, _, default), result in zip(task_specs, results):
        if isinstance(result, Exception):
            logger.exception("admin panel data task failed: %s", name, exc_info=result)
            response[name] = default
            errors[name] = str(result)
        else:
            response[name] = result

    if errors:
        response["partial_errors"] = errors

    return response
