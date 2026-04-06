from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.cache import cache
from app.db.deps import get_current_user, get_database

router = APIRouter(prefix="/admin", tags=["admin"])


class StoryStatusPayload(BaseModel):
    status: str


class StoryCoverPayload(BaseModel):
    cover_image: str


class BulkCommentActionPayload(BaseModel):
    comment_ids: list[str] = Field(min_length=1)
    action: str


def ensure_admin(user: dict) -> None:
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/analytics")
async def analytics(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    ensure_admin(current_user)

    users = await database.users.count_documents({})
    stories = await database.stories.count_documents({})
    comments = await database.comments.count_documents({})
    likes = await database.likes.count_documents({})
    reports_open = await database.reports.count_documents({"status": "open"})
    banned_users = await database.users.count_documents({"is_banned": True})
    hidden_comments = await database.comments.count_documents({"status": "hidden"})
    badges_earned = await database.badges.count_documents({})

    return {
        "total_users": users,
        "total_stories": stories,
        "total_comments": comments,
        "total_likes": likes,
        "open_reports": reports_open,
        "banned_users": banned_users,
        "hidden_comments": hidden_comments,
        "badges_earned": badges_earned,
    }


@router.get("/users")
async def list_users(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    ensure_admin(current_user)

    cursor = database.users.find({}).sort("followers_count", -1).limit(200)
    users: list[dict] = []
    async for user in cursor:
        users.append(
            {
                "id": user["_id"],
                "username": user.get("username", ""),
                "email": user.get("email", ""),
                "is_admin": user.get("is_admin", False),
                "is_banned": user.get("is_banned", False),
                "is_email_verified": user.get("is_email_verified", False),
                "followers_count": user.get("followers_count", 0),
            }
        )
    return users


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
                "id": report["_id"],
                "story_id": report["story_id"],
                "user_id": report["user_id"],
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

    users = await database.users.find({}, {"_id": 1, "username": 1}).to_list(length=2000)
    user_lookup = {user["_id"]: user.get("username", "") for user in users}

    cursor = database.stories.find({}).sort("updated_at", -1).limit(300)
    stories: list[dict] = []
    async for story in cursor:
        stories.append(
            {
                "id": story["_id"],
                "title": story.get("title", ""),
                "author_id": story.get("author_id", ""),
                "author_username": user_lookup.get(story.get("author_id", ""), "Unknown"),
                "status": story.get("status", "published"),
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "updated_at": story.get("updated_at"),
            }
        )
    return stories


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
