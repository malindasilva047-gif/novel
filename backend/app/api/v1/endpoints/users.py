from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.db.deps import get_current_user, get_database

router = APIRouter(prefix="/users", tags=["users"])


class ProfileUpdatePayload(BaseModel):
    bio: str = Field(default="", max_length=300)
    profile_image: str = Field(default="", max_length=500)
    full_name: str = Field(default="", max_length=80)
    location: str = Field(default="", max_length=100)
    country: str = Field(default="", max_length=80)
    phone: str = Field(default="", max_length=30)
    date_of_birth: str = Field(default="", max_length=20)
    gender: str = Field(default="", max_length=30)
    website: str = Field(default="", max_length=200)
    favorite_genres: list[str] = Field(default_factory=list)
    reading_goal: str = Field(default="", max_length=120)
    preferred_language: str = Field(default="", max_length=40)


class ChangePasswordPayload(BaseModel):
    current_password: str = Field(min_length=6, max_length=120)
    new_password: str = Field(min_length=6, max_length=120)
    confirm_password: str = Field(min_length=6, max_length=120)


def _is_profile_completed(user: dict) -> bool:
    required_text_fields = [
        "full_name",
        "bio",
        "location",
        "country",
        "preferred_language",
    ]
    has_text = all(str(user.get(field, "")).strip() for field in required_text_fields)
    has_genres = bool(user.get("favorite_genres"))
    return has_text and has_genres


@router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)) -> dict:
    profile_completed = bool(current_user.get("profile_completed", False) or _is_profile_completed(current_user))
    onboarding_status = "active" if profile_completed else "pending_profile"
    return {
        "id": current_user["_id"],
        "username": current_user["username"],
        "email": current_user["email"],
        "is_admin": current_user.get("is_admin", False),
        "role": "admin" if current_user.get("is_admin", False) else "user",
        "created_at": current_user.get("created_at"),
        "bio": current_user.get("bio", ""),
        "profile_image": current_user.get("profile_image", ""),
        "full_name": current_user.get("full_name", ""),
        "location": current_user.get("location", ""),
        "country": current_user.get("country", ""),
        "phone": current_user.get("phone", ""),
        "date_of_birth": current_user.get("date_of_birth", ""),
        "gender": current_user.get("gender", ""),
        "website": current_user.get("website", ""),
        "favorite_genres": current_user.get("favorite_genres", []),
        "reading_goal": current_user.get("reading_goal", ""),
        "preferred_language": current_user.get("preferred_language", ""),
        "profile_completed": profile_completed,
        "onboarding_status": onboarding_status,
        "country_code": current_user.get("country_code", ""),
        "followers_count": current_user.get("followers_count", 0),
        "following_count": current_user.get("following_count", 0),
        "geeks_count": current_user.get("followers_count", 0),
        "geeking_count": current_user.get("following_count", 0),
    }


@router.get("/me/stats")
async def get_my_profile_stats(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    user_id = current_user["_id"]

    user_story_cursor = database.stories.find(
        {"author_id": user_id},
        {"likes": 1, "views": 1},
    )

    stories_count = 0
    total_reads = 0
    total_likes = 0
    async for item in user_story_cursor:
        stories_count += 1
        total_reads += int(item.get("views", 0) or 0)
        total_likes += int(item.get("likes", 0) or 0)

    reader_history_count = await database.reading_history.count_documents({"user_id": user_id})

    return {
        "reads": total_reads,
        "stories": stories_count,
        "followers": int(current_user.get("followers_count", 0) or 0),
        "following": int(current_user.get("following_count", 0) or 0),
        "geeks": int(current_user.get("followers_count", 0) or 0),
        "geeking": int(current_user.get("following_count", 0) or 0),
        "likes": total_likes,
        "reading_items": int(reader_history_count or 0),
    }


@router.patch("/me")
async def update_my_profile(
    payload: ProfileUpdatePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    existing_full_name = str(current_user.get("full_name") or "").strip()
    existing_dob = str(current_user.get("date_of_birth") or "").strip()
    requested_full_name = payload.full_name.strip()
    requested_dob = payload.date_of_birth.strip()
    effective_full_name = existing_full_name or requested_full_name
    effective_dob = existing_dob or requested_dob
    genres = [genre.strip() for genre in payload.favorite_genres if genre.strip()]
    completed = all(
        [
            effective_full_name,
            payload.bio.strip(),
            payload.location.strip(),
            payload.country.strip(),
            payload.preferred_language.strip(),
            bool(genres),
        ]
    )
    onboarding_status = "active" if completed else "pending_profile"
    await database.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "bio": payload.bio.strip(),
                "profile_image": payload.profile_image.strip(),
                "full_name": effective_full_name,
                "location": payload.location.strip(),
                "country": payload.country.strip(),
                "phone": payload.phone.strip(),
                "date_of_birth": effective_dob,
                "gender": payload.gender.strip(),
                "website": payload.website.strip(),
                "favorite_genres": genres,
                "reading_goal": payload.reading_goal.strip(),
                "preferred_language": payload.preferred_language.strip(),
                "profile_completed": completed,
                "onboarding_status": onboarding_status,
            }
        },
    )
    return {"message": "Profile updated"}


