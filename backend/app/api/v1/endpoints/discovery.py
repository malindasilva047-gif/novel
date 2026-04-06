from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.cache import cache
from app.core.config import get_settings
from app.db import deps
from app.db.seed import get_seed_categories, get_seed_story_list

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/feed")
async def home_feed(database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database)) -> list[dict]:
    settings = get_settings()
    cached = cache.get("discovery:feed")
    if cached is not None:
        return cached

    if database is None:
        items = get_seed_story_list(limit=12, sort_by="new")
        cache.set("discovery:feed", items, settings.discovery_cache_ttl_seconds)
        return items

    cursor = database.stories.find({"status": "published"}).sort("created_at", -1).limit(12)
    items: list[dict] = []
    async for story in cursor:
        items.append(
            {
                "id": story["_id"],
                "title": story["title"],
                "cover_image": story["cover_image"],
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "categories": story.get("categories", []),
            }
        )
    cache.set("discovery:feed", items, settings.discovery_cache_ttl_seconds)
    return items


@router.get("/trending")
async def trending_stories(database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database)) -> list[dict]:
    settings = get_settings()
    cached = cache.get("discovery:trending")
    if cached is not None:
        return cached

    if database is None:
        items = get_seed_story_list(limit=12, sort_by="popular")
        cache.set("discovery:trending", items, settings.discovery_cache_ttl_seconds)
        return items

    cursor = database.stories.find({"status": "published"}).sort([("likes", -1), ("views", -1)]).limit(12)
    items: list[dict] = []
    async for story in cursor:
        items.append(
            {
                "id": story["_id"],
                "title": story["title"],
                "cover_image": story["cover_image"],
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "categories": story.get("categories", []),
            }
        )
    cache.set("discovery:trending", items, settings.discovery_cache_ttl_seconds)
    return items


@router.get("/search")
async def search_stories(
    q: str = Query(min_length=1),
    category: str | None = None,
    database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database),
) -> list[dict]:
    if database is None:
        return get_seed_story_list(limit=20, genre=category, q=q)

    query: dict = {"title": {"$regex": q, "$options": "i"}, "status": "published"}
    if category:
        query["categories"] = category

    cursor = database.stories.find(query).limit(20)
    results: list[dict] = []
    async for story in cursor:
        results.append(
            {
                "id": story["_id"],
                "title": story["title"],
                "cover_image": story["cover_image"],
                "description": story["description"],
                "categories": story.get("categories", []),
            }
        )
    return results


@router.get("/categories")
async def list_categories(database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database)) -> list[dict]:
    if database is None:
        return get_seed_categories()

    pipeline = [
        {"$match": {"status": "published"}},
        {"$unwind": "$categories"},
        {"$group": {"_id": "$categories", "count": {"$sum": 1}}},
        {"$sort": {"count": -1, "_id": 1}},
    ]
    categories = await database.stories.aggregate(pipeline).to_list(length=100)
    return [{"name": item["_id"], "count": item["count"]} for item in categories if item.get("_id")]


@router.get("/popular")
async def popular_stories(
    category: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database),
) -> list[dict]:
    if database is None:
        return get_seed_story_list(limit=limit, genre=category, sort_by="popular")

    query: dict = {"status": "published"}
    if category:
        query["categories"] = category

    cursor = database.stories.find(query).sort([("likes", -1), ("views", -1), ("created_at", -1)]).limit(limit)
    results: list[dict] = []
    async for story in cursor:
        results.append(
            {
                "id": story["_id"],
                "title": story["title"],
                "cover_image": story["cover_image"],
                "description": story.get("description", ""),
                "likes": story.get("likes", 0),
                "views": story.get("views", 0),
                "categories": story.get("categories", []),
            }
        )
    return results
