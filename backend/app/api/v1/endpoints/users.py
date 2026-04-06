from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.db.deps import get_current_user, get_database

router = APIRouter(prefix="/users", tags=["users"])


class ProfileUpdatePayload(BaseModel):
    bio: str = Field(default="", max_length=300)
    profile_image: str = Field(default="", max_length=500)
    full_name: str = Field(default="", max_length=80)
    location: str = Field(default="", max_length=100)
    website: str = Field(default="", max_length=200)
    favorite_genres: list[str] = Field(default_factory=list)
    reading_goal: str = Field(default="", max_length=120)


@router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)) -> dict:
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
        "website": current_user.get("website", ""),
        "favorite_genres": current_user.get("favorite_genres", []),
        "reading_goal": current_user.get("reading_goal", ""),
        "followers_count": current_user.get("followers_count", 0),
        "following_count": current_user.get("following_count", 0),
    }


@router.patch("/me")
async def update_my_profile(
    payload: ProfileUpdatePayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    await database.users.update_one(
        {"_id": current_user["_id"]},
        {
            "$set": {
                "bio": payload.bio.strip(),
                "profile_image": payload.profile_image.strip(),
                "full_name": payload.full_name.strip(),
                "location": payload.location.strip(),
                "website": payload.website.strip(),
                "favorite_genres": [genre.strip() for genre in payload.favorite_genres if genre.strip()],
                "reading_goal": payload.reading_goal.strip(),
            }
        },
    )
    return {"message": "Profile updated"}


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

    return {
        "id": user["_id"],
        "username": user["username"],
        "bio": user.get("bio", ""),
        "profile_image": user.get("profile_image", ""),
        "full_name": user.get("full_name", ""),
        "location": user.get("location", ""),
        "website": user.get("website", ""),
        "favorite_genres": user.get("favorite_genres", []),
        "reading_goal": user.get("reading_goal", ""),
        "followers_count": user.get("followers_count", 0),
        "following_count": user.get("following_count", 0),
    }


@router.post("/{target_user_id}/follow")
async def follow_user(
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if target_user_id == current_user["_id"]:
        return {"message": "You cannot follow yourself"}

    relation_id = f"{current_user['_id']}::{target_user_id}"
    already_following = await database.followers.find_one({"_id": relation_id})
    if already_following:
        return {"message": "Already following"}

    await database.followers.insert_one(
        {
            "_id": relation_id,
            "follower_id": current_user["_id"],
            "target_id": target_user_id,
        }
    )
    await database.users.update_one({"_id": current_user["_id"]}, {"$inc": {"following_count": 1}})
    await database.users.update_one({"_id": target_user_id}, {"$inc": {"followers_count": 1}})
    return {"message": "Followed successfully"}


@router.post("/{target_user_id}/unfollow")
async def unfollow_user(
    target_user_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    relation_id = f"{current_user['_id']}::{target_user_id}"
    relation = await database.followers.find_one({"_id": relation_id})
    if not relation:
        return {"message": "You are not following this user"}

    await database.followers.delete_one({"_id": relation_id})
    await database.users.update_one({"_id": current_user["_id"]}, {"$inc": {"following_count": -1}})
    await database.users.update_one({"_id": target_user_id}, {"$inc": {"followers_count": -1}})
    return {"message": "Unfollowed successfully"}
