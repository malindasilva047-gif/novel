from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.cache import cache
from app.core.config import get_settings
from app.db.deps import get_current_user, get_database, get_optional_database
from app.db.seed import get_seed_story_chapters, get_seed_story_detail, get_seed_story_list
from app.schemas.story import ChapterCreate, ChapterUpdate, StoryCreate, StoryUpdate

router = APIRouter(prefix="/stories", tags=["stories"])


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
        stories.append(
            {
                "id": story["_id"],
                "_id": story["_id"],
                "title": story["title"],
                "description": story["description"],
                "cover_image": story["cover_image"],
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "avg_rating": 4.6,
                "genre": (story.get("categories") or ["Fiction"])[0],
                "tags": story.get("tags", []),
                "categories": story.get("categories", []),
                "status": story.get("status", "published"),
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
async def get_story(story_id: str, database: AsyncIOMotorDatabase | None = Depends(get_optional_database)) -> dict:
    if database is None:
        story = get_seed_story_detail(story_id)
        if not story:
            raise HTTPException(status_code=404, detail="Story not found")
        return story

    story = await database.stories.find_one({"_id": story_id, "status": "published"})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    await database.stories.update_one({"_id": story_id}, {"$inc": {"views": 1}})
    await database.views.insert_one(
        {
            "_id": str(uuid4()),
            "story_id": story_id,
            "viewed_at": datetime.now(timezone.utc),
        }
    )

    chapters_cursor = database.chapters.find({"story_id": story_id}).sort("chapter_number", 1)
    chapters: list[dict] = []
    async for chapter in chapters_cursor:
        chapters.append(
            {
                "id": chapter["_id"],
                "title": chapter["title"],
                "content": chapter["content"],
                "chapter_number": chapter["chapter_number"],
            }
        )

    return {
        "id": story["_id"],
        "author_id": story["author_id"],
        "title": story["title"],
        "description": story["description"],
        "cover_image": story["cover_image"],
        "likes": story.get("likes", 0),
        "views": story.get("views", 0) + 1,
        "tags": story.get("tags", []),
        "categories": story.get("categories", []),
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
    if story["author_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only author can add chapter")

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
    if story["author_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only author can edit story")

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
    if story["author_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only author can delete story")

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
    if story["author_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only author can edit chapter")

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
    if story["author_id"] != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Only author can delete chapter")

    result = await database.chapters.delete_one({"_id": chapter_id, "story_id": story_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chapter not found")

    await database.stories.update_one({"_id": story_id}, {"$set": {"updated_at": datetime.now(timezone.utc)}})
    return {"message": "Chapter deleted"}
