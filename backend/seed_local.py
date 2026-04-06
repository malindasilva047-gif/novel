"""
Seed script for local MongoDB.
Run once from the backend directory:
    python seed_local.py
"""
import sys
import os
from datetime import datetime, timezone

# Allow importing from the backend app package
sys.path.insert(0, os.path.dirname(__file__))

from pymongo import MongoClient
from app.core.security import hash_password  # uses pbkdf2_sha256

MONGO_URI = "mongodb://127.0.0.1:27017"
DB_NAME = "novel_platform"


DUMMY_STORIES = [
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
        "chapter_content": (
            "<h2>Chapter 1: Streetlight Ghost</h2>"
            "<p>Rain hammered the neon-drenched alleys of Sector Nine. Kira pressed herself flat against the wet plascrete wall, "
            "watching the drones sweep their search beams across the street below. The data chip felt hot in her palm — "
            "or maybe that was just her pulse.</p>"
            "<p>She'd pulled it from the DeepWeather node twenty minutes ago. What she'd found on it had changed everything she "
            "thought she knew about the storm that buried the Eastern Sprawl three years ago.</p>"
            "<p>It wasn't a storm. It was a command.</p>"
        ),
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
        "chapter_content": (
            "<h2>Chapter 1: Breath of Salt</h2>"
            "<p>Thirty metres below the surface, where sunlight frayed into scattered threads of green and gold, "
            "Mara found the door.</p>"
            "<p>It should not have been there. The charts showed nothing but bare rock and coral shelf. Yet here it was — "
            "a smooth obsidian arch rising from the seabed, engraved with symbols she almost recognised, "
            "as if someone had taken letters from every language on earth and blended them into one.</p>"
            "<p>She pressed her gloved hand against the centre. The door swung inward without resistance. "
            "Beyond it, impossibly, was air.</p>"
        ),
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
        "chapter_content": (
            "<h2>Chapter 1: The Silent Shelf</h2>"
            "<p>Professor Aldine had catalogued ten thousand manuscripts in her career. She had never met a book that catalogued her back.</p>"
            "<p>The archive on Verity Street was supposed to be a routine acquisition — estate of a deceased collector, "
            "a few dozen medieval pamphlets, nothing extraordinary. But when she opened the wooden trunk in the third basement room "
            "and found the single slim volume bound in paper the colour of bone, something shifted in her chest.</p>"
            "<p>Her own name was on the title page. Written in her own handwriting. Dated forty years from now.</p>"
        ),
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
        "chapter_content": (
            "<h2>Chapter 1: Seeds Above Asphalt</h2>"
            "<p>The last oxygen reading Maya had trusted was two years ago, before the government stopped publishing them. "
            "Now she measured the air by how long she could stand outside before the taste of copper reached her throat.</p>"
            "<p>Forty-seven minutes today. A new record.</p>"
            "<p>She climbed the service ladder to the roof of Block 9, bucket of composted scraps in hand, "
            "and found her garden exactly as she had left it — sixty square metres of impossible green "
            "defying the grey sky above the city. Somewhere below, twelve million people breathed recycled air. "
            "Up here, the air was hers.</p>"
        ),
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
        "chapter_content": (
            "<h2>Chapter 1: Springs and Sparks</h2>"
            "<p>The mainspring snapped at the worst possible moment — as it always did.</p>"
            "<p>Tovias swept the broken mechanism off the bench with one arm and pressed his back against the workshop wall "
            "as boots hammered past outside. The brass golem patrol was early tonight. He counted to thirty, heard the grinding "
            "cadence of their joints fade down the alley, then exhaled.</p>"
            "<p>On the floor beside his stool sat the courier's satchel. He had not looked inside it. He intended never to. "
            "But the note tucked under the strap said: <em>Deliver by dawn or the Council arms the Heartline by noon.</em></p>"
            "<p>Dawn was three hours away. He had no mainspring. And the courier was dead.</p>"
        ),
    },
    {
        "_id": "demo-story-last-kingdom",
        "title": "The Last Kingdom of Stars",
        "description": "An epic fantasy spanning centuries — where gods walk among mortals and destiny is written in blood.",
        "cover_image": "https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1300&q=80",
        "tags": ["epic", "gods", "war"],
        "categories": ["Fantasy", "Drama"],
        "likes": 892,
        "views": 5412,
        "chapter_title": "Chapter 1: The God Who Wept",
        "chapter_content": (
            "<h2>Chapter 1: The God Who Wept</h2>"
            "<p>They say a god cannot weep. They are wrong.</p>"
            "<p>Eres stood at the edge of the Scar — that ancient wound in the earth where three civilisations had risen and fallen "
            "in a single generation — and felt the grief of a thousand years press against the back of his eyes. "
            "Below, the last mortal city burned. He had promised he would not intervene. He had made that promise to himself, "
            "which meant it counted for nothing.</p>"
            "<p>He stepped off the cliff.</p>"
        ),
    },
    {
        "_id": "demo-story-broken-sea",
        "title": "Echoes of a Broken Sea",
        "description": "A nautical adventure that pulls you beneath the waves and never lets you go.",
        "cover_image": "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=1300&q=80",
        "tags": ["nautical", "mystery", "adventure"],
        "categories": ["Adventure", "Mystery"],
        "likes": 634,
        "views": 3870,
        "chapter_title": "Chapter 1: The Shape Below",
        "chapter_content": (
            "<h2>Chapter 1: The Shape Below</h2>"
            "<p>Captain Rielle had sailed the Broken Sea for twenty years without ever believing the old stories. "
            "Then the sonar pinged something two thousand metres down that had no business being there — "
            "something that moved.</p>"
            "<p>It moved slowly. Patient. In a wide, deliberate circle around the hull of her ship.</p>"
            "<p>She ordered the crew to hold course. She watched the sonar screen until her coffee went cold. "
            "When she finally looked up, every one of her fourteen crew members was standing at the rail, staring down into the black water. "
            "None of them had heard her give the order to stop.</p>"
        ),
    },
    {
        "_id": "demo-story-gilded-dust",
        "title": "Gilded Dust & Forgotten Vows",
        "description": "A slow-burn romance set in the glittering courts of a dying empire.",
        "cover_image": "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=1300&q=80",
        "tags": ["romance", "court", "empire"],
        "categories": ["Romance", "Drama"],
        "likes": 1102,
        "views": 7200,
        "chapter_title": "Chapter 1: The Wrong Name",
        "chapter_content": (
            "<h2>Chapter 1: The Wrong Name</h2>"
            "<p>The herald announced the wrong name.</p>"
            "<p>Cassia heard it clearly — her sister's name, not hers — echoing off the marble pillars of the Grand Court "
            "as three hundred courtiers turned to look at her. She kept her expression neutral. "
            "She had been keeping her expression neutral since she was seven years old.</p>"
            "<p>Across the room, the Duke of Valtrain was also keeping his expression neutral. "
            "Their eyes met for exactly one second. In that second, Cassia understood two things: "
            "he knew the herald had made a mistake, and he did not intend to correct it.</p>"
        ),
    },
]


