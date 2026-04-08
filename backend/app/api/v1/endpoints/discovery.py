from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.cache import cache
from app.core.config import get_settings
from app.db import deps
from app.db.seed import get_seed_categories, get_seed_story_list
from app.services.recommendations import RecommendationEngine

router = APIRouter(prefix="/discovery", tags=["discovery"])


def _default_site_settings() -> dict:
    return {
        "site_name": "Bixbi",
        "logo_url": "",
        "dark_logo_url": "",
        "light_logo_url": "",
        "splash_image_url": "",
        "contact_email": "support@bixbi.app",
        "copyright_text": f"Copyright {datetime.now().year} Bixbi. All rights reserved.",
        "primary_color": "#1278ff",
        "secondary_color": "#35a0ff",
        "login_config": {
            "email_enabled": True,
            "mobile_otp_enabled": True,
            "facebook_enabled": False,
            "google_enabled": True,
            "apple_enabled": False,
        },
    }


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


async def _story_payload(story: dict, database: AsyncIOMotorDatabase | None = None) -> dict:
    author_name = "Unknown Author"
    author_id = story.get("author_id")
    if database is not None and author_id:
        author = await database.users.find_one({"_id": author_id}, {"username": 1, "full_name": 1})
        if author:
            author_name = str(author.get("full_name") or author.get("username") or author_name)

    categories = story.get("categories", []) or []
    primary_category = categories[0] if categories else "Fiction"
    return {
        "id": story["_id"],
        "title": story["title"],
        "cover_image": story.get("cover_image", ""),
        "description": story.get("description", ""),
        "likes": story.get("likes", 0),
        "views": story.get("views", 0),
        "categories": categories,
        "category": primary_category,
        "genre": primary_category,
        "author_id": author_id,
        "author_name": author_name,
        "publisher": author_name,
        "is_premium": story.get("is_premium", False),
        "premium_price": story.get("premium_price"),
    }


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
        items.append(await _story_payload(story, database))
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
        items.append(await _story_payload(story, database))
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
                "is_premium": story.get("is_premium", False),
                "premium_price": story.get("premium_price"),
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
        results.append(await _story_payload(story, database))
    return results


@router.get("/recommendations")
async def personalized_recommendations(
    request: Request,
    limit: int = Query(default=14, ge=4, le=40),
    database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database),
) -> dict:
    if database is None:
        return {
            "title": "Recommended for you",
            "reason": "Trending stories",
            "location_hint": "",
            "stories": get_seed_story_list(limit=limit, sort_by="popular"),
        }

    user = await _resolve_optional_user(request, database)
    title = "Recommended for you"
    reason = "Based on what readers love"
    location_hint = ""
    
    request_country_code = (
        request.headers.get("x-vercel-ip-country")
        or request.headers.get("cf-ipcountry")
        or ""
    ).strip().upper()

    # Try cache first
    cache_key = f"recommendations:{user.get('_id') if user else 'anonymous'}:{request_country_code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    engine = RecommendationEngine(database)
    stories: list[dict] = []

    if user:
        # Use new recommendation engine with scoring logic
        recommended = await engine.get_recommendations_for_user(user["_id"], limit=limit)
        stories = [await _story_payload(story, database) for story in recommended]
        reason = "Based on your reading history & preferences"
        
        country = str(user.get("country") or "").strip()
        country_code = str(user.get("country_code") or "").strip().upper()
        if country:
            location_hint = country
        if country_code == "LK" or "sri lanka" in country.lower():
            reason = "Popular in Sri Lanka, tailored for you"

    elif request_country_code:
        # Trending stories as fallback
        trending = await engine.get_trending_stories(limit=limit)
        stories = [await _story_payload(story, database) for story in trending]
        reason = f"Trending near you ({request_country_code})"
        location_hint = request_country_code
    else:
        # Generic trending
        trending = await engine.get_trending_stories(limit=limit)
        stories = [await _story_payload(story, database) for story in trending]

    result = {
        "title": title,
        "reason": reason,
        "location_hint": location_hint,
        "stories": stories,
    }
    
    # Cache for 20 minutes (1200 seconds)
    cache.set(cache_key, result, 1200)
    return result


