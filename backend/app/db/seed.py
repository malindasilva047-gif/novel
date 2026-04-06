from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.security import hash_password

DUMMY_STORIES: list[dict] = [
    {
        "_id": "demo-story-neon-monsoon",
        "title": "Neon Monsoon City",
        "description": "A runaway coder uncovers a weather AI conspiracy in a rain-soaked megacity.",
        "cover_image": "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1300&q=80",
        "tags": ["cyberpunk", "thriller"],
        "categories": ["Sci-Fi", "Thriller"],
        "likes": 340,
        "views": 1800,
        "chapter_title": "Chapter 1: Streetlight Ghost",
    },
    {
        "_id": "demo-story-coral-kingdom",
        "title": "Coral Kingdom Archive",
        "description": "A diver discovers an underwater library that stores forgotten human memories.",
        "cover_image": "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1300&q=80",
        "tags": ["adventure", "mystery"],
        "categories": ["Adventure", "Fantasy"],
        "likes": 412,
        "views": 2104,
        "chapter_title": "Chapter 1: Breath of Salt",
    },
    {
        "_id": "demo-story-midnight-library",
        "title": "Midnight Library of Dust",
        "description": "A historian enters a cursed archive where every page rewrites the reader's past.",
        "cover_image": "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1300&q=80",
        "tags": ["dark", "mystery"],
        "categories": ["Mystery", "Drama"],
        "likes": 278,
        "views": 1475,
        "chapter_title": "Chapter 1: The Silent Shelf",
    },
    {
        "_id": "demo-story-sky-garden",
        "title": "The Last Sky Garden",
        "description": "In a smog-choked world, one rooftop garden could restart the planet's ecosystem.",
        "cover_image": "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1300&q=80",
        "tags": ["eco", "hope"],
        "categories": ["Sci-Fi", "Drama"],
        "likes": 501,
        "views": 3008,
        "chapter_title": "Chapter 1: Seeds Above Asphalt",
    },
    {
        "_id": "demo-story-clockwork-heart",
        "title": "Clockwork Heartline",
        "description": "A watchmaker and a rebel courier race against time to stop a mechanized coup.",
        "cover_image": "https://images.unsplash.com/photo-1473186578172-c141e6798cf4?auto=format&fit=crop&w=1300&q=80",
        "tags": ["steampunk", "action"],
        "categories": ["Fantasy", "Action"],
        "likes": 389,
        "views": 1920,
        "chapter_title": "Chapter 1: Springs and Sparks",
    },
]


def _seed_story_payload(story: dict) -> dict:
    primary_category = (story.get("categories") or ["Fiction"])[0]
    return {
        "id": story["_id"],
        "_id": story["_id"],
        "author_id": "admin-user",
        "author_name": "Bixbi Archive",
        "title": story["title"],
        "description": story["description"],
        "cover_image": story["cover_image"],
        "likes": story.get("likes", 0),
        "views": story.get("views", 0),
        "avg_rating": 4.6,
        "genre": primary_category,
        "tags": story.get("tags", []),
        "categories": story.get("categories", []),
        "status": "published",
    }


def get_seed_story_list(
    *,
    limit: int = 30,
    skip: int = 0,
    sort_by: str = "created_at",
    genre: str | None = None,
    q: str | None = None,
) -> list[dict]:
    stories = [_seed_story_payload(story) for story in DUMMY_STORIES]
    if genre:
        genre_lower = genre.lower()
        stories = [story for story in stories if any(category.lower() == genre_lower for category in story["categories"])]
    if q:
        needle = q.lower()
        stories = [
            story for story in stories
            if needle in story["title"].lower()
            or needle in story["description"].lower()
            or any(needle in category.lower() for category in story["categories"])
        ]

    if sort_by in {"views", "popular", "rating"}:
        stories.sort(key=lambda story: (story["views"], story["likes"]), reverse=True)
    elif sort_by == "new":
        stories = list(reversed(stories))

    return stories[skip : skip + limit]


