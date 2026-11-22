from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.cache import cache
from app.core.config import get_settings
from app.db.deps import get_current_user, get_database, get_optional_database
from app.db.seed import get_seed_story_chapters, get_seed_story_detail, get_seed_story_list
from app.schemas.story import ChapterCreate, ChapterUpdate, StoryCreate, StoryUpdate

router = APIRouter(prefix="/stories", tags=["stories"])


async def _resolve_optional_user(request: Request, database: AsyncIOMotorDatabase) -> dict | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None
    return await database.users.find_one({"_id": user_id})


def _can_manage_story(user: dict | None, story: dict) -> bool:
    if not user:
        return False
    return story.get("author_id") == user.get("_id")


def _compute_engagement_rating(*, likes: int, views: int, comments: int) -> float:
    # Rating is derived from real engagement signals and bounded to a familiar 3.0-5.0 range.
    safe_views = max(1, int(views or 0))
    like_ratio = min(1.0, float(likes or 0) / safe_views)
    comment_ratio = min(1.0, float(comments or 0) / safe_views)
    score = 3.0 + (like_ratio * 1.4) + (comment_ratio * 0.6)
    return round(min(5.0, max(3.0, score)), 1)


@router.post("")
async def create_story(
    payload: StoryCreate,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story_id = str(uuid4())
    status_value = "draft" if payload.is_draft else "published"
    doc = {
        "_id": story_id,
        "author_id": current_user["_id"],
        "title": payload.title,
        "description": payload.description,
        "cover_image": payload.cover_image,
        "tags": payload.tags,
        "categories": payload.categories,
        "status": status_value,
        "is_premium": bool(payload.is_premium),
        "premium_price": payload.premium_price,
        "likes": 0,
        "views": 0,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await database.stories.insert_one(doc)
    cache.invalidate_prefix("discovery:")
    return {"message": "Story created", "story_id": story_id}


@router.get("")
async def list_stories(
    limit: int = Query(default=30, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    sort_by: str = Query(default="created_at"),
    genre: str | None = None,
    q: str | None = None,
    database: AsyncIOMotorDatabase | None = Depends(get_optional_database),
) -> dict:
    if database is None:
        stories = get_seed_story_list(limit=limit, skip=skip, sort_by=sort_by, genre=genre, q=q)
        return {"stories": stories, "total": len(stories), "fallback": True}

    query: dict = {"status": "published"}
    if genre:
        query["categories"] = {"$regex": genre, "$options": "i"}
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
            {"categories": {"$regex": q, "$options": "i"}},
        ]

    sort_map = {
        "views": [("views", -1), ("likes", -1), ("created_at", -1)],
        "popular": [("likes", -1), ("views", -1), ("created_at", -1)],
        "rating": [("likes", -1), ("views", -1), ("created_at", -1)],
        "new": [("created_at", -1)],
        "created_at": [("created_at", -1)],
    }
    cursor = database.stories.find(query).sort(sort_map.get(sort_by, sort_map["created_at"])).skip(skip).limit(limit)
    stories: list[dict] = []
    async for story in cursor:
        author_name = "Unknown Author"
        author_id = story.get("author_id")
        author_geeks = 0
        if author_id:
            author = await database.users.find_one(
                {"_id": author_id},
                {"username": 1, "full_name": 1, "followers_count": 1},
            )
            if author:
                author_name = str(author.get("full_name") or author.get("username") or author_name)
                author_geeks = int(author.get("followers_count", 0) or 0)

        comments_count = await database.comments.count_documents(
            {"story_id": story["_id"], "status": {"$ne": "hidden"}}
        )
        likes_count = int(story.get("likes", 0) or 0)
        views_count = int(story.get("views", 0) or 0)
        avg_rating = _compute_engagement_rating(
            likes=likes_count,
            views=views_count,
            comments=int(comments_count or 0),
        )

        parts_count = await database.chapters.count_documents({"story_id": story["_id"]})
        stories.append(
            {
                "id": story["_id"],
                "_id": story["_id"],
                "title": story["title"],
                "description": story["description"],
                "cover_image": story["cover_image"],
                "likes": likes_count,
                "views": views_count,
                "votes": likes_count,
                "reads": views_count,
                "avg_rating": avg_rating,
                "rating": avg_rating,
                "comments_count": int(comments_count or 0),
                "parts_count": int(parts_count or 0),
                "genre": (story.get("categories") or ["Fiction"])[0],
                "author_id": author_id,
                "author_name": author_name,
                "publisher": author_name,
                "author_geeks": author_geeks,
                "tags": story.get("tags", []),
                "categories": story.get("categories", []),
                "status": story.get("status", "published"),
                "is_premium": story.get("is_premium", False),
                "premium_price": story.get("premium_price"),
            }
        )
    return {"stories": stories, "total": len(stories)}


@router.get("/mine")
async def list_my_stories(
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> list[dict]:
    cursor = database.stories.find({"author_id": current_user["_id"]}).sort("updated_at", -1)
    stories: list[dict] = []
    async for story in cursor:
        stories.append(
            {
                "id": story["_id"],
                "title": story["title"],
                "description": story["description"],
                "cover_image": story["cover_image"],
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "tags": story.get("tags", []),
                "categories": story.get("categories", []),
                "status": story.get("status", "published"),
                "is_premium": story.get("is_premium", False),
                "premium_price": story.get("premium_price"),
            }
        )
    return stories


@router.get("/{story_id}/chapters")
async def list_story_chapters(story_id: str, database: AsyncIOMotorDatabase | None = Depends(get_optional_database)) -> dict:
    if database is None:
        chapter_payload = get_seed_story_chapters(story_id)
        if not chapter_payload["chapters"]:
            raise HTTPException(status_code=404, detail="Story not found")
        return chapter_payload

    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    chapters_cursor = database.chapters.find({"story_id": story_id}).sort("chapter_number", 1)
    chapters: list[dict] = []
    async for chapter in chapters_cursor:
        chapters.append(
            {
                "id": chapter["_id"],
                "_id": chapter["_id"],
                "title": chapter["title"],
                "content": chapter["content"],
                "chapter_number": chapter["chapter_number"],
                "word_count": len((chapter.get("content") or "").split()),
            }
        )

    if not chapters:
        description = str(story.get("description") or "").strip()
        auto_content = (
            f"<h2>Chapter 1</h2><p>{description}</p>"
            if description
            else "<h2>Chapter 1</h2><p>This story is now live. The first chapter is being prepared by the author.</p>"
        )
        auto_chapter_id = f"auto-{story_id}-chapter-1"
        await database.chapters.update_one(
            {"_id": auto_chapter_id},
            {
                "$set": {
                    "story_id": story_id,
                    "title": "Chapter 1",
                    "content": auto_content,
                    "chapter_number": 1,
                }
            },
            upsert=True,
        )
        chapters = [
            {
                "id": auto_chapter_id,
                "_id": auto_chapter_id,
                "title": "Chapter 1",
                "content": auto_content,
                "chapter_number": 1,
                "word_count": len(auto_content.split()),
            }
        ]

    return {"chapters": chapters}


@router.post("/upload-cover")
async def upload_cover_image(
    image: UploadFile = File(...),
    _: dict = Depends(get_current_user),
) -> dict:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    ext = Path(image.filename or "cover.jpg").suffix or ".jpg"
    file_name = f"{uuid4()}{ext}"

    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / file_name

    data = await image.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be <= 5MB")

    file_path.write_bytes(data)
    base_url = settings.public_backend_base_url.rstrip("/")
    return {"message": "Upload successful", "url": f"{base_url}/uploads/{file_name}"}


@router.get("/{story_id}")
async def get_story(
    story_id: str,
    request: Request,
    database: AsyncIOMotorDatabase | None = Depends(get_optional_database),
) -> dict:
    if database is None:
        story = get_seed_story_detail(story_id)
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        return story

    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    current_user = await _resolve_optional_user(request, database)
    if story.get("status") != "published" and not _can_manage_story(current_user, story):
        raise HTTPException(status_code=404, detail="Story not found")

    now = datetime.now(timezone.utc)
    client_ip = request.client.host if request.client else "unknown"
    user_agent = (request.headers.get("user-agent") or "unknown").strip()[:200]
    viewer_fingerprint = f"{client_ip}|{user_agent}"

    existing_recent_view = await database.views.find_one(
        {
            "story_id": story_id,
            "viewer_fingerprint": viewer_fingerprint,
            "viewed_at": {"$gte": now - timedelta(hours=24)},
        },
        {"_id": 1},
    )

    did_increment_view = existing_recent_view is None
    if did_increment_view:
        country_code = (
            request.headers.get("x-vercel-ip-country")
            or request.headers.get("cf-ipcountry")
            or ""
        ).strip().upper()
        await database.stories.update_one({"_id": story_id}, {"$inc": {"views": 1}})
        await database.views.insert_one(
            {
                "_id": str(uuid4()),
                "story_id": story_id,
                "viewer_fingerprint": viewer_fingerprint,
                "client_ip": client_ip,
                "user_agent": user_agent,
                "country_code": country_code,
                "viewed_at": now,
            }
        )

    chapters_cursor = database.chapters.find({"story_id": story_id}).sort("chapter_number", 1)
    chapters: list[dict] = []
    total_words = 0
    async for chapter in chapters_cursor:
        word_count = len((chapter.get("content") or "").split())
        total_words += word_count
        chapters.append(
            {
                "id": chapter["_id"],
                "title": chapter["title"],
                "content": chapter["content"],
                "chapter_number": chapter["chapter_number"],
                "word_count": word_count,
            }
        )

    author = await database.users.find_one(
        {"_id": story.get("author_id")},
        {"username": 1, "full_name": 1, "bio": 1, "followers_count": 1, "profile_image": 1},
    )
    author_name = "Unknown Author"
    author_bio = ""
    author_geeks = 0
    author_story_count = 0
    author_total_reads = 0
    if author:
        author_name = str(author.get("full_name") or author.get("username") or author_name)
        author_bio = str(author.get("bio") or "")
        author_geeks = int(author.get("followers_count", 0) or 0)
        author_story_count = await database.stories.count_documents(
            {"author_id": story.get("author_id"), "status": "published"}
        )
        author_reads_row = await database.stories.aggregate(
            [
                {"$match": {"author_id": story.get("author_id"), "status": "published"}},
                {"$group": {"_id": None, "total": {"$sum": "$views"}}},
            ]
        ).to_list(length=1)
        if author_reads_row:
            author_total_reads = int(author_reads_row[0].get("total", 0) or 0)

    comments_count = await database.comments.count_documents(
        {"story_id": story_id, "status": {"$ne": "hidden"}}
    )
    likes_count = int(story.get("likes", 0) or 0)
    current_views = int(story.get("views", 0) or 0) + (1 if did_increment_view else 0)
    avg_rating = _compute_engagement_rating(
        likes=likes_count,
        views=current_views,
        comments=int(comments_count or 0),
    )
    estimated_minutes = max(1, round((total_words or 1) / 200))

    user_has_geeked = False
    if current_user and story.get("author_id") and current_user.get("_id") != story.get("author_id"):
        relation = await database.followers.find_one(
            {"_id": f"{current_user['_id']}::{story.get('author_id')}"},
            {"_id": 1},
        )
        user_has_geeked = bool(relation)

    return {
        "id": story["_id"],
        "author_id": story["author_id"],
        "author_name": author_name,
        "title": story["title"],
        "description": story["description"],
        "cover_image": story["cover_image"],
        "likes": likes_count,
        "votes": likes_count,
        "views": current_views,
        "reads": current_views,
        "comments_count": int(comments_count or 0),
        "parts_count": len(chapters),
        "total_word_count": int(total_words or 0),
        "estimated_read_minutes": int(estimated_minutes),
        "avg_rating": avg_rating,
        "rating": avg_rating,
        "tags": story.get("tags", []),
        "categories": story.get("categories", []),
        "status": story.get("status", "published"),
        "is_premium": story.get("is_premium", False),
        "premium_price": story.get("premium_price"),
        "author": {
            "id": story.get("author_id"),
            "name": author_name,
            "bio": author_bio,
            "geeks": author_geeks,
            "story_count": int(author_story_count or 0),
            "total_reads": int(author_total_reads or 0),
            "profile_image": (author or {}).get("profile_image", "") if author else "",
            "is_geeked": user_has_geeked,
        },
        "chapters": chapters,
    }


@router.post("/{story_id}/chapters")
async def create_chapter(
    story_id: str,
    payload: ChapterCreate,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    if payload.story_id and payload.story_id != story_id:
        raise HTTPException(status_code=400, detail="story_id in body must match story_id path")

    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if not _can_manage_story(current_user, story):
        raise HTTPException(status_code=403, detail="Only story owner can add chapter")

    chapter_count = await database.chapters.count_documents({"story_id": story_id})
    chapter_id = str(uuid4())
    chapter_doc = {
        "_id": chapter_id,
        "story_id": story_id,
        "title": payload.title,
        "content": payload.content,
        "chapter_number": chapter_count + 1,
    }
    await database.chapters.insert_one(chapter_doc)
    await database.stories.update_one({"_id": story_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}})
    cache.invalidate_prefix("discovery:")
    return {"message": "Chapter created", "chapter_id": chapter_id}


@router.patch("/{story_id}")
async def update_story(
    story_id: str,
    payload: StoryUpdate,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if not _can_manage_story(current_user, story):
        raise HTTPException(status_code=403, detail="Only story owner can edit story")

    updates = {key: value for key, value in payload.model_dump(exclude_none=True).items()}
    if "is_draft" in updates:
        updates["status"] = "draft" if updates.pop("is_draft") else "published"
    if not updates:
        return {"message": "No changes submitted"}

    updates["updated_at"] = datetime.now(timezone.utc)
    await database.stories.update_one({"_id": story_id}, {"$set": updates})
    cache.invalidate_prefix("discovery:")
    return {"message": "Story updated"}


@router.delete("/{story_id}")
async def delete_story_by_author(
    story_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if not _can_manage_story(current_user, story):
        raise HTTPException(status_code=403, detail="Only story owner can delete story")

    await database.stories.delete_one({"_id": story_id})
    await database.chapters.delete_many({"story_id": story_id})
    await database.comments.delete_many({"story_id": story_id})
    await database.likes.delete_many({"story_id": story_id})
    await database.bookmarks.delete_many({"story_id": story_id})
    await database.reading_history.delete_many({"story_id": story_id})
    cache.invalidate_prefix("discovery:")
    return {"message": "Story deleted"}


@router.patch("/{story_id}/chapters/{chapter_id}")
async def update_chapter(
    story_id: str,
    chapter_id: str,
    payload: ChapterUpdate,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if not _can_manage_story(current_user, story):
        raise HTTPException(status_code=403, detail="Only story owner can edit chapter")

    chapter = await database.chapters.find_one({"_id": chapter_id, "story_id": story_id})
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")

    updates = {key: value for key, value in payload.model_dump(exclude_none=True).items()}
    if not updates:
        return {"message": "No changes submitted"}

    await database.chapters.update_one({"_id": chapter_id}, {"$set": updates})
    await database.stories.update_one({"_id": story_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}})
    return {"message": "Chapter updated"}


@router.delete("/{story_id}/chapters/{chapter_id}")
async def delete_chapter(
    story_id: str,
    chapter_id: str,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one({"_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    if not _can_manage_story(current_user, story):
        raise HTTPException(status_code=403, detail="Only story owner can delete chapter")

    result = await database.chapters.delete_one({"_id": chapter_id, "story_id": story_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chapter not found")

    await database.stories.update_one({"_id": story_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}})
    return {"message": "Chapter deleted"}