@router.get("/site-settings")
async def get_site_settings(database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database)) -> dict:
    if database is None:
        return _default_site_settings()

    settings_doc = await database.site_settings.find_one({"_id": "default"})
    if not settings_doc:
        return _default_site_settings()

    defaults = _default_site_settings()
    merged = {**defaults, **settings_doc}
    merged["login_config"] = {**defaults["login_config"], **(settings_doc.get("login_config") or {})}
    return {
        "site_name": merged.get("site_name") or defaults["site_name"],
        "logo_url": merged.get("logo_url") or merged.get("light_logo_url") or "",
        "dark_logo_url": merged.get("dark_logo_url") or "",
        "light_logo_url": merged.get("light_logo_url") or "",
        "splash_image_url": merged.get("splash_image_url") or "",
        "contact_email": merged.get("contact_email") or defaults["contact_email"],
        "copyright_text": merged.get("copyright_text") or defaults["copyright_text"],
        "primary_color": merged.get("primary_color") or defaults["primary_color"],
        "secondary_color": merged.get("secondary_color") or defaults["secondary_color"],
        "login_config": merged["login_config"],
    }


@router.get("/cms-pages/{slug}")
async def get_cms_page(slug: str, database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database)) -> dict:
    if database is None:
        raise HTTPException(status_code=404, detail="Page not found")

    page = await database.cms_pages.find_one({"slug": slug, "is_published": True})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")

    return {
        "slug": page.get("slug"),
        "title": page.get("title", "Untitled"),
        "excerpt": page.get("excerpt", ""),
        "content": page.get("content", ""),
        "updated_at": page.get("updated_at"),
    }


@router.get("/authors")
async def list_authors(
    limit: int = Query(default=30, ge=1, le=100),
    database: AsyncIOMotorDatabase | None = Depends(deps.get_optional_database),
) -> list[dict]:
    """Return a list of authors who have published stories."""
    if database is None:
        return [
            {"id": "mock-1", "username": "Elena Rose", "bio": "Fantasy & Romance author", "story_count": 5, "total_likes": 1240, "profile_image": ""},
            {"id": "mock-2", "username": "Marcus Stone", "bio": "Sci-Fi thriller writer", "story_count": 3, "total_likes": 890, "profile_image": ""},
            {"id": "mock-3", "username": "Aurora Sky", "bio": "Literary fiction & poetry", "story_count": 7, "total_likes": 2100, "profile_image": ""},
            {"id": "mock-4", "username": "Blake Morgan", "bio": "Mystery & Horror", "story_count": 4, "total_likes": 760, "profile_image": ""},
            {"id": "mock-5", "username": "Dr. Kepler", "bio": "Hard sci-fi & speculative fiction", "story_count": 6, "total_likes": 1580, "profile_image": ""},
            {"id": "mock-6", "username": "James Chen", "bio": "Wuxia & Fantasy", "story_count": 2, "total_likes": 430, "profile_image": ""},
        ]

    pipeline = [
        {"$match": {"status": "published"}},
        {"$group": {
            "_id": "$author_id",
            "story_count": {"$sum": 1},
            "total_likes": {"$sum": "$likes"},
            "total_views": {"$sum": "$views"},
            "categories": {"$push": "$categories"},
        }},
        {"$sort": {"total_likes": -1}},
        {"$limit": limit},
    ]

    author_stats: dict = {}
    async for item in database.stories.aggregate(pipeline):
        if item["_id"]:
            author_stats[item["_id"]] = {
                "story_count": item["story_count"],
                "total_likes": item["total_likes"],
                "total_views": item.get("total_views", 0),
            }

    if not author_stats:
        return []

    authors: list[dict] = []
    async for user in database.users.find({"_id": {"$in": list(author_stats.keys())}}).limit(limit):
        uid = user["_id"]
        stats = author_stats.get(uid, {})
        authors.append({
            "id": uid,
            "username": user.get("username", "Unknown"),
            "full_name": user.get("full_name", ""),
            "bio": user.get("bio", ""),
            "profile_image": user.get("profile_image", ""),
            "story_count": stats.get("story_count", 0),
            "total_likes": stats.get("total_likes", 0),
            "total_views": stats.get("total_views", 0),
        })

    # Sort by total_likes descending
    authors.sort(key=lambda a: a["total_likes"], reverse=True)
    return authors