def get_seed_story_detail(story_id: str) -> dict | None:
    story = next((item for item in DUMMY_STORIES if item["_id"] == story_id), None)
    if not story:
        return None
    payload = _seed_story_payload(story)
    payload["chapters"] = get_seed_story_chapters(story_id)["chapters"]
    return payload


def get_seed_story_chapters(story_id: str) -> dict[str, list[dict]]:
    story = next((item for item in DUMMY_STORIES if item["_id"] == story_id), None)
    if not story:
        return {"chapters": []}
    return {
        "chapters": [
            {
                "id": f"{story_id}-chapter-1",
                "_id": f"{story_id}-chapter-1",
                "title": story["chapter_title"],
                "content": "<p>This is seeded demo content for client previews. You can edit or replace it from Writer Studio at any time.</p>",
                "chapter_number": 1,
                "word_count": 18,
            }
        ]
    }


def get_seed_categories() -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for story in DUMMY_STORIES:
        for category in story.get("categories", []):
            counts[category] = counts.get(category, 0) + 1
    return [{"name": name, "count": count} for name, count in sorted(counts.items())]


async def ensure_default_admin(database: AsyncIOMotorDatabase) -> dict:
    settings = get_settings()
    admin_username = settings.default_admin_username.strip() or "admin"
    admin_email = settings.default_admin_email.strip() or "admin@example.com"
    admin_password = settings.default_admin_password or "admin"

    admin_user = await database.users.find_one({"username": admin_username})
    if not admin_user:
        admin_user = await database.users.find_one({"email": admin_email})

    admin_doc = {
        "username": admin_username,
        "email": admin_email,
        "password_hash": hash_password(admin_password),
        "is_email_verified": True,
        "bio": "Platform administrator account.",
        "profile_image": "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=600&q=80",
        "is_admin": True,
        "is_banned": False,
        "followers_count": 0,
        "following_count": 0,
        "full_name": "Admin User",
        "location": "HQ",
        "website": "",
        "favorite_genres": ["Admin"],
        "reading_goal": "Keep quality high",
    }

    if admin_user:
        await database.users.update_one({"_id": admin_user["_id"]}, {"$set": admin_doc})
        return {"_id": admin_user["_id"], **admin_doc}

    admin_doc["_id"] = "admin-user"
    await database.users.insert_one(admin_doc)
    return admin_doc


async def ensure_dummy_stories(database: AsyncIOMotorDatabase, author_id: str) -> None:
    existing = await database.stories.count_documents({"_id": {"$in": [story["_id"] for story in DUMMY_STORIES]}})
    if existing >= len(DUMMY_STORIES):
        return

    now = datetime.now(timezone.utc)
    for idx, story in enumerate(DUMMY_STORIES):
        story_doc = {
            "_id": story["_id"],
            "author_id": author_id,
            "title": story["title"],
            "description": story["description"],
            "cover_image": story["cover_image"],
            "tags": story["tags"],
            "categories": story["categories"],
            "status": "published",
            "likes": story["likes"],
            "views": story["views"],
            "created_at": now,
            "updated_at": now,
        }
        await database.stories.update_one({"_id": story_doc["_id"]}, {"$set": story_doc}, upsert=True)

        chapter_doc = {
            "_id": f"{story_doc['_id']}-chapter-1",
            "story_id": story_doc["_id"],
            "title": story["chapter_title"],
            "content": (
                "This is seeded demo content for client previews. "
                "You can edit or replace it from Writer Studio at any time."
            ),
            "chapter_number": 1,
        }
        await database.chapters.update_one({"_id": chapter_doc["_id"]}, {"$set": chapter_doc}, upsert=True)

        await database.views.update_one(
            {"_id": f"seed-view-{story_doc['_id']}-{idx}"},
            {
                "$set": {
                    "story_id": story_doc["_id"],
                    "viewed_at": now,
                }
            },
            upsert=True,
        )


async def ensure_seed_data(database: AsyncIOMotorDatabase) -> None:
    admin = await ensure_default_admin(database)
    await ensure_dummy_stories(database, author_id=admin["_id"])
