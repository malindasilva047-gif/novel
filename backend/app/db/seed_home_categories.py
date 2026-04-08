from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

EXTRA_HOME_CATEGORY_STORIES = [
    {
        "_id": "demo-story-rose-lanterns",
        "title": "Rose Lantern Letters",
        "description": "A city archivist and a street violinist trade anonymous letters that slowly rewrite both their lives.",
        "cover_image": "https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=1200&q=80",
        "tags": ["letters", "slowburn", "city"],
        "categories": ["Romance", "Drama"],
        "likes": 620,
        "views": 3480,
        "chapter_title": "Chapter 1: The First Envelope",
    },
    {
        "_id": "demo-story-velvet-evidence",
        "title": "Velvet Evidence",
        "description": "A forensic linguist finds a pattern hidden inside witness statements from an impossible case.",
        "cover_image": "https://images.unsplash.com/photo-1453873623425-02b132c5f5ee?auto=format&fit=crop&w=1200&q=80",
        "tags": ["crime", "linguistics", "noir"],
        "categories": ["Mystery", "Thriller"],
        "likes": 540,
        "views": 2970,
        "chapter_title": "Chapter 1: The Missing Verb",
    },
    {
        "_id": "demo-story-ember-trail",
        "title": "Ember Trail Atlas",
        "description": "A mountain guide and a cartographer chase a shifting map that points to a lost pass in the clouds.",
        "cover_image": "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80",
        "tags": ["expedition", "map", "mountains"],
        "categories": ["Adventure", "Fantasy"],
        "likes": 590,
        "views": 3215,
        "chapter_title": "Chapter 1: The Living Map",
    },
]


async def ensure_home_category_seed(database: AsyncIOMotorDatabase, author_id: str) -> None:
    now = datetime.now(timezone.utc)

    for story in EXTRA_HOME_CATEGORY_STORIES:
        story_doc = {
            "_id": story["_id"],
            "author_id": author_id,
            "author_name": "Bixbi Curated",
            "title": story["title"],
            "description": story["description"],
            "cover_image": story["cover_image"],
            "tags": story["tags"],
            "categories": story["categories"],
            "status": "published",
            "likes": story["likes"],
            "views": story["views"],
            "avg_rating": 4.7,
            "created_at": now,
            "updated_at": now,
        }
        await database.stories.update_one({"_id": story_doc["_id"]}, {"$set": story_doc}, upsert=True)

        chapter_doc = {
            "_id": f"{story['_id']}-chapter-1",
            "story_id": story["_id"],
            "title": story["chapter_title"],
            "content": (
                f"<h2>{story['chapter_title']}</h2>"
                f"<p>{story['description']}</p>"
                "<p>This chapter is seeded automatically for homepage category showcases."
                " Replace or extend it anytime from writer tools.</p>"
            ),
            "chapter_number": 1,
        }
        await database.chapters.update_one({"_id": chapter_doc["_id"]}, {"$set": chapter_doc}, upsert=True)

    await database.home_category_sections.update_one(
        {"_id": "home-category-sections"},
        {
            "$set": {
                "sections": [
                    {"key": "romance", "label": "Romance Spotlight"},
                    {"key": "mystery", "label": "Mystery Vault"},
                    {"key": "adventure", "label": "Adventure Trails"},
                ],
                "updated_at": now,
            }
        },
        upsert=True,
    )
