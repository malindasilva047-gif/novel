"""Seed random story/chapter content into the configured MongoDB database.

Usage:
    cd backend
    python seed_random_content.py
"""

from __future__ import annotations

import os
import random
import traceback
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from pymongo import MongoClient


MONGO_URI = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017")
DB_NAME = os.getenv("MONGODB_DB_NAME", "novel_platform")


TITLES = [
    "Ashes Beyond Dawn",
    "Moonlight Harbor",
    "Broken Compass",
    "Clockwork Rain",
    "Velvet Tide",
    "Empire of Quiet Fire",
    "The Last Glass Tower",
    "Echoes Under Lanterns",
    "River of Silver Dust",
    "When Wolves Dream",
]

CATEGORIES = ["Fantasy", "Romance", "Mystery", "Sci-Fi", "Adventure", "Drama", "Thriller"]


def random_paragraph(seed: int) -> str:
    random.seed(seed)
    fragments = [
        "The wind carried the scent of rain and old stone.",
        "A clock in the distance struck an hour nobody trusted.",
        "She held the letter like it could change the shape of the world.",
        "Every step echoed louder than it should have in the empty corridor.",
        "He knew the map was wrong, but he followed it anyway.",
        "The city looked asleep, but its lights never blinked.",
        "Some stories begin with thunder; this one began with silence.",
    ]
    chosen = random.sample(fragments, k=5)
    return " ".join(chosen)


def main() -> None:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=7000)
    client.admin.command("ping")
    db = client[DB_NAME]

    admin = db.users.find_one({"is_admin": True}, {"_id": 1})
    if not admin:
        print("No admin user found. Create an admin user first.")
        client.close()
        return

    author_id = admin["_id"]
    now = datetime.now(timezone.utc)

    created = 0
    for idx, title in enumerate(TITLES, start=1):
        story_id = f"seed-random-{idx:03d}"
        category = random.choice(CATEGORIES)
        story_doc = {
            "_id": story_id,
            "author_id": author_id,
            "title": title,
            "description": random_paragraph(idx),
            "cover_image": "",
            "tags": [category.lower(), "seeded", "random"],
            "categories": [category],
            "status": "published",
            "likes": random.randint(8, 900),
            "views": random.randint(80, 15000),
            "created_at": now,
            "updated_at": now,
        }

        db.stories.update_one({"_id": story_id}, {"$set": story_doc}, upsert=True)

        for chapter_num in range(1, 4):
            chapter_id = f"{story_id}-ch-{chapter_num}"
            chapter_doc = {
                "_id": chapter_id,
                "story_id": story_id,
                "title": f"Chapter {chapter_num}",
                "content": (
                    f"<h2>Chapter {chapter_num}</h2>"
                    f"<p>{random_paragraph(idx * 100 + chapter_num)}</p>"
                    f"<p>{random_paragraph(idx * 1000 + chapter_num)}</p>"
                ),
                "chapter_number": chapter_num,
            }
            db.chapters.update_one({"_id": chapter_id}, {"$set": chapter_doc}, upsert=True)

        created += 1

    print(f"Seeded/updated {created} stories with chapter content in database '{DB_NAME}'.")
    client.close()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as exc:
        print(f"Seeding failed: {exc}")
    except OSError as exc:
        print(f"Seeding failed: {exc}")
    except ValueError as exc:
        print(f"Seeding failed: {exc}")
    except ImportError as exc:
        print(f"Seeding failed: {exc}")
    except LookupError as exc:
        print(f"Seeding failed: {exc}")
        traceback.print_exc()