@router.post("/me/change-password")
async def change_my_password(
    payload: ChangePasswordPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New password and confirmation do not match")

    current_hash = str(current_user.get("password_hash") or "")
    if not current_hash or not verify_password(payload.current_password, current_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if verify_password(payload.new_password, current_hash):
        raise HTTPException(status_code=400, detail="New password must be different from the current password")

    await database.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return {"message": "Password updated"}


@router.get("/notifications")
async def list_notifications(
    limit: int = 20,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    safe_limit = max(1, min(50, int(limit)))
    cursor = database.notifications.find({"user_id": current_user["_id"]}).sort("created_at", -1).limit(safe_limit)
    items: list[dict] = []
    unread_count = await database.notifications.count_documents({"user_id": current_user["_id"], "is_read": False})
    async for item in cursor:
        items.append(
            {
                "id": item.get("_id"),
                "type": item.get("type", "generic"),
                "message": item.get("message", ""),
                "story_id": item.get("story_id"),
                "actor_user_id": item.get("actor_user_id"),
                "is_read": bool(item.get("is_read", False)),
                "created_at": item.get("created_at"),
            }
        )
    return {"items": items, "unread_count": unread_count}


@router.post("/notifications/mark-read")
async def mark_notifications_read(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    result = await database.notifications.update_many(
        {"user_id": current_user["_id"], "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"message": "Notifications marked as read", "updated": int(result.modified_count)}


@router.post("/upload-avatar")
async def upload_avatar(
    image: UploadFile = File(...),
    _: dict = Depends(get_current_user),
) -> dict:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = Path(image.filename or "avatar.jpg").suffix or ".jpg"
    file_name = f"avatar-{uuid4()}{ext}"

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file_name

    data = await image.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be <= 5MB")

    file_path.write_bytes(data)
    base_url = settings.public_backend_base_url.rstrip("/")
    return {"message": "Avatar uploaded", "url": f"{base_url}/uploads/{file_name}"}


@router.get("/{user_id}")
async def get_public_profile(user_id: str, database: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    user = await database.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if bool(user.get("is_banned", False)):
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user["_id"],
        "username": user["username"],
        "bio": user.get("bio", ""),
        "profile_image": user.get("profile_image", ""),
        "full_name": user.get("full_name", ""),
        "location": user.get("location", ""),
        "country": user.get("country", ""),
        "website": user.get("website", ""),
        "favorite_genres": user.get("favorite_genres", []),
        "reading_goal": user.get("reading_goal", ""),
        "followers_count": user.get("followers_count", 0),
        "following_count": user.get("following_count", 0),
        "geeks_count": user.get("followers_count", 0),
        "geeking_count": user.get("following_count", 0),
    }


@router.get("/{target_user_id}/geek-status")
async def get_geek_status(
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    target_user = await database.users.find_one(
        {"_id": target_user_id},
        {"followers_count": 1, "following_count": 1},
    )
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    relation_id = f"{current_user['_id']}::{target_user_id}"
    relation = await database.followers.find_one({"_id": relation_id}, {"_id": 1})

    return {
        "is_geeked": bool(relation),
        "geeks_count": int(target_user.get("followers_count", 0) or 0),
        "geeking_count": int(target_user.get("following_count", 0) or 0),
    }


@router.post("/{target_user_id}/follow")
async def follow_user(
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if target_user_id == current_user["_id"]:
        return {"message": "You cannot geek yourself"}

    relation_id = f"{current_user['_id']}::{target_user_id}"
    already_following = await database.followers.find_one({"_id": relation_id})
    if already_following:
        return {"message": "Already geeked"}

    await database.followers.insert_one(
        {
            "_id": relation_id,
            "follower_id": current_user["_id"],
            "target_id": target_user_id,
        }
    )
    await database.users.update_one({"_id": current_user["_id"]}, {"$inc": {"following_count": 1}})
    await database.users.update_one({"_id": target_user_id}, {"$inc": {"followers_count": 1}})
    if target_user_id != current_user["_id"]:
        await database.notifications.insert_one(
            {
                "_id": str(uuid4()),
                "user_id": target_user_id,
                "actor_user_id": current_user["_id"],
                "type": "geek",
                "message": f"{current_user.get('username', 'Someone')} geeked your author profile.",
                "is_read": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
    return {"message": "Geeked author successfully"}


@router.post("/{target_user_id}/unfollow")
async def unfollow_user(
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    relation_id = f"{current_user['_id']}::{target_user_id}"
    relation = await database.followers.find_one({"_id": relation_id})
    if not relation:
        return {"message": "You have not geeked this author"}

    await database.followers.delete_one({"_id": relation_id})
    await database.users.update_one({"_id": current_user["_id"]}, {"$inc": {"following_count": -1}})
    await database.users.update_one({"_id": target_user_id}, {"$inc": {"followers_count": -1}})
    return {"message": "Removed geek successfully"}
