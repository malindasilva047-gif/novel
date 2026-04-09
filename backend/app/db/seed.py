from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.seed_home_categories import ensure_home_category_seed

SAMPLE_USERS: list[dict] = [
    {
        "_id": "sample-user-1",
        "username": "elena_rose",
        "email": "elena@example.com",
        "full_name": "Elena Rose",
        "phone": "+94 71 111 2233",
        "preferred_language": "English",
        "favorite_genres": ["Fantasy", "Romance"],
    },
    {
        "_id": "sample-user-2",
        "username": "marcus_stone",
        "email": "marcus@example.com",
        "full_name": "Marcus Stone",
        "phone": "+94 77 555 8877",
        "preferred_language": "English",
        "favorite_genres": ["Sci-Fi", "Thriller"],
    },
    {
        "_id": "sample-user-3",
        "username": "aurora_sky",
        "email": "aurora@example.com",
        "full_name": "Aurora Sky",
        "phone": "+94 75 220 7788",
        "preferred_language": "Sinhala",
        "favorite_genres": ["Drama", "Mystery"],
    },
]

SAMPLE_AVATARS: list[dict] = [
    {"name": "Shruti", "gender": "female", "image_url": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80"},
    {"name": "Kabir", "gender": "male", "image_url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80"},
    {"name": "Mitali", "gender": "female", "image_url": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80"},
    {"name": "Meet", "gender": "male", "image_url": "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80"},
]

SAMPLE_CMS_PAGES: list[dict] = [
    {
        "slug": "about",
        "title": "About Bixbi",
        "excerpt": "Learn about the platform, our mission, and the creator community behind Bixbi.",
        "content": "<h1>About Bixbi</h1><p>Bixbi is a reading and writing platform built for serialized stories, bold voices, and passionate communities.</p><p>We help readers discover stories they actually want to keep following and give writers a clean place to publish, grow, and connect.</p>",
    },
    {
        "slug": "privacy-policy",
        "title": "Privacy Policy",
        "excerpt": "How Bixbi stores, processes, and protects reader and author data.",
        "content": "<h1>Privacy Policy</h1><p>We store only the information required to operate your account, personalize recommendations, and keep the platform secure.</p><p>You can update your profile details at any time from your account settings.</p>",
    },
    {
        "slug": "terms-of-service",
        "title": "Terms of Service",
        "excerpt": "Guidelines for using the Bixbi platform responsibly.",
        "content": "<h1>Terms of Service</h1><p>Users are responsible for the content they publish. Accounts that violate platform policies may be restricted or removed.</p><p>By using Bixbi, you agree to respect creators, readers, and community standards.</p>",
    },
]

SAMPLE_GENRES: list[dict] = [
    {"name": "Fantasy", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f9d9.png"},
    {"name": "Romance", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f495.png"},
    {"name": "Mystery", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f50d.png"},
    {"name": "Sci-Fi", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png"},
    {"name": "Thriller", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26a1.png"},
    {"name": "Adventure", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f5fa.png"},
    {"name": "Fantasy", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f9d9.png"},
    {"name": "Romance", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f495.png"},
    {"name": "Mystery", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f50d.png"},
    {"name": "Sci-Fi", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png"},
    {"name": "Thriller", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26a1.png"},
    {"name": "Adventure", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f5fa.png"},
    {"name": "Historical", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3f0.png"},
    {"name": "Horror", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f47b.png"},
    {"name": "Comedy", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f923.png"},
    {"name": "Slice of Life", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f33f.png"},
    {"name": "Young Adult", "icon_url": "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f393.png"},
]

DUMMY_STORIES: list[dict] = [
    {
        "_id": "demo-story-neon-monsoon",
        "title": "Fallen to the Enigmatic Mafia Lord",
        "description": "Ollie Grey had always harbored a secret — a deep, undeniable love for his best friend, Lucas Pierre. There was just one catch: Lucas wasn't just any ordinary guy; he was a formidable mafia lord, known for his sharp edge and cold demeanor. To make matters complicated, he also happened to be the straightest man Ollie had ever known.\n\nWith Lucas now dating the stunning Cassandra Lim, the quintessential beauty adored by many, Ollie found himself teetering on the brink. How long could he keep his feelings buried deep inside? As tension builds and emotions boil over, Ollie risks everything to reveal his heart. What will happen when the truth threatens to upend their friendship — and Lucas's entire world?",
        "cover_image": "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1300&q=80",
        "tags": ["BxB", "Mafia", "Angst", "Romance", "Happy Ending", "Mature"],
        "categories": ["Romance", "Mafia"],
        "likes": 340,
        "views": 1800,
        "chapter_title": "Chapter 1: Welcome to the Family",
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
    {
        "_id": "demo-story-historic-echoes",
        "title": "Echoes of the Past",
        "description": "A historian unearths a diary that reveals a hidden love story from the colonial era.",
        "cover_image": "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=1200&q=80",
        "tags": ["historical", "romance"],
        "categories": ["Historical", "Romance"],
        "likes": 120,
        "views": 900,
    },
    {
        "_id": "demo-story-haunted-mansion",
        "title": "The Haunted Manor",
        "description": "A group of friends spend the night in a haunted mansion and uncover its dark secrets.",
        "cover_image": "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
        "tags": ["horror", "ghost", "mystery"],
        "categories": ["Horror", "Mystery"],
        "likes": 210,
        "views": 1500,
    },
    {
        "_id": "demo-story-laugh-track",
        "title": "Laugh Track",
        "description": "A stand-up comedian’s life takes a wild turn after a viral joke.",
        "cover_image": "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=1200&q=80",
        "tags": ["comedy", "slice of life"],
        "categories": ["Comedy", "Slice of Life"],
        "likes": 95,
        "views": 700,
    },
    {
        "_id": "demo-story-green-days",
        "title": "Green Days",
        "description": "A coming-of-age story about a group of teens navigating high school and friendship.",
        "cover_image": "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=1200&q=80",
        "tags": ["young adult", "school", "friendship"],
        "categories": ["Young Adult", "Slice of Life"],
        "likes": 180,
        "views": 1100,
    },
    {
        "_id": "demo-story-life-in-frames",
        "title": "Life in Frames",
        "description": "A photographer captures the hidden stories of city dwellers, one frame at a time.",
        "cover_image": "https://images.unsplash.com/photo-1465101178521-c1a9136a3c8b?auto=format&fit=crop&w=1200&q=80",
        "tags": ["slice of life", "city", "photography"],
        "categories": ["Slice of Life"],
        "likes": 75,
        "views": 600,
    },
    {
        "_id": "demo-story-nightmare-lake",
        "title": "Nightmare at Lake Hollow",
        "description": "A summer camp turns terrifying when campers start vanishing at night.",
        "cover_image": "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=1200&q=80",
        "tags": ["horror", "thriller", "camp"],
        "categories": ["Horror", "Thriller"],
        "likes": 160,
        "views": 980,
    },
    {
        "_id": "demo-story-ya-journey",
        "title": "The YA Journey",
        "description": "A young adult embarks on a journey of self-discovery and adventure.",
        "cover_image": "https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=1200&q=80",
        "tags": ["young adult", "adventure"],
        "categories": ["Young Adult", "Adventure"],
        "likes": 140,
        "views": 850,
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
        "preferred_language": "English",
        "created_at": datetime.now(timezone.utc),
    }

    if admin_user:
        await database.users.update_one({"_id": admin_user["_id"]}, {"$set": admin_doc})
        return {"_id": admin_user["_id"], **admin_doc}

    admin_doc["_id"] = "admin-user"
    await database.users.insert_one(admin_doc)
    return admin_doc


async def ensure_dummy_stories(database: AsyncIOMotorDatabase, author_id: str) -> None:
    now = datetime.now(timezone.utc)
    sample_author_ids = [author_id] + [user["_id"] for user in SAMPLE_USERS]
    for idx, story in enumerate(DUMMY_STORIES):
        assigned_author_id = sample_author_ids[idx % len(sample_author_ids)]
        story_doc = {
            "_id": story["_id"],
            "author_id": assigned_author_id,
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

        chapter_title = story.get("chapter_title", story["title"])
        chapter_doc = {
            "_id": f"{story_doc['_id']}-chapter-1",
            "story_id": story_doc["_id"],
            "title": chapter_title,
            "content": story.get("chapter_content") or (
                f"<h2>{chapter_title}</h2>"
                f"<p>{story['description']}</p>"
                "<p>The scene opens with tension already in the air. Every small detail matters, and the protagonist senses that today's choice will change the path ahead.</p>"
                "<p>By the time the chapter closes, the promise of a larger mystery has fully taken shape.</p>"
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


async def ensure_site_settings(database: AsyncIOMotorDatabase) -> None:
    await database.site_settings.update_one(
        {"_id": "default"},
        {
            "$setOnInsert": {
                "_id": "default",
                "site_name": "Bixbi",
                "logo_url": "",
                "contact_email": "support@bixbi.app",
                "dark_logo_url": "",
                "light_logo_url": "",
                "splash_image_url": "",
                "copyright_text": f"Copyright {datetime.now(timezone.utc).year} Bixbi. All rights reserved.",
                "primary_color": "#1278ff",
                "secondary_color": "#35a0ff",
                "sms_config": {
                    "provider": "Twilio",
                    "provider_secondary": "MSG 91",
                    "account_sid": "",
                    "auth_token": "",
                    "phone_number": "",
                },
                "mail_setup": {
                    "mailer": "smtp",
                    "host": "",
                    "port": "587",
                    "encryption": "tls",
                    "username": "",
                    "password": "",
                    "from_address": "",
                },
                "aws_media": {
                    "access_key": "",
                    "secret_access_key": "",
                    "bucket_name": "",
                    "bucket_url": "",
                },
                "firebase": {
                    "credentials_file_url": "",
                    "info_text": "Open Firebase Console, create a service account key, and upload the JSON file here.",
                },
                "payment": {
                    "active_provider": "razorpay",
                    "razorpay_enabled": False,
                    "stripe_public_key": "",
                    "stripe_secret_key": "",
                    "paypal_enabled": False,
                },
                "login_config": {
                    "email_enabled": True,
                    "mobile_otp_enabled": True,
                    "facebook_enabled": False,
                    "google_enabled": True,
                    "apple_enabled": False,
                },
                "purchase_code": {
                    "code": "",
                    "status": "active",
                },
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )


async def ensure_catalogs(database: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)

    for user in SAMPLE_USERS:
        await database.language_catalog.update_one(
            {"name": user["preferred_language"]},
            {
                "$setOnInsert": {
                    "name": user["preferred_language"],
                    "country": "LK",
                    "status": "active",
                    "is_default": user["preferred_language"] == "English",
                    "created_at": now,
                }
            },
            upsert=True,
        )

    for genre in SAMPLE_GENRES:
        await database.genre_catalog.update_one(
            {"name": genre["name"]},
            {
                "$set": {
                    "icon_url": genre.get("icon_url", ""),
                    "status": "active",
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "name": genre["name"],
                    "created_at": now,
                },
            },
            upsert=True,
        )

    for story in DUMMY_STORIES:
        for category in story.get("categories", []):
            await database.genre_catalog.update_one(
                {"name": category},
                {
                    "$setOnInsert": {
                        "name": category,
                        "icon_url": "",
                        "status": "active",
                        "created_at": now,
                    },
                    "$set": {"updated_at": now},
                },
                upsert=True,
            )

        for tag in story.get("tags", []):
            await database.hashtag_catalog.update_one(
                {"name": tag.lower()},
                {
                    "$setOnInsert": {
                        "name": tag.lower(),
                        "status": "active",
                        "created_at": now,
                    }
                },
                upsert=True,
            )

    for index, avatar in enumerate(SAMPLE_AVATARS, start=1):
        await database.avatar_library.update_one(
            {"name": avatar["name"]},
            {
                "$set": {
                    "_id": f"avatar-{index}",
                    "name": avatar["name"],
                    "gender": avatar["gender"],
                    "image_url": avatar["image_url"],
                    "created_at": now,
                }
            },
            upsert=True,
        )

    for page in SAMPLE_CMS_PAGES:
        await database.cms_pages.update_one(
            {"slug": page["slug"]},
            {
                "$set": {
                    "slug": page["slug"],
                    "title": page["title"],
                    "excerpt": page["excerpt"],
                    "content": page["content"],
                    "is_published": True,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )


async def ensure_admin_support_data(database: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)

    await database.user_blocks.update_one(
        {"_id": "sample-user-2::sample-user-1"},
        {
            "$setOnInsert": {
                "_id": "sample-user-2::sample-user-1",
                "blocked_user_id": "sample-user-2",
                "blocked_by_user_id": "sample-user-1",
                "created_at": now,
            }
        },
        upsert=True,
    )

    await database.push_notifications.update_one(
        {"_id": "seed-push-1"},
        {
            "$setOnInsert": {
                "_id": "seed-push-1",
                "title": "Welcome to Bixbi",
                "description": "Explore new stories, notifications, and recommendations personalized for you.",
                "status": "sent",
                "recipient_count": len(SAMPLE_USERS) + 1,
                "created_at": now,
            }
        },
        upsert=True,
    )

    for user_id in ["sample-user-1", "sample-user-2", "sample-user-3", "admin-user"]:
        await database.notifications.update_one(
            {"_id": f"seed-push-1::{user_id}"},
            {
                "$setOnInsert": {
                    "_id": f"seed-push-1::{user_id}",
                    "user_id": user_id,
                    "type": "broadcast",
                    "message": "Welcome to Bixbi. Your dashboard, alerts, and recommendations are ready.",
                    "is_read": False,
                    "created_at": now,
                }
            },
            upsert=True,
        )

    await database.reports.update_one(
        {"_id": "sample-user-report-1"},
        {
            "$setOnInsert": {
                "_id": "sample-user-report-1",
                "user_id": "sample-user-2",
                "target_user_id": "sample-user-3",
                "report_kind": "user",
                "reason": "Bullying or harassment",
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    await database.reports.update_one(
        {"_id": "sample-reel-report-1"},
        {
            "$setOnInsert": {
                "_id": "sample-reel-report-1",
                "user_id": "sample-user-1",
                "story_id": "demo-story-neon-monsoon",
                "report_kind": "reel",
                "reported_entity_type": "reel",
                "reason": "Violence or dangerous organisations",
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    await database.reports.update_one(
        {"_id": "sample-story-report-1"},
        {
            "$setOnInsert": {
                "_id": "sample-story-report-1",
                "user_id": "sample-user-1",
                "story_id": "demo-story-coral-kingdom",
                "report_kind": "story",
                "reported_entity_type": "story",
                "reason": "Misleading title and metadata",
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    await database.reports.update_one(
        {"_id": "sample-chapter-report-1"},
        {
            "$setOnInsert": {
                "_id": "sample-chapter-report-1",
                "user_id": "sample-user-2",
                "story_id": "demo-story-midnight-library",
                "chapter_id": "demo-story-midnight-library-chapter-1",
                "report_kind": "chapter",
                "reported_entity_type": "chapter",
                "reason": "Copied content from external source",
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    await database.reports.update_one(
        {"_id": "sample-comment-report-1"},
        {
            "$setOnInsert": {
                "_id": "sample-comment-report-1",
                "user_id": "sample-user-3",
                "story_id": "demo-story-neon-monsoon",
                "comment_id": "seed-comment-1",
                "report_kind": "comment",
                "reported_entity_type": "comment",
                "reason": "Abusive language in discussion",
                "status": "open",
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )


async def ensure_sample_users(database: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)
    for idx, user in enumerate(SAMPLE_USERS):
        await database.users.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "username": user["username"],
                    "email": user["email"],
                    "password_hash": hash_password("password123"),
                    "is_email_verified": True,
                    "is_admin": False,
                    "is_banned": False,
                    "followers_count": idx * 3,
                    "following_count": idx * 2,
                    "full_name": user["full_name"],
                    "phone": user["phone"],
                    "preferred_language": user["preferred_language"],
                    "favorite_genres": user["favorite_genres"],
                    "bio": f"{user['full_name']} is part of the Bixbi sample community.",
                    "location": "Colombo",
                    "country": "Sri Lanka",
                    "reading_goal": "Read 20 books this year",
                    "created_at": now,
                    "profile_completed": True,
                    "onboarding_status": "active",
                }
            },
            upsert=True,
        )


async def ensure_story_reviews(database: AsyncIOMotorDatabase) -> None:
    now = datetime.now(timezone.utc)
    seeded_comments = [
        {
            "_id": "seed-comment-1",
            "story_id": "demo-story-neon-monsoon",
            "user_id": "sample-user-1",
            "content": "This opening chapter hooked me instantly. The city atmosphere feels alive.",
            "status": "visible",
        },
        {
            "_id": "seed-comment-2",
            "story_id": "demo-story-coral-kingdom",
            "user_id": "sample-user-2",
            "content": "Beautiful premise and strong world building. Looking forward to chapter two.",
            "status": "visible",
        },
        {
            "_id": "seed-comment-3",
            "story_id": "demo-story-midnight-library",
            "user_id": "sample-user-3",
            "content": "The writing style is vivid and cinematic. Great pacing so far.",
            "status": "visible",
        },
        {
            "_id": "seed-comment-4",
            "story_id": "demo-story-sky-garden",
            "user_id": "admin-user",
            "content": "Love the hopefulness in this story. The concept is unique and emotional.",
            "status": "visible",
        },
    ]

    for row in seeded_comments:
        await database.comments.update_one(
            {"_id": row["_id"]},
            {
                "$set": {
                    **row,
                    "created_at": now,
                }
            },
            upsert=True,
        )


async def ensure_seed_data(database: AsyncIOMotorDatabase) -> None:
    admin = await ensure_default_admin(database)
    await ensure_site_settings(database)
    await ensure_sample_users(database)
    await ensure_dummy_stories(database, author_id=admin["_id"])
    await ensure_home_category_seed(database, author_id=admin["_id"])
    await ensure_catalogs(database)
    await ensure_story_reviews(database)
    await ensure_admin_support_data(database)
