from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.db.deps import get_current_user, get_database
from app.services.badges import calculate_user_badges

router = APIRouter(prefix="/reader", tags=["reader"])


class ReadingHistoryPayload(BaseModel):
    story_id: str
    chapter_id: str | None = None
    progress_pct: float = Field(ge=0, le=100, default=0)


@router.post("/bookmarks/{story_id}")
async def toggle_bookmark(
    story_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    bookmark_id = f"{current_user['_id']}::{story_id}"
    existing = await database.bookmarks.find_one({"_id": bookmark_id})

    if existing:
        await database.bookmarks.delete_one({"_id": bookmark_id})
        return {"message": "Bookmark removed"}

    await database.bookmarks.insert_one(
        {
            "_id": bookmark_id,
            "user_id": current_user["_id"],
            "story_id": story_id,
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"message": "Bookmarked"}


@router.get("/bookmarks")
async def list_bookmarks(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    cursor = database.bookmarks.find({"user_id": current_user["_id"]}).sort("created_at", -1)
    bookmarks = []
    async for bookmark in cursor:
        story = await database.stories.find_one({"_id": bookmark["story_id"]})
        if story:
            bookmarks.append(
                {
                    "story_id": story["_id"],
                    "title": story["title"],
                    "cover_image": story["cover_image"],
                    "bookmarked_at": bookmark["created_at"],
                }
            )
    return bookmarks


@router.post("/history")
async def add_reading_history(
    payload: ReadingHistoryPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    await database.reading_history.update_one(
        {"user_id": current_user["_id"], "story_id": payload.story_id},
        {
            "$set": {
                "chapter_id": payload.chapter_id,
                "progress_pct": payload.progress_pct,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "_id": f"{current_user['_id']}::{payload.story_id}",
                "user_id": current_user["_id"],
                "story_id": payload.story_id,
            },
        },
        upsert=True,
    )

    await calculate_user_badges(database, current_user)
    return {"message": "Reading history updated"}


@router.get("/history")
async def list_reading_history(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    cursor = database.reading_history.find({"user_id": current_user["_id"]}).sort("updated_at", -1).limit(100)
    history = []
    async for item in cursor:
        story = await database.stories.find_one({"_id": item["story_id"]})
        if story:
            history.append(
                {
                    "story_id": story["_id"],
                    "title": story["title"],
                    "cover_image": story["cover_image"],
                    "chapter_id": item.get("chapter_id"),
                    "progress_pct": item.get("progress_pct", 0),
                    "updated_at": item["updated_at"],
                }
            )
    return history


@router.get("/badges")
async def get_my_badges(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    return await calculate_user_badges(database, current_user)