def seed(client: MongoClient) -> None:
    db = client[DB_NAME]
    now = datetime.now(timezone.utc)

    # Admin user
    admin_doc = {
        "_id": "admin-user",
        "username": "admin",
        "email": "admin@bixbi.local",
        "password_hash": hash_password("admin"),
        "is_email_verified": True,
        "is_admin": True,
        "is_banned": False,
        "full_name": "Admin User",
        "bio": "Platform administrator.",
        "profile_image": "https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=600&q=80",
        "followers_count": 0,
        "following_count": 0,
        "location": "HQ",
        "website": "",
        "favorite_genres": ["All"],
        "reading_goal": "Keep quality high",
        "created_at": now,
    }
    result = db.users.update_one({"_id": "admin-user"}, {"$set": admin_doc}, upsert=True)
    print(f"  admin user  : {'created' if result.upserted_id else 'updated'}")

    # Stories + chapters
    created = 0
    for idx, story in enumerate(DUMMY_STORIES):
        story_doc = {
            "_id": story["_id"],
            "author_id": "admin-user",
            "author_name": "Bixbi Archive",
            "title": story["title"],
            "description": story["description"],
            "cover_image": story["cover_image"],
            "tags": story["tags"],
            "categories": story["categories"],
            "status": "published",
            "likes": story["likes"],
            "views": story["views"],
            "avg_rating": 4.6,
            "created_at": now,
            "updated_at": now,
        }
        r = db.stories.update_one({"_id": story_doc["_id"]}, {"$set": story_doc}, upsert=True)
        if r.upserted_id:
            created += 1

        chapter_doc = {
            "_id": f"{story['_id']}-chapter-1",
            "story_id": story["_id"],
            "title": story["chapter_title"],
            "content": story["chapter_content"],
            "chapter_number": 1,
        }
        db.chapters.update_one({"_id": chapter_doc["_id"]}, {"$set": chapter_doc}, upsert=True)

    updated = len(DUMMY_STORIES) - created
    print(f"  stories     : {created} created, {updated} updated ({len(DUMMY_STORIES)} total)")
    print(f"  chapters    : {len(DUMMY_STORIES)} upserted")

    # Ensure basic indexes
    db.users.create_index("username", unique=True)
    db.users.create_index("email", unique=True)
    db.stories.create_index("status")
    db.stories.create_index("author_id")
    db.chapters.create_index("story_id")
    print("  indexes     : created")

    print("\nDatabase:")
    for name in db.list_collection_names():
        count = db[name].count_documents({})
        print(f"  {name:<20} {count} docs")


if __name__ == "__main__":
    print("Connecting to local MongoDB …")
    client: MongoClient = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
        print("Connected.\n")
        seed(client)
        print("\nDone. Update backend/.env is already pointing to local MongoDB.")
        print("Restart the backend to pick up the new database.")
    except Exception as exc:
        print(f"Connection failed: {exc}")
    finally:
        client.close()
