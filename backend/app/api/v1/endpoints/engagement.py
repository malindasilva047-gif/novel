from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.cache import cache
from app.db.deps import get_current_user, get_database

router = APIRouter(prefix="/engagement", tags=["engagement"])


class CommentPayload(BaseModel):
    content: str = Field(min_length=2, max_length=1000)
    rating: int | None = Field(default=None, ge=1, le=5)


class ReportPayload(BaseModel):
    story_id: str
    reason: str = Field(min_length=3, max_length=300)


@router.post("/stories/{story_id}/like")
async def toggle_like(
    story_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one({"_id": story_id}, {"_id": 1})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    like_id = f"{current_user['_id']}::{story_id}"
    existing = await database.likes.find_one({"_id": like_id})

    if existing:
        await database.likes.delete_one({"_id": like_id})
        await database.stories.update_one({"_id": story_id}, {"$inc": {"likes": -1}})
        cache.invalidate_prefix("discovery:")
        return {"message": "Like removed"}

    await database.likes.insert_one({"_id": like_id, "user_id": current_user["_id"], "story_id": story_id})
    await database.stories.update_one({"_id": story_id}, {"$inc": {"likes": 1}})
    cache.invalidate_prefix("discovery:")
    return {"message": "Story liked"}


@router.post("/stories/{story_id}/comments")
async def add_comment(
    story_id: str,
    payload: CommentPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    latest_comment = await database.comments.find_one(
        {"story_id": story_id, "user_id": current_user["_id"]},
        sort=[("created_at", -1)],
    )
    if latest_comment and latest_comment.get("content", "").strip().lower() == payload.content.strip().lower():
        raise HTTPException(status_code=429, detail="Duplicate comment detected. Please wait before posting again.")

    comment_id = str(uuid4())
    await database.comments.insert_one(
        {
            "_id": comment_id,
            "story_id": story_id,
            "user_id": current_user["_id"],
            "content": payload.content,
            "rating": payload.rating,
            "status": "visible",
            "created_at": datetime.now(timezone.utc),
        }
    )

    story = await database.stories.find_one({"_id": story_id}, {"author_id": 1})
    story_author_id = story.get("author_id") if story else None
    if story_author_id and story_author_id != current_user["_id"]:
        await database.notifications.insert_one(
            {
                "_id": str(uuid4()),
                "user_id": story_author_id,
                "actor_user_id": current_user["_id"],
                "story_id": story_id,
                "type": "comment",
                "message": f"{current_user.get('username', 'Someone')} commented on your story.",
                "is_read": False,
                "created_at": datetime.now(timezone.utc),
            }
        )
    return {"message": "Comment added", "comment_id": comment_id}


@router.get("/stories/{story_id}/comments")
async def get_comments(story_id: str, database: AsyncIOMotorDatabase = Depends(get_database)) -> list[dict]:
    cursor = database.comments.find({"story_id": story_id, "status": {"$ne": "hidden"}}).sort("created_at", -1).limit(100)
    comments: list[dict] = []
    async for comment in cursor:
        comments.append(
            {
                "id": comment["_id"],
                "story_id": comment["story_id"],
                "user_id": comment["user_id"],
                "content": comment["content"],
                "rating": comment.get("rating"),
                "created_at": comment["created_at"],
            }
        )
    return comments


@router.post("/reports")
async def report_story(
    payload: ReportPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    report_id = f"{current_user['_id']}::{payload.story_id}"
    await database.reports.update_one(
        {"_id": report_id},
        {
            "$set": {
                "user_id": current_user["_id"],
                "story_id": payload.story_id,
                "report_kind": "post",
                "reported_entity_type": "story",
                "reason": payload.reason.strip(),
                "status": "open",
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {
                "created_at": datetime.now(timezone.utc),
            },
        },
        upsert=True,
    )
    return {"message": "Report submitted"}
