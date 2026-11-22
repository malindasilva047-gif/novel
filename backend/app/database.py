from __future__ import annotations

import os
import sqlite3
import threading
import time
from pathlib import Path
from urllib.parse import unquote, urlsplit
from uuid import uuid4

try:
    import mysql.connector as mysql_connector
    from mysql.connector.pooling import MySQLConnectionPool
except ModuleNotFoundError:
    mysql_connector = None
    MySQLConnectionPool = None

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    load_dotenv = lambda *args, **kwargs: None

# Load .env.local first (local dev environment), then fall back to .env
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_ROOT / ".env.local", override=False)
load_dotenv(_BACKEND_ROOT / ".env", override=False)

DB_TYPE = "mysql"
if os.getenv("DB_TYPE", "mysql").strip().lower() != "mysql":
    raise RuntimeError("This backend requires MySQL. Set DB_TYPE=mysql and configure MYSQL_* variables.")

USE_SQLITE = False

MYSQL_ERROR = mysql_connector.Error if mysql_connector is not None else Exception


def mysql_connection_settings(*, include_database: bool = True) -> dict:
    """Build connector settings from MYSQL_* fields or a hosted MYSQL_URL."""
    parsed = None
    mysql_url = os.getenv("MYSQL_URL", "").strip()
    if mysql_url:
        parsed = urlsplit(mysql_url)
        if parsed.scheme not in {"mysql", "mariadb"} or not parsed.hostname:
            raise ValueError("MYSQL_URL must be a mysql:// or mariadb:// connection URL")

    settings = {
        "host": os.getenv("MYSQL_HOST") or (parsed.hostname if parsed else "127.0.0.1"),
        "port": int(os.getenv("MYSQL_PORT") or (parsed.port if parsed else 3306)),
        "user": os.getenv("MYSQL_USER") or (unquote(parsed.username or "") if parsed else "root"),
        "password": os.getenv("MYSQL_PASSWORD") or (unquote(parsed.password or "") if parsed else ""),
        "ssl_disabled": os.getenv("MYSQL_SSL_DISABLED", "false").strip().lower() == "true",
        "use_pure": True,
    }
    if include_database:
        database_name = os.getenv("MYSQL_DATABASE", "").strip()
        if not database_name and parsed:
            database_name = unquote(parsed.path.lstrip("/"))
        settings["database"] = database_name or "defaultdb"

    ssl_ca = os.getenv("MYSQL_SSL_CA", "").strip()
    if ssl_ca:
        settings["ssl_ca"] = ssl_ca
    if os.getenv("MYSQL_SSL_VERIFY_CERT", "false").strip().lower() == "true":
        settings["ssl_verify_cert"] = True
    return settings

REQUIRED_TABLES = {
    "categories",
    "books",
    "chapters",
    "library_entries",
    "write_screen",
    "notifications",
    "menu_items",
    "profiles",
    "reading_lists",
    "achievements",
}

SEED_CATEGORIES = [
    ("New", 0, "discover", 1),
    ("Popular", 0, "discover", 2),
    ("Fanfiction", 0, "discover", 3),
    ("Newsfeed", 0, "discover", 4),
    ("Editor's Picks", 0, "discover", 5),
    ("Rising", 0, "discover", 6),
    ("Trending", 0, "discover", 7),
    ("Top Picks", 0, "discover", 8),
    ("Fanfiction", 100, "explore", 1),
    ("Fantasy", 31, "explore", 2),
    ("Poetry", 14, "explore", 3),
    ("Adventure", 35, "explore", 4),
    ("Horror", 29, "explore", 5),
    ("Thriller", 35, "explore", 6),
    ("Young Adult", 0, "explore", 7),
    ("LGBTQ+", 0, "explore", 8),
    ("Literary Fiction", 0, "explore", 9),
    ("Historical Fiction", 0, "explore", 10),
    ("Erotica", 32, "explore", 11),
    ("Mystery", 32, "explore", 12),
    ("SciFi", 31, "explore", 13),
    ("Humor", 24, "explore", 14),
    ("Drama", 28, "explore", 15),
    ("Romance", 41, "explore", 16),
    ("Paranormal", 19, "explore", 17),
    ("Billionaire", 12, "explore", 18),
    ("Enemies to Lovers", 9, "explore", 19),
    ("Magic School", 8, "explore", 20),
]

SEED_BOOKS = [
    (
        "River (Revised version)",
        "Lola Grant",
        "A revised edition prepared for publication with deeper character arcs.",
        "story_card_images/c1a4b2d2-7ba9-44ea-9ea9-81873119a8ec.jpg",
        "#8DB7C8",
        "recently_updated",
        "2hr ago",
        4.5,
        "Historical Fiction",
        "Drama",
        "Read now",
        20,
        0,
    ),
    (
        "Misery's Chosen",
        "I. Falon",
        "Mico faces a shadowed figure with glowing eyes on a stormy night.",
        "story_card_images/cf12c459-4fe5-4725-8ca0-01f42b898d21.jpg",
        "#4A4A62",
        "recently_completed",
        "Completed",
        4.8,
        "Horror",
        "Mystery",
        "Read now",
        21,
        1,
    ),
    (
        "Goddess Tamer",
        "Ari Nova",
        "A reborn hero must tame a dangerous goddess and survive a hostile realm.",
        "story_card_images/d1a0655f-892d-4603-919f-92cdf779dae7.jpg",
        "#7F74C1",
        "recently_completed",
        "Completed",
        4.9,
        "Adventure",
        "Fantasy",
        "Read now",
        22,
        1,
    ),
    (
        "Avengard: The Fall of Senvia",
        "R. Den",
        "Two survivors chase a stolen voice across a drowned empire.",
        "story_card_images/d7728b65-7fcc-45cc-bfb2-38a47dfea216.jpg",
        "#6A8DB5",
        "recently_updated",
        "1yr ago",
        4.3,
        "Fantasy",
        "Romance",
        "Read now",
        23,
        0,
    ),
    (
        "Diary Of Nobody",
        "K. Haze",
        "A quiet diary that reveals pages no one was meant to read.",
        "story_card_images/d55997d3-bc48-43a1-a42e-d004598104d0.jpg",
        "#7D6A5A",
        "recently_updated",
        "1m ago",
        4.1,
        "Poetry",
        "Drama",
        "Read now",
        24,
        0,
    ),
    (
        "Demon King Leveling System",
        "J. Ard",
        "A trapped student awakens a leveling system to survive the abyss.",
        "story_card_images/dc335f4a-9cf3-498d-8c27-5addd0cb15cf.jpg",
        "#3F6FA0",
        "recently_updated",
        "5m ago",
        4.7,
        "Fantasy",
        "Action",
        "Read now",
        25,
        0,
    ),
    (
        "The Boy with the Checkered Scarf",
        "M. Wren",
        "A mythic tale where one scarf links three broken timelines.",
        "story_card_images/dc499710-91bd-4dae-8d0c-145faa5345e2.jpg",
        "#7C6D6A",
        "recently_updated",
        "10m ago",
        4.4,
        "Poetry",
        "Literary Fiction",
        "Read now",
        26,
        0,
    ),
    (
        "The Mnemonivores",
        "Liora Fane",
        "Creatures that feed on memories stalk a city after sunset.",
        "story_card_images/de52e8d5-1a1c-43b2-8752-70582d3e6c94.jpg",
        "#51406A",
        "recently_updated",
        "7m ago",
        4.6,
        "Paranormal",
        "Urban Fantasy",
        "Read now",
        27,
        0,
    ),
    (
        "Gaming Cube Adventures",
        "E. Barrett",
        "A failed streamer logs into a game that refuses to let him leave.",
        "story_card_images/e65f5659-9564-4623-b4c6-a5c37cb4aa5e.jpg",
        "#5875A3",
        "recently_updated",
        "2wk ago",
        4.2,
        "Action",
        "Fantasy",
        "Read now",
        28,
        0,
    ),
    (
        "The Apex Transfer",
        "Elena Torres",
        "An invisible outlier discovers she carries royal wolf blood.",
        "story_card_images/fdc309b2-20b4-4966-8293-9db4532dd8e3.jpg",
        "#7B5D56",
        "recently_completed",
        "Completed",
        5.0,
        "Fantasy",
        "Paranormal",
        "Read now",
        29,
        1,
    ),
    (
        "Moonlit Glass House",
        "Nora Hale",
        "A grieving tailor discovers her family home hides a locked future beneath its floors.",
        "story_card_images/006575b1-f6b5-49b2-b3a4-6a9ef1a1e02e.jpg",
        "#D6A3A8",
        "recently_updated",
        "18m ago",
        4.7,
        "Mystery",
        "Drama",
        "Read now",
        30,
        0,
    ),
    (
        "The Ember Archive",
        "Sera Quinn",
        "A scholar in a city of ash uncovers a secret library that remembers every lie told in power.",
        "story_card_images/04d68518-aafb-497e-995e-10bc6e4bef90.jpg",
        "#B3674E",
        "featured",
        "Featured",
        4.8,
        "Fantasy",
        "Adventure",
        "Read now",
        31,
        0,
    ),
    (
        "Wicked in the Keeps",
        "A. Vale",
        "A cursed estate awakens every time a new heir arrives, and all of them are carrying broken promises.",
        "story_card_images/0d7a36fc-c6e6-4f0d-bc13-8d027759713f.jpg",
        "#AF4B9A",
        "trending",
        "Trending",
        4.7,
        "Romance",
        "Mystery",
        "Read now",
        32,
        0,
    ),
    (
        "The Billionaire's Adopted Bride",
        "Cora Flint",
        "A runaway heiress is offered a marriage pact that could save a city from ruin.",
        "story_card_images/0f8c96aa-4d3a-4a3e-bc6d-86bd1b5be8a0.jpg",
        "#6B4FDC",
        "featured",
        "Featured",
        4.9,
        "Billionaire",
        "Romance",
        "Read now",
        33,
        0,
    ),
    (
        "Glass Harbor",
        "Iris Vell",
        "A harbor town survives a curse by turning each shipwreck into a story that can kill the liar who tells it.",
        "story_card_images/0aaa5ea7-670f-4995-8378-474c09b319b2.jpg",
        "#7FA5C3",
        "recently_updated",
        "42m ago",
        4.6,
        "Fantasy",
        "Mystery",
        "Read now",
        32,
        0,
    ),
    (
        "Second Chance Bakery",
        "Mina Vale",
        "Three strangers build a midnight bakery, but every recipe opens a forgotten memory.",
        "story_card_images/0d88ca6e-bdb9-4d45-b7f4-013f0ef843e5.jpg",
        "#C98A5E",
        "recently_completed",
        "Completed",
        4.9,
        "Romance",
        "Drama",
        "Read now",
        33,
        1,
    ),
    (
        "Ashes Beneath the Tide",
        "Dorian West",
        "A lighthouse keeper and a smuggler hunt a creature that feeds on promises made during storms.",
        "story_card_images/19eb26e8-6ee4-4010-8848-8f5779f602dd.jpg",
        "#7BA7A9",
        "recently_updated",
        "1d ago",
        4.5,
        "Horror",
        "Thriller",
        "Read now",
        34,
        0,
    ),
    (
        "The Last Sound of Autumn",
        "Arielle Cask",
        "A violinist hears one impossible melody that predicts a death before it happens.",
        "story_card_images/32b84f85-8e95-4a2d-8674-f3dc957133c8.jpg",
        "#7A8ED6",
        "recently_updated",
        "2d ago",
        4.7,
        "Literary Fiction",
        "Drama",
        "Read now",
        35,
        0,
    ),
    (
        "Velvet Circuit",
        "Ren Tallis",
        "A rebellious coder discovers the city grid is alive and wants to be rewritten by her hand.",
        "story_card_images/3379b80d-dc86-4a35-9a05-926f8b2cbbc5.jpg",
        "#3D7C8D",
        "recently_updated",
        "3d ago",
        4.4,
        "SciFi",
        "Thriller",
        "Read now",
        36,
        0,
    ),
    (
        "The Orchard of Echoes",
        "P. Rowan",
        "A botanical archivist learns each tree in the orchard is seeded with a memory not her own.",
        "story_card_images/4803aa58-6dc5-4816-b1d7-3d955156f1ca.jpg",
        "#C1A66B",
        "recently_updated",
        "4d ago",
        4.6,
        "Magical Realism",
        "Fantasy",
        "Read now",
        37,
        0,
    ),
    (
        "Hollow Moon Academy",
        "Cecilia Vale",
        "A student with a broken future enters a school where the moon itself records every secret.",
        "story_card_images/4a4f19a1-b096-4613-b635-f71e311481d1.jpg",
        "#6E6AB3",
        "recently_completed",
        "Completed",
        4.8,
        "Fantasy",
        "Young Adult",
        "Read now",
        38,
        1,
    ),
    (
        "The Blue Lantern Court",
        "Ivo Mercer",
        "An outsider must curate art for a moonlit court while a murder mystery brews in plain sight.",
        "story_card_images/5ba33f5b-f733-4dd3-a3d8-ad66dacfb093.jpg",
        "#5587BD",
        "recently_updated",
        "6d ago",
        4.5,
        "Historical Fiction",
        "Mystery",
        "Read now",
        39,
        0,
    ),
    (
        "Cinder & Crown",
        "S. Estrel",
        "A rebellious princess and a blacksmith's daughter forge a new kingdom from shattered vows.",
        "story_card_images/60bf539d-3d16-4f7b-bda6-bb0bc5bd8385.jpg",
        "#D77C72",
        "recently_updated",
        "1w ago",
        4.9,
        "Fantasy",
        "Romance",
        "Read now",
        40,
        0,
    ),
    (
        "Paper Saints",
        "Elio Aster",
        "A quiet city relies on prayer-worn relics that begin rewriting the past when the wrong person prays.",
        "story_card_images/6a5c2a85-2d8c-498d-9153-1d72ec4005e4.jpg",
        "#9C7AC3",
        "recently_updated",
        "1w ago",
        4.6,
        "Fantasy",
        "Drama",
        "Read now",
        41,
        0,
    ),
    (
        "The Lantern Cartographer",
        "Faye Nore",
        "A cartographer follows a map that changes whenever someone lies to her about home.",
        "story_card_images/7d7d5cc8-5b0a-4821-9e57-3f58c36998b0.jpg",
        "#89A39A",
        "recently_updated",
        "2w ago",
        4.7,
        "Adventure",
        "Mystery",
        "Read now",
        42,
        0,
    ),
    (
        "Iron Bloom",
        "K. Sorel",
        "In a city of growers, a mechanic discovers the metal roots under the earth are listening.",
        "story_card_images/8de846ae-c1cc-4e8b-a52e-e8aa48b6abb1.jpg",
        "#8AA9A9",
        "recently_updated",
        "2w ago",
        4.3,
        "SciFi",
        "Fantasy",
        "Read now",
        43,
        0,
    ),
    (
        "Hearthfire & Honey",
        "Lena Fox",
        "A gifted baker and a rival with a knife for a smile turn a winter market into a dangerous courtship.",
        "story_card_images/9e84fd30-5477-45f2-8c48-5c290f275856.jpg",
        "#E0A17B",
        "recently_updated",
        "3w ago",
        4.8,
        "Romance",
        "Historical Fiction",
        "Read now",
        44,
        0,
    ),
]


# Longer sample chapters (3 per seeded novel) — unique bodies per book title.
# Inserted only when a book has fewer than 3 chapters (idempotent).
SEED_CHAPTER_TEMPLATES = [
    (
        "Chapter 1: {hook}",
        (
            "The first light over {place} found {protagonist} already awake. "
            "Years of careful routine had not prepared them for the message waiting on the table — "
            "a single page that named secrets only {protagonist} and one other person in the world were supposed to know. "
            "Outside, the wind carried the smell of rain and distant fire. "
            "Inside, the clock ticked once, twice, and the decision that would rewrite every plan was made without a spoken word. "
            "By noon the city would be talking. By nightfall, nothing would be the same. "
            "This is where the story of {title} truly begins: not with a battle or a crown, but with a choice made in quiet rooms."
        ),
    ),
    (
        "Chapter 2: {mid}",
        (
            "Allies arrived in ones and twos, each carrying a different version of the truth. "
            "{protagonist} listened, sorted lies from fear, and mapped the path that led into the heart of the problem. "
            "The middle of a journey is always the hardest part: the beginning still feels reversible, the end is still a rumour. "
            "In the markets of {place}, in the archives, and in the long conversations after midnight, "
            "pieces of the larger design began to lock together. "
            "Someone had been moving the pieces for a long time. Someone else was about to knock the board over. "
            "When the second letter arrived — unsigned, but written in a hand {protagonist} recognised — "
            "the cost of continuing became clear. So did the cost of stopping."
        ),
    ),
    (
        "Chapter 3: {turn}",
        (
            "Confrontation does not always look like a fight. Sometimes it looks like a closed door, a signature, "
            "or a name spoken aloud in a room full of people who were never meant to hear it. "
            "{protagonist} walked into the final meeting of the week with nothing left to hide and everything left to lose. "
            "The rain had returned to {place}, streaking the glass and softening the edges of the skyline. "
            "What followed was not neat. Plans broke. Loyalties shifted. A single act of honesty changed more than any carefully written contract. "
            "When the chapter closed, {protagonist} stood on the far side of a line that could not be uncrossed. "
            "The rest of {title} would be written from that side of the line — and the reader, for the first time, could feel the weight of it."
        ),
    ),
]

# Per-book flavour so chapters differ across the seed novels
SEED_BOOK_FLAVOUR = {
    "River (Revised version)": {
        "protagonist": "Mara",
        "place": "the river district",
        "hook": "The Offer",
        "mid": "Rewrites and Shadows",
        "turn": "The Unsigned Page",
    },
    "Misery's Chosen": {
        "protagonist": "Mico",
        "place": "the storm-lashed coast",
        "hook": "Glowing Eyes",
        "mid": "The Shadowed Figure",
        "turn": "Chosen or Claimed",
    },
    "Goddess Tamer": {
        "protagonist": "the reborn hero",
        "place": "the hostile realm",
        "hook": "A Dangerous Bargain",
        "mid": "Chains of Divinity",
        "turn": "Taming the Storm",
    },
    "Avengard: The Fall of Senvia": {
        "protagonist": "the two survivors",
        "place": "the drowned empire",
        "hook": "Stolen Voice",
        "mid": "Across the Black Water",
        "turn": "The Fall Remembers",
    },
    "Diary Of Nobody": {
        "protagonist": "the diarist",
        "place": "the quiet rooms of memory",
        "hook": "Pages No One Should Read",
        "mid": "Ink That Bleeds",
        "turn": "The Last Entry",
    },
    "Demon King Leveling System": {
        "protagonist": "the trapped student",
        "place": "the abyss between levels",
        "hook": "System Awakens",
        "mid": "First Boss, First Lie",
        "turn": "Level Up or Burn Out",
    },
    "The Boy with the Checkered Scarf": {
        "protagonist": "the boy",
        "place": "three broken timelines",
        "hook": "The Scarf That Links",
        "mid": "Threads Across Years",
        "turn": "One Scarf, One Truth",
    },
    "The Mnemonivores": {
        "protagonist": "the memory-hunter",
        "place": "the city after sunset",
        "hook": "Creatures That Feed",
        "mid": "Stolen Hours",
        "turn": "Remember or Be Eaten",
    },
    "Gaming Cube Adventures": {
        "protagonist": "the failed streamer",
        "place": "a game that will not log out",
        "hook": "Logged In Forever",
        "mid": "NPCs With Names",
        "turn": "Quit Is Not an Option",
    },
    "The Apex Transfer": {
        "protagonist": "Elena",
        "place": "the hidden pack territories",
        "hook": "Royal Blood",
        "mid": "The Invisible Outlier",
        "turn": "Apex Claimed",
    },
    "Moonlit Glass House": {
        "protagonist": "Nora",
        "place": "the whispering manor",
        "hook": "Locked Rooms",
        "mid": "The Floor Beneath Her",
        "turn": "Glass and Bone",
    },
    "The Ember Archive": {
        "protagonist": "the scholar",
        "place": "the ash city",
        "hook": "A Library of Ash",
        "mid": "Pages That Remember",
        "turn": "Fuel for the Fire",
    },
    "Glass Harbor": {
        "protagonist": "the harbor keeper",
        "place": "the broken port",
        "hook": "The Storm in the Harbor",
        "mid": "A Story That Kills",
        "turn": "The Harbor Remembers",
    },
    "Second Chance Bakery": {
        "protagonist": "Mina",
        "place": "the midnight bakery district",
        "hook": "The Recipe That Returned",
        "mid": "Forgotten Flavours",
        "turn": "A New Dawn With Sugar",
    },
    "Ashes Beneath the Tide": {
        "protagonist": "the lighthouse keeper",
        "place": "the storm-lit shoreline",
        "hook": "The Voice in the Fog",
        "mid": "Promises in the Salt",
        "turn": "No Light, No Mercy",
    },
    "The Last Sound of Autumn": {
        "protagonist": "the violinist",
        "place": "the fading quarter",
        "hook": "The Melody Before Death",
        "mid": "Strings of Winter",
        "turn": "A Final Note",
    },
    "Velvet Circuit": {
        "protagonist": "Ren",
        "place": "the living city-grid",
        "hook": "The Pulse Below",
        "mid": "Lines That Move",
        "turn": "A Rewrite of the Grid",
    },
    "The Orchard of Echoes": {
        "protagonist": "the archivist",
        "place": "the orchard of memory",
        "hook": "Tree Without Roots",
        "mid": "Seeds of Someone Else",
        "turn": "The Orchard Speaks",
    },
    "Hollow Moon Academy": {
        "protagonist": "the student",
        "place": "the moonlit academy",
        "hook": "Broken Futures",
        "mid": "The Moon Keeps Score",
        "turn": "The Final Bell",
    },
    "The Blue Lantern Court": {
        "protagonist": "the outsider",
        "place": "the moonlit court",
        "hook": "Lanterns in the Fog",
        "mid": "A Murder in Silk",
        "turn": "The Court of Light",
    },
    "Cinder & Crown": {
        "protagonist": "the princess",
        "place": "the ruined kingdom",
        "hook": "Fire and Iron",
        "mid": "A Crown That Burns",
        "turn": "The New Throne",
    },
    "Paper Saints": {
        "protagonist": "the prayer-writer",
        "place": "the relic city",
        "hook": "Saints in Ink",
        "mid": "Prayers That Rewrite",
        "turn": "The City Named Faith",
    },
    "The Lantern Cartographer": {
        "protagonist": "Faye",
        "place": "the shifting coast",
        "hook": "A Map That Lies",
        "mid": "Where Home Moves",
        "turn": "The Landmarks of Truth",
    },
    "Iron Bloom": {
        "protagonist": "the mechanic",
        "place": "the root city",
        "hook": "Metal Roots",
        "mid": "Bloom Beneath Steel",
        "turn": "A Garden of Engines",
    },
    "Hearthfire & Honey": {
        "protagonist": "Lena",
        "place": "the winter market",
        "hook": "A Recipe for Courtship",
        "mid": "Honey Under Snow",
        "turn": "The Last Winter Feast",
    },
}

# Backward-compatible alias used by older call sites
SEED_CHAPTER_BODIES = [
    (
        "Chapter 1: The Beginning",
        "The rain had been falling since dawn, a soft continuous veil that blurred the edges of the city. "
        "A decision waited on the desk. When the door opened, the story finally moved.",
    ),
    (
        "Chapter 2: Crossroads",
        "Allies and enemies arrived with different maps of the same road. "
        "The middle of the journey is where most plans break — and where the real plan is born.",
    ),
    (
        "Chapter 3: The Turn",
        "Confrontation came quietly. A choice was made that could not be unmade. "
        "Outside, the weather changed. Inside, everything did.",
    ),
]



def _cleanup_seed_chapters_on_user_books(cursor, use_sqlite: bool) -> int:
    """Remove auto-seeded dummy chapters that were attached to user-created books."""
    removed = 0
    try:
        if use_sqlite:
            cursor.execute(
                """
                SELECT c.id FROM chapters c
                JOIN books b ON b.id = c.story_id
                WHERE b.user_id IS NOT NULL AND b.user_id != 0
                  AND (
                    c.content LIKE '%the traveller%'
                    OR c.content LIKE '%far edge of the map%'
                    OR c.title LIKE 'Chapter 1: The Beginning'
                    OR c.title LIKE 'Chapter 2: Crossroads'
                    OR c.title LIKE 'Chapter 3: The Turn'
                  )
                """
            )
        else:
            cursor.execute(
                """
                SELECT c.id FROM chapters c
                JOIN books b ON b.id = c.story_id
                WHERE b.user_id IS NOT NULL AND b.user_id != 0
                  AND (
                    c.content LIKE '%the traveller%'
                    OR c.content LIKE '%far edge of the map%'
                    OR c.title LIKE 'Chapter 1: The Beginning'
                    OR c.title LIKE 'Chapter 2: Crossroads'
                    OR c.title LIKE 'Chapter 3: The Turn'
                  )
                """
            )
        rows = cursor.fetchall() or []
        ids = []
        for r in rows:
            if isinstance(r, dict):
                ids.append(r.get("id") or list(r.values())[0])
            else:
                ids.append(r[0])
        for cid in ids:
            if use_sqlite:
                cursor.execute("DELETE FROM chapters WHERE id=?", (cid,))
            else:
                cursor.execute("DELETE FROM chapters WHERE id=%s", (cid,))
            removed += 1
    except Exception:
        pass
    return removed

def _seed_long_chapters_for_books(cursor, use_sqlite: bool) -> int:
    """Seed long chapters ONLY for built-in dummy/seed novels — never for user-created books."""
    inserted = 0
    seed_titles = {t[0] for t in SEED_BOOKS}  # first field is title
    seed_titles |= set(SEED_BOOK_FLAVOUR.keys())
    try:
        # Prefer selecting only seed titles; also skip rows that have a real user owner.
        cursor.execute("SELECT id, title, user_id FROM books")
        books = cursor.fetchall()
        for book in books:
            if isinstance(book, dict):
                book_id = book["id"]
                title = book.get("title") or "Untitled"
                user_id = book.get("user_id")
            else:
                book_id = book[0]
                title = book[1] if len(book) > 1 else "Untitled"
                user_id = book[2] if len(book) > 2 else None

            # Only seed dummy content for known seed novels without a user owner.
            if title not in seed_titles:
                continue
            if user_id not in (None, 0, "0", ""):
                # Owned by a logged-in author — never auto-generate chapters
                continue

            if use_sqlite:
                cursor.execute("SELECT COUNT(*) FROM chapters WHERE story_id=?", (book_id,))
            else:
                cursor.execute("SELECT COUNT(*) FROM chapters WHERE story_id=%s", (book_id,))
            row = cursor.fetchone()
            if isinstance(row, dict):
                count = int(list(row.values())[0])
            else:
                count = int(row[0])
            if count >= 3:
                continue

            flavour = SEED_BOOK_FLAVOUR.get(title) or {
                "protagonist": "the traveller",
                "place": "the far edge of the map",
                "hook": "The Beginning",
                "mid": "Crossroads",
                "turn": "The Turn",
            }
            for i, (title_tmpl, body_tmpl) in enumerate(SEED_CHAPTER_TEMPLATES, start=1):
                ch_title = title_tmpl.format(
                    hook=flavour["hook"],
                    mid=flavour["mid"],
                    turn=flavour["turn"],
                )
                body = body_tmpl.format(
                    protagonist=flavour["protagonist"],
                    place=flavour["place"],
                    title=title,
                )
                if use_sqlite:
                    cursor.execute(
                        "SELECT id FROM chapters WHERE story_id=? AND chapter_number=? LIMIT 1",
                        (book_id, i),
                    )
                    if cursor.fetchone() is not None:
                        continue
                    try:
                        cursor.execute(
                            """
                            INSERT INTO chapters (story_id, chapter_number, title, content, sort_order, submission_status)
                            VALUES (?, ?, ?, ?, ?, ?)
                            """,
                            (book_id, i, ch_title, body, i, "published"),
                        )
                    except Exception:
                        cursor.execute(
                            """
                            INSERT INTO chapters (story_id, chapter_number, title, content, sort_order)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (book_id, i, ch_title, body, i),
                        )
                else:
                    cursor.execute(
                        "SELECT id FROM chapters WHERE story_id=%s AND chapter_number=%s LIMIT 1",
                        (book_id, i),
                    )
                    if cursor.fetchone() is not None:
                        continue
                    try:
                        cursor.execute(
                            """
                            INSERT INTO chapters (story_id, chapter_number, title, content, sort_order, submission_status)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            """,
                            (book_id, i, ch_title, body, i, "published"),
                        )
                    except Exception:
                        cursor.execute(
                            """
                            INSERT INTO chapters (story_id, chapter_number, title, content, sort_order)
                            VALUES (%s, %s, %s, %s, %s)
                            """,
                            (book_id, i, ch_title, body, i),
                        )
                inserted += 1
    except Exception:
        pass
    return inserted



SEED_NOTIFICATIONS = [
    ("Story", "New chapter available", "A story you follow just published a new chapter. Open Discover to read it.", "Just now", 1),
    ("Story", "Story recommendation", "Based on your library, try these trending stories this week.", "1h ago", 2),
    ("Community", "Welcome to the community", "Follow authors and join discussions to see updates here.", "Today", 1),
    ("Community", "Author reply", "An author replied to a comment on a story you liked.", "Yesterday", 2),
    ("System", "Inkitt", "Earn some karma. Help this author today by reading their story!", "Tue Apr 19:11", 1),
    ("System", "App update", "Content refreshed. Pull to refresh Discover for the latest stories.", "Now", 2),
]

SEED_MENU_ITEMS = [
    ("Profile", 1, "My Profile", "person", "profile", 1),
    ("Profile", 1, "Reading Stats", "bar_chart", "stats", 2),
    ("Community", 2, "Groups", "groups", "groups", 1),
    ("Support", 3, "Help Center", "help", "help", 1),
    ("Support", 3, "Contact Us", "chat", "contact", 2),
    ("Settings", 4, "Notifications", "notifications", "notifications", 1),
    ("Settings", 4, "App Language", "language", "language", 2),
    ("Settings", 4, "Favourite Genres", "favorite", "genres", 3),
    ("Settings", 4, "AI Content Review", "auto_awesome", "ai-review", 4),
    ("Settings", 4, "Content Warnings", "warning", "warnings", 5),
    ("Legal", 5, "Manage Cookie Preferences", "cookie", "cookies", 1),
    ("Legal", 5, "Terms of Service", "description", "terms", 2),
    ("Legal", 5, "Privacy Policy", "lock", "privacy", 3),
    ("Change Accounts", 6, "Sign Out", "logout", "logout", 1),
]

SEED_READING_LISTS = [
    (1, "Currently Reading", 2, "story_card_images/8de846ae-c1cc-4e8b-a52e-e8aa48b6abb1.jpg", 1),
    (1, "Archived / Finished Books", 0, "story_card_images/6290b4c8-83e9-4d5d-a740-06d4ec94d335.jpg", 2),
]

SEED_ACHIEVEMENTS = [
    ("Lifetime Reviews Given", 1, "Reviewer-in-Training", "0/1 Reviews Left", "0/1 Reviews Left", "1", "silver", 1),
    ("Lifetime Reviews Given", 1, "Community Voice", "0/2 Reviews Left", "0/2 Reviews Left", "2", "silver", 2),
    ("Lifetime Reviews Given", 1, "Story Critic", "0/3 Reviews Left", "0/3 Reviews Left", "3", "silver", 3),
    ("Lifetime Words Published", 2, "Ink Sprout", "0/1000 Words Published", "0/1000 Words Published", "1000", "dark", 1),
    ("Lifetime Words Published", 2, "Wordsmith", "0/5000 Words Published", "0/5000 Words Published", "5000", "dark", 2),
    ("Lifetime Words Published", 2, "Pen Prodigy", "0/10000 Words Published", "0/10000 Words Published", "10000", "dark", 3),
    ("Lifetime Reading", 3, "Page Flipper", "0/2 Chapters Read", "0/2 Chapters Read", "2", "ink", 1),
    ("Lifetime Reading", 3, "Book Explorer", "0/5 Chapters Read", "0/5 Chapters Read", "5", "ink", 2),
    ("Lifetime Reading", 3, "Reading Enthusiast", "0/10 Chapters Read", "0/10 Chapters Read", "10", "ink", 3),
]


def _to_db_query(query: str) -> str:
    return query.replace("%s", "?") if USE_SQLITE else query


def _sqlite_table_exists(cursor, table_name: str) -> bool:
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None


def _sqlite_column_exists(cursor, table_name: str, column_name: str) -> bool:
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def _split_sql_statements(sql_content: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_string = False
    string_char = ""

    for index, char in enumerate(sql_content):
        if char in ('"', "'") and (index == 0 or sql_content[index - 1] != "\\"):
            if not in_string:
                in_string = True
                string_char = char
            elif char == string_char:
                in_string = False

        if char == ";" and not in_string:
            statement = "".join(current).strip()
            if statement and not statement.startswith("--"):
                statements.append(statement)
            current = []
        else:
            current.append(char)

    return statements


def _ensure_database_exists() -> None:
    """Create the target database if it does not exist yet."""
    # Managed database add-ons provide an already-created database in MYSQL_URL;
    # their application user may not have privileges to CREATE DATABASE.
    if os.getenv("MYSQL_URL", "").strip():
        return
    settings = mysql_connection_settings(include_database=False)
    db_name = os.getenv("MYSQL_DATABASE", "").strip()
    if not db_name and os.getenv("MYSQL_URL", "").strip():
        db_name = unquote(urlsplit(os.environ["MYSQL_URL"]).path.lstrip("/"))
    db_name = db_name or "defaultdb"
    if mysql_connector is None:
        raise RuntimeError("mysql.connector is not installed; install mysql-connector-python to use MySQL mode")

    try:
        connection = mysql_connector.connect(**settings)
        cursor = connection.cursor()
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        connection.commit()
        cursor.close()
        connection.close()
    except MYSQL_ERROR as exc:
        # If we cannot even connect without a database, re-raise.
        raise exc


def initialize_database_if_needed() -> bool:
    """Initialize schema/seed data on startup when required tables are missing."""
    init_sql = os.getenv("MYSQL_INIT_SQL", "setup_railway.sql")
    sql_path = Path(__file__).resolve().parents[1] / "sql" / init_sql

    if not sql_path.exists():
        raise FileNotFoundError(f"Init SQL file not found: {sql_path}")

    _ensure_database_exists()

    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute("SHOW TABLES")
    existing_tables = {row[0] for row in cursor.fetchall()}

    if REQUIRED_TABLES.issubset(existing_tables):
        cursor.close()
        connection.close()
        return False

    sql_content = sql_path.read_text(encoding="utf-8")
    statements = _split_sql_statements(sql_content)

    cursor.execute("SET FOREIGN_KEY_CHECKS=0")

    for statement in statements:
        try:
            cursor.execute(statement)
        except MYSQL_ERROR as exc:
            # Ignore idempotent creation/seed issues to support partial environments.
            if getattr(exc, 'errno', None) not in (1050, 1062):
                cursor.execute("SET FOREIGN_KEY_CHECKS=1")
                connection.rollback()
                cursor.close()
                connection.close()
                raise

    cursor.execute("SET FOREIGN_KEY_CHECKS=1")
    connection.commit()
    cursor.close()
    connection.close()
    return True


def _create_sqlite_schema(connection) -> None:
    cursor = connection.cursor()
    cursor.executescript(
        """
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            topic_count INTEGER NOT NULL DEFAULT 0,
            tab_group TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT NOT NULL,
            description TEXT NOT NULL,
            cover_path TEXT NOT NULL DEFAULT '',
            accent_hex TEXT NOT NULL DEFAULT '#808080',
            section_name TEXT NOT NULL,
            status_text TEXT NOT NULL DEFAULT '',
            rating REAL NOT NULL DEFAULT 0,
            genre TEXT NOT NULL DEFAULT '',
            primary_genre TEXT NOT NULL DEFAULT '',
            secondary_genre TEXT NOT NULL DEFAULT '',
            is_completed INTEGER NOT NULL DEFAULT 0,
            cta_label TEXT NOT NULL DEFAULT 'Read now',
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            story_id INTEGER NOT NULL,
            chapter_number INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (story_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS library_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            reading_status TEXT NOT NULL,
            updated_text TEXT NOT NULL,
            chapters INTEGER NOT NULL DEFAULT 0,
            primary_genre TEXT NOT NULL,
            secondary_genre TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (book_id) REFERENCES books(id)
        );

        CREATE TABLE IF NOT EXISTS write_screen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manage_tabs TEXT NOT NULL,
            story_tabs TEXT NOT NULL,
            filter_label TEXT NOT NULL,
            sort_label TEXT NOT NULL,
            empty_title TEXT NOT NULL,
            empty_cta TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tab_name TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS menu_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_name TEXT NOT NULL,
            section_order INTEGER NOT NULL DEFAULT 0,
            label TEXT NOT NULL,
            icon_name TEXT NOT NULL,
            route_name TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            display_name TEXT NOT NULL,
            username TEXT NOT NULL,
            following INTEGER NOT NULL DEFAULT 0,
            followers INTEGER NOT NULL DEFAULT 0,
            blocked INTEGER NOT NULL DEFAULT 0,
            chapters_read INTEGER NOT NULL DEFAULT 0,
            social_karma INTEGER NOT NULL DEFAULT 0,
            day_streak INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS reading_lists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            story_count INTEGER NOT NULL DEFAULT 0,
            cover_path TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        );

        CREATE TABLE IF NOT EXISTS reading_list_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reading_list_id INTEGER NOT NULL,
            book_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reading_list_id) REFERENCES reading_lists(id) ON DELETE CASCADE,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL DEFAULT '',
            cover_path TEXT NOT NULL DEFAULT '',
            created_by_admin INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS book_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
            UNIQUE (book_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS book_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS author_follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            author_id INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES app_users(id) ON DELETE CASCADE,
            UNIQUE (user_id, author_id)
        );

        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL,
            group_order INTEGER NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            subtitle TEXT NOT NULL,
            progress_label TEXT NOT NULL,
            badge_value TEXT NOT NULL,
            style TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    connection.commit()
    cursor.close()


def _run_startup_migrations_sqlite(connection) -> dict[str, int]:
    cursor = connection.cursor()

    result = {
        "columns_added": 0,
        "tables_added": 0,
        "categories_added": 0,
        "books_added": 0,
        "assets_seeded": 0,
    }

    uploads_dir = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)

    if not _sqlite_table_exists(cursor, "app_metadata"):
        cursor.execute(
            """
            CREATE TABLE app_metadata (
                key_name TEXT PRIMARY KEY,
                key_value TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute(
        """
        INSERT INTO app_metadata (key_name, key_value)
        VALUES (?, ?)
        ON CONFLICT(key_name) DO UPDATE SET key_value = excluded.key_value
        """,
        ("content_version", str(uuid4())),
    )

    if not _sqlite_table_exists(cursor, "chapters"):
        cursor.execute(
            """
            CREATE TABLE chapters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                story_id INTEGER NOT NULL,
                chapter_number INTEGER NOT NULL DEFAULT 1,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (story_id) REFERENCES books(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_column_exists(cursor, "chapters", "notes"):
        cursor.execute("ALTER TABLE chapters ADD COLUMN notes TEXT")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "chapters", "submission_status"):
        cursor.execute("ALTER TABLE chapters ADD COLUMN submission_status TEXT NOT NULL DEFAULT 'draft'")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "chapters", "scheduled_for"):
        cursor.execute("ALTER TABLE chapters ADD COLUMN scheduled_for TEXT NULL")
        result["columns_added"] += 1

    if not _sqlite_table_exists(cursor, "chapter_revisions"):
        cursor.execute(
            """
            CREATE TABLE chapter_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                notes TEXT,
                submission_status TEXT NOT NULL DEFAULT 'draft',
                scheduled_for TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "support_requests"):
        cursor.execute(
            """
            CREATE TABLE support_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                first_name TEXT NOT NULL,
                issue TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                device_type TEXT NOT NULL DEFAULT '',
                attachment_path TEXT,
                status TEXT NOT NULL DEFAULT 'open',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "app_users"):
        cursor.execute(
            """
            CREATE TABLE app_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                provider TEXT NOT NULL DEFAULT 'google',
                provider_subject TEXT,
                display_name TEXT NOT NULL,
                photo_url TEXT,
                cover_url TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                last_login_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_column_exists(cursor, "app_users", "cover_url"):
        cursor.execute("ALTER TABLE app_users ADD COLUMN cover_url TEXT")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "library_entries", "user_id"):
        cursor.execute("ALTER TABLE library_entries ADD COLUMN user_id INTEGER")
        result["columns_added"] += 1

    for column, definition in (
        ("last_chapter_number", "INTEGER DEFAULT 1"),
        ("last_paragraph_index", "INTEGER DEFAULT 0"),
        ("chapters_read", "INTEGER DEFAULT 0"),
    ):
        if not _sqlite_column_exists(cursor, "library_entries", column):
            cursor.execute(f"ALTER TABLE library_entries ADD COLUMN {column} {definition}")
            result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "books", "user_id"):
        cursor.execute("ALTER TABLE books ADD COLUMN user_id INTEGER")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "reading_lists", "user_id"):
        cursor.execute("ALTER TABLE reading_lists ADD COLUMN user_id INTEGER")
        result["columns_added"] += 1
    if not _sqlite_column_exists(cursor, "reading_lists", "description"):
        cursor.execute("ALTER TABLE reading_lists ADD COLUMN description TEXT NOT NULL DEFAULT ''")
        result["columns_added"] += 1

    if not _sqlite_table_exists(cursor, "reading_list_items"):
        cursor.execute(
            """
            CREATE TABLE reading_list_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reading_list_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (reading_list_id) REFERENCES reading_lists(id) ON DELETE CASCADE,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "tags"):
        cursor.execute(
            """
            CREATE TABLE tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_by_admin INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "book_tags"):
        cursor.execute(
            """
            CREATE TABLE book_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
                UNIQUE (book_id, tag_id)
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "book_reviews"):
        cursor.execute(
            """
            CREATE TABLE book_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "chapter_comments"):
        cursor.execute(
            """
            CREATE TABLE chapter_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chapter_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    
    if not _sqlite_table_exists(cursor, "story_reports"):
        cursor.execute(
            """
            CREATE TABLE story_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_id, user_id),
                FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    
    if not _sqlite_table_exists(cursor, "chapter_reactions"):
        cursor.execute(
            """
            CREATE TABLE chapter_reactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id INTEGER NOT NULL,
                chapter_number INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                label TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(book_id, chapter_number, user_id, label)
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "author_follows"):
        cursor.execute(
            """
            CREATE TABLE author_follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES app_users(id) ON DELETE CASCADE,
                UNIQUE (user_id, author_id)
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "chat_messages"):
        cursor.execute(
            """
            CREATE TABLE chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                sender TEXT NOT NULL DEFAULT 'user',
                message TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_table_exists(cursor, "book_shares"):
        cursor.execute(
            """
            CREATE TABLE book_shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                book_id INTEGER NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    if not _sqlite_column_exists(cursor, "support_requests", "device_type"):
        cursor.execute("ALTER TABLE support_requests ADD COLUMN device_type TEXT NOT NULL DEFAULT ''")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "support_requests", "attachment_path"):
        cursor.execute("ALTER TABLE support_requests ADD COLUMN attachment_path TEXT")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "books", "primary_genre"):
        cursor.execute("ALTER TABLE books ADD COLUMN primary_genre TEXT NOT NULL DEFAULT ''")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "books", "secondary_genre"):
        cursor.execute("ALTER TABLE books ADD COLUMN secondary_genre TEXT NOT NULL DEFAULT ''")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "books", "is_completed"):
        cursor.execute("ALTER TABLE books ADD COLUMN is_completed INTEGER NOT NULL DEFAULT 0")
        result["columns_added"] += 1

    if not _sqlite_column_exists(cursor, "books", "content_warnings"):
        cursor.execute("ALTER TABLE books ADD COLUMN content_warnings TEXT")
        result["columns_added"] += 1

    cursor.execute("UPDATE books SET primary_genre = genre WHERE primary_genre = '' OR primary_genre IS NULL")

    cursor.execute("SELECT id, cover_path FROM books WHERE cover_path LIKE ?", ("story_card_images/%",))
    for row in cursor.fetchall():
        book_id = row[0]
        cover_path = row[1]
        new_cover = "/uploads/" + Path(cover_path).name
        cursor.execute("UPDATE books SET cover_path = ? WHERE id = ?", (new_cover, book_id))

    for name, topic_count, tab_group, sort_order in SEED_CATEGORIES:
        cursor.execute(
            "SELECT id FROM categories WHERE name=? AND tab_group=? LIMIT 1",
            (name, tab_group),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO categories (name, topic_count, tab_group, sort_order) VALUES (?, ?, ?, ?)",
                (name, topic_count, tab_group, sort_order),
            )
            result["categories_added"] += 1

    for (
        title,
        author,
        description,
        cover_path,
        accent_hex,
        section_name,
        status_text,
        rating,
        primary_genre,
        secondary_genre,
        cta_label,
        sort_order,
        is_completed,
    ) in SEED_BOOKS:
        cursor.execute("SELECT id FROM books WHERE title=? LIMIT 1", (title,))
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO books (
                    title, author, description, cover_path, accent_hex, section_name, status_text,
                    rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    title,
                    author,
                    description,
                    cover_path,
                    accent_hex,
                    section_name,
                    status_text,
                    rating,
                    primary_genre,
                    primary_genre,
                    secondary_genre,
                    cta_label,
                    sort_order,
                    is_completed,
                ),
            )
            result["books_added"] += 1

    # Clear broken cover paths that point to missing files (e.g. story3.jpg)
    cursor.execute(
        """
        UPDATE books SET cover_path = ''
        WHERE cover_path LIKE 'story%.jpg'
           OR cover_path LIKE '/uploads/story%.jpg'
           OR cover_path LIKE 'uploads/story%.jpg'
        """
    )

    for tab_name, title, message, created_at, sort_order in SEED_NOTIFICATIONS:
        cursor.execute(
            "SELECT id FROM notifications WHERE tab_name=? AND title=? LIMIT 1",
            (tab_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO notifications (tab_name, title, message, created_at, sort_order) VALUES (?, ?, ?, ?, ?)",
                (tab_name, title, message, created_at, sort_order),
            )

    # Seed default menu items and achievements for the More/Explore UI (SQLite)
    SEED_MENU_ITEMS_SQLITE = [
        ("Profile", 1, "My Profile", "person", "profile", 1),
        ("Community", 2, "Groups", "groups", "groups", 1),
        ("Support", 3, "Help Center", "help", "help", 1),
        ("Support", 3, "Contact Us", "chat", "contact", 2),
        ("Settings", 4, "Notifications", "notifications", "notifications", 1),
    ]
    for section_name, section_order, label, icon_name, route_name, sort_order in SEED_MENU_ITEMS_SQLITE:
        cursor.execute(
            "SELECT id FROM menu_items WHERE section_name=? AND label=? LIMIT 1",
            (section_name, label),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO menu_items (section_name, section_order, label, icon_name, route_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                (section_name, section_order, label, icon_name, route_name, sort_order),
            )

    SEED_ACHIEVEMENTS_SQLITE = [
        ("Engagement", 1, "First Read", "Read your first chapter", "1/1", "badge", 1),
        ("Milestones", 2, "10 Chapters", "Read 10 chapters", "10/10", "badge", 1),
    ]
    for group_name, group_order, title, subtitle, progress_label, style, sort_order in SEED_ACHIEVEMENTS_SQLITE:
        cursor.execute(
            "SELECT id FROM achievements WHERE group_name=? AND title=? LIMIT 1",
            (group_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO achievements (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (group_name, group_order, title, subtitle, progress_label, progress_label, style, sort_order),
            )

    for section_name, section_order, label, icon_name, route_name, sort_order in SEED_MENU_ITEMS:
        cursor.execute(
            "SELECT id FROM menu_items WHERE section_name=? AND label=? LIMIT 1",
            (section_name, label),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO menu_items (section_name, section_order, label, icon_name, route_name, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                (section_name, section_order, label, icon_name, route_name, sort_order),
            )

    cursor.execute("SELECT id FROM write_screen LIMIT 1")
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO write_screen (manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta) VALUES (?, ?, ?, ?, ?, ?)",
            ("Drafts,Published", "Submitted,Drafts", "Filter", "Sort", "Nothing here yet", "Create story"),
        )

    cursor.execute("SELECT id FROM profiles LIMIT 1")
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO profiles (display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ("Guest User", "guest", 0, 0, 0, 0, 0, 0),
        )

    # Ensure there's at least one sample reading list associated with the default profile (SQLite)
    cursor.execute("SELECT id FROM profiles LIMIT 1")
    profile_row = cursor.fetchone()
    profile_id = profile_row[0] if profile_row is not None else 1
    cursor.execute("SELECT id FROM reading_lists WHERE name=? LIMIT 1", ("__disabled_seed_hello__",))
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO reading_lists (profile_id, name, story_count, cover_path, sort_order) VALUES (?, ?, ?, ?, ?)",
            (profile_id, "__disabled_seed_hello__", 0, "", 1),
        )

    for profile_id, name, story_count, cover_path, sort_order in SEED_READING_LISTS:
        cursor.execute(
            "SELECT id FROM reading_lists WHERE profile_id=? AND name=? LIMIT 1",
            (profile_id, name),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO reading_lists (profile_id, name, story_count, cover_path, sort_order) VALUES (?, ?, ?, ?, ?)",
                (profile_id, name, story_count, cover_path, sort_order),
            )

    for group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order in SEED_ACHIEVEMENTS:
        cursor.execute(
            "SELECT id FROM achievements WHERE group_name=? AND title=? LIMIT 1",
            (group_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO achievements (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order),
            )

    static_story_dir = Path(__file__).resolve().parents[2] / "story_card_images"
    if static_story_dir.exists():
        for image_path in sorted(static_story_dir.glob("*")):
            if not image_path.is_file():
                continue
            extension = image_path.suffix.lower()
            if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue

            target_path = uploads_dir / image_path.name
            if target_path.exists():
                continue

            target_path.write_bytes(image_path.read_bytes())
            result["assets_seeded"] += 1


    try:
        result["chapters_seeded"] = _seed_long_chapters_for_books(cursor, use_sqlite=True)
        result["chapters_cleaned"] = _cleanup_seed_chapters_on_user_books(cursor, use_sqlite=True)
    except Exception:
        result["chapters_seeded"] = 0

    connection.commit()
    cursor.close()
    return result


def run_startup_migrations() -> dict[str, int]:
    """Apply lightweight, idempotent migrations and baseline seed content."""
    if USE_SQLITE:
        connection = get_connection()
        result = _run_startup_migrations_sqlite(connection)
        connection.close()
        return result

    connection = get_connection()
    cursor = connection.cursor()

    result = {
        "columns_added": 0,
        "tables_added": 0,
        "categories_added": 0,
        "books_added": 0,
        "assets_seeded": 0,
    }

    uploads_dir = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
    uploads_dir.mkdir(parents=True, exist_ok=True)

    cursor.execute("SHOW TABLES LIKE 'app_metadata'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE app_metadata (
                key_name VARCHAR(100) PRIMARY KEY,
                key_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute(
        """
        INSERT INTO app_metadata (key_name, key_value)
        VALUES ('content_version', %s)
        ON DUPLICATE KEY UPDATE key_value = key_value
        """,
        (str(uuid4()),),
    )

    cursor.execute("SHOW TABLES LIKE 'chapters'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE chapters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                story_id INT NOT NULL,
                chapter_number INT NOT NULL DEFAULT 1,
                title VARCHAR(255) NOT NULL,
                content LONGTEXT NOT NULL,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_chapter_story FOREIGN KEY (story_id) REFERENCES books(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute("SHOW COLUMNS FROM chapters LIKE 'notes'")
    if cursor.fetchone() is None:
        cursor.execute("ALTER TABLE chapters ADD COLUMN notes TEXT NULL AFTER content")
        result["columns_added"] += 1

    cursor.execute("SHOW COLUMNS FROM chapters LIKE 'submission_status'")
    if cursor.fetchone() is None:
        cursor.execute(
            "ALTER TABLE chapters ADD COLUMN submission_status VARCHAR(40) NOT NULL DEFAULT 'draft' AFTER notes"
        )
        result["columns_added"] += 1

    cursor.execute("SHOW COLUMNS FROM chapters LIKE 'scheduled_for'")
    if cursor.fetchone() is None:
        cursor.execute("ALTER TABLE chapters ADD COLUMN scheduled_for DATETIME NULL AFTER submission_status")
        result["columns_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'chapter_revisions'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE chapter_revisions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chapter_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                content LONGTEXT NOT NULL,
                notes TEXT NULL,
                submission_status VARCHAR(40) NOT NULL DEFAULT 'draft',
                scheduled_for DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_revision_chapter FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'support_requests'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE support_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                first_name VARCHAR(120) NOT NULL,
                issue VARCHAR(120) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                device_type VARCHAR(120) NOT NULL DEFAULT '',
                attachment_path TEXT NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'app_users'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE app_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                provider VARCHAR(40) NOT NULL DEFAULT 'google',
                provider_subject VARCHAR(255) NULL,
                display_name VARCHAR(255) NOT NULL,
                photo_url TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_login_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        result["tables_added"] += 1

    # Allow guest/email users without a provider subject (nullable).
    cursor.execute("SHOW COLUMNS FROM app_users LIKE 'provider_subject'")
    if cursor.fetchone() is not None:
        cursor.execute(
            "ALTER TABLE app_users MODIFY provider_subject VARCHAR(255) NULL"
        )
        result["columns_added"] += 1

    # Add user_id to library_entries so each user has their own library.
    cursor.execute("SHOW COLUMNS FROM library_entries LIKE 'user_id'")
    if cursor.fetchone() is None:
        cursor.execute(
            "ALTER TABLE library_entries ADD COLUMN user_id INT NULL AFTER id"
        )
        result["columns_added"] += 1

    # Add user_id to books so writer stories are scoped to the author.
    cursor.execute("SHOW COLUMNS FROM books LIKE 'user_id'")
    if cursor.fetchone() is None:
        cursor.execute("ALTER TABLE books ADD COLUMN user_id INT NULL AFTER id")
        result["columns_added"] += 1

    # Add user_id to reading_lists so lists are per-user.
    cursor.execute("SHOW COLUMNS FROM reading_lists LIKE 'user_id'")
    if cursor.fetchone() is None:
        cursor.execute(
            "ALTER TABLE reading_lists ADD COLUMN user_id INT NULL AFTER id"
        )
        result["columns_added"] += 1

    cursor.execute("SHOW COLUMNS FROM reading_lists LIKE 'description'")
    if cursor.fetchone() is None:
        cursor.execute(
            "ALTER TABLE reading_lists ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT ''"
        )
        result["columns_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'chapter_comments'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE chapter_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chapter_id INT NOT NULL,
                book_id INT NOT NULL,
                user_id INT NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_cc_chapter (chapter_id),
                INDEX idx_cc_book (book_id),
                INDEX idx_cc_user (user_id)
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'story_reports'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE story_reports (
                id INT AUTO_INCREMENT PRIMARY KEY,
                book_id INT NOT NULL,
                user_id INT NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_story_report (book_id, user_id),
                INDEX (book_id),
                INDEX (user_id)
            )
            """
        )
        result["tables_added"] += 1

    cursor.execute("SHOW TABLES LIKE 'chapter_reactions'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE chapter_reactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                book_id INT NOT NULL,
                chapter_number INT NOT NULL,
                user_id INT NOT NULL,
                label VARCHAR(64) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_ch_react (book_id, chapter_number, user_id, label),
                INDEX (book_id, chapter_number)
            )
            """
        )
        result["tables_added"] += 1

    # Chat history table for the in-app support/contact chat.
    cursor.execute("SHOW TABLES LIKE 'chat_messages'")
    if cursor.fetchone() is None:
        cursor.execute(
            """
            CREATE TABLE chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                sender VARCHAR(40) NOT NULL DEFAULT 'user',
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
            )
            """
        )
        result["tables_added"] += 1

    support_columns = {
        "device_type": "ALTER TABLE support_requests ADD COLUMN device_type VARCHAR(120) NOT NULL DEFAULT ''",
        "attachment_path": "ALTER TABLE support_requests ADD COLUMN attachment_path TEXT NULL",
    }

    for column, alter_sql in support_columns.items():
        cursor.execute(f"SHOW COLUMNS FROM support_requests LIKE '{column}'")
        if cursor.fetchone() is None:
            cursor.execute(alter_sql)
            result["columns_added"] += 1

    book_columns = {
        "primary_genre": "ALTER TABLE books ADD COLUMN primary_genre VARCHAR(80) NOT NULL DEFAULT ''",
        "secondary_genre": "ALTER TABLE books ADD COLUMN secondary_genre VARCHAR(80) NOT NULL DEFAULT ''",
        "is_completed": "ALTER TABLE books ADD COLUMN is_completed TINYINT(1) NOT NULL DEFAULT 0",
        "content_warnings": "ALTER TABLE books ADD COLUMN content_warnings VARCHAR(2000) NULL",
    }

    for column, alter_sql in book_columns.items():
        try:
            cursor.execute(f"SHOW COLUMNS FROM books LIKE '{column}'")
            if cursor.fetchone() is None:
                cursor.execute(alter_sql)
                result["columns_added"] += 1
        except Exception as col_exc:
            # MySQL may reject TEXT DEFAULT; retry without default
            try:
                if "content_warnings" in column:
                    cursor.execute(
                        "ALTER TABLE books ADD COLUMN content_warnings VARCHAR(2000) NULL"
                    )
                    result["columns_added"] += 1
                else:
                    raise col_exc
            except Exception:
                # Column may already exist or engine difference — non-fatal
                pass

    # section_name was ENUM('featured','recently_updated','recently_completed') which
    # rejects Inkitt values like 'trending'. Widen to VARCHAR so seed + home feed work.
    try:
        cursor.execute("SHOW COLUMNS FROM books LIKE 'section_name'")
        col = cursor.fetchone()
        col_type = ""
        if col is not None:
            if isinstance(col, dict):
                col_type = str(col.get("Type") or col.get("type") or "")
            else:
                # MySQL SHOW COLUMNS: Field, Type, Null, Key, Default, Extra
                col_type = str(col[1]) if len(col) > 1 else ""
        if col_type and "enum" in col_type.lower():
            cursor.execute(
                "ALTER TABLE books MODIFY COLUMN section_name VARCHAR(64) NOT NULL DEFAULT 'recently_updated'"
            )
            result["columns_added"] += 1
    except Exception:
        try:
            cursor.execute(
                "ALTER TABLE books MODIFY COLUMN section_name VARCHAR(64) NOT NULL DEFAULT 'recently_updated'"
            )
            result["columns_added"] += 1
        except Exception:
            pass

    cursor.execute(
        "UPDATE books SET primary_genre = genre WHERE (primary_genre = '' OR primary_genre IS NULL)"
    )
    cursor.execute(
        """
        UPDATE books
        SET cover_path = CONCAT('/uploads/', SUBSTRING_INDEX(cover_path, '/', -1))
        WHERE cover_path LIKE 'story_card_images/%'
        """
    )

    for name, topic_count, tab_group, sort_order in SEED_CATEGORIES:
        cursor.execute(
            "SELECT id FROM categories WHERE name=%s AND tab_group=%s LIMIT 1",
            (name, tab_group),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO categories (name, topic_count, tab_group, sort_order) VALUES (%s, %s, %s, %s)",
                (name, topic_count, tab_group, sort_order),
            )
            result["categories_added"] += 1

    for (
        title,
        author,
        description,
        cover_path,
        accent_hex,
        section_name,
        status_text,
        rating,
        primary_genre,
        secondary_genre,
        cta_label,
        sort_order,
        is_completed,
    ) in SEED_BOOKS:
        cursor.execute("SELECT id FROM books WHERE title=%s LIMIT 1", (title,))
        if cursor.fetchone() is None:
            cursor.execute(
                """
                INSERT INTO books (
                    title, author, description, cover_path, accent_hex, section_name, status_text,
                    rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    title,
                    author,
                    description,
                    cover_path,
                    accent_hex,
                    section_name,
                    status_text,
                    rating,
                    primary_genre,
                    primary_genre,
                    secondary_genre,
                    cta_label,
                    sort_order,
                    is_completed,
                ),
            )
            result["books_added"] += 1

    cursor.execute(
        """
        UPDATE books SET cover_path = ''
        WHERE cover_path LIKE 'story%.jpg'
           OR cover_path LIKE '/uploads/story%.jpg'
           OR cover_path LIKE 'uploads/story%.jpg'
        """
    )

    for tab_name, title, message, created_at, sort_order in SEED_NOTIFICATIONS:
        cursor.execute(
            "SELECT id FROM notifications WHERE tab_name=%s AND title=%s LIMIT 1",
            (tab_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO notifications (tab_name, title, message, created_at, sort_order) VALUES (%s, %s, %s, %s, %s)",
                (tab_name, title, message, created_at, sort_order),
            )

    # Seed default menu items and achievements for the More/Explore UI (MySQL)
    SEED_MENU_ITEMS_MYSQL = [
        ("Profile", 1, "My Profile", "person", "profile", 1),
        ("Community", 2, "Groups", "groups", "groups", 1),
        ("Support", 3, "Help Center", "help", "help", 1),
        ("Support", 3, "Contact Us", "chat", "contact", 2),
        ("Settings", 4, "Notifications", "notifications", "notifications", 1),
    ]
    for section_name, section_order, label, icon_name, route_name, sort_order in SEED_MENU_ITEMS_MYSQL:
        cursor.execute(
            "SELECT id FROM menu_items WHERE section_name=%s AND label=%s LIMIT 1",
            (section_name, label),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO menu_items (section_name, section_order, label, icon_name, route_name, sort_order) VALUES (%s, %s, %s, %s, %s, %s)",
                (section_name, section_order, label, icon_name, route_name, sort_order),
            )

    SEED_ACHIEVEMENTS_MYSQL = [
        ("Engagement", 1, "First Read", "Read your first chapter", "1/1", "badge", 1),
        ("Milestones", 2, "10 Chapters", "Read 10 chapters", "10/10", "badge", 1),
    ]
    for group_name, group_order, title, subtitle, progress_label, style, sort_order in SEED_ACHIEVEMENTS_MYSQL:
        cursor.execute(
            "SELECT id FROM achievements WHERE group_name=%s AND title=%s LIMIT 1",
            (group_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO achievements (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (group_name, group_order, title, subtitle, progress_label, progress_label, style, sort_order),
            )

    for section_name, section_order, label, icon_name, route_name, sort_order in SEED_MENU_ITEMS:
        cursor.execute(
            "SELECT id FROM menu_items WHERE section_name=%s AND label=%s LIMIT 1",
            (section_name, label),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO menu_items (section_name, section_order, label, icon_name, route_name, sort_order) VALUES (%s, %s, %s, %s, %s, %s)",
                (section_name, section_order, label, icon_name, route_name, sort_order),
            )

    cursor.execute("SELECT id FROM write_screen LIMIT 1")
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO write_screen (manage_tabs, story_tabs, filter_label, sort_label, empty_title, empty_cta) VALUES (%s, %s, %s, %s, %s, %s)",
            ("Drafts,Published", "Submitted,Drafts", "Filter", "Sort", "Nothing here yet", "Create story"),
        )

    cursor.execute("SELECT id FROM profiles LIMIT 1")
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO profiles (display_name, username, following, followers, blocked, chapters_read, social_karma, day_streak) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
            ("Guest User", "guest", 0, 0, 0, 0, 0, 0),
        )

    # Ensure there's at least one sample reading list associated with the default profile (MySQL)
    cursor.execute("SELECT id FROM profiles LIMIT 1")
    profile_row = cursor.fetchone()
    profile_id = profile_row[0] if profile_row is not None else 1
    cursor.execute("SELECT id FROM reading_lists WHERE name=%s LIMIT 1", ("__disabled_seed_hello__",))
    if cursor.fetchone() is None:
        cursor.execute(
            "INSERT INTO reading_lists (profile_id, name, story_count, cover_path, sort_order) VALUES (%s, %s, %s, %s, %s)",
            (profile_id, "__disabled_seed_hello__", 0, "", 1),
        )

    for profile_id, name, story_count, cover_path, sort_order in SEED_READING_LISTS:
        cursor.execute(
            "SELECT id FROM reading_lists WHERE profile_id=%s AND name=%s LIMIT 1",
            (profile_id, name),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO reading_lists (profile_id, name, story_count, cover_path, sort_order) VALUES (%s, %s, %s, %s, %s)",
                (profile_id, name, story_count, cover_path, sort_order),
            )

    for group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order in SEED_ACHIEVEMENTS:
        cursor.execute(
            "SELECT id FROM achievements WHERE group_name=%s AND title=%s LIMIT 1",
            (group_name, title),
        )
        if cursor.fetchone() is None:
            cursor.execute(
                "INSERT INTO achievements (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (group_name, group_order, title, subtitle, progress_label, badge_value, style, sort_order),
            )

    static_story_dir = Path(__file__).resolve().parents[2] / "story_card_images"
    if static_story_dir.exists():
        for image_path in sorted(static_story_dir.glob("*")):
            if not image_path.is_file():
                continue
            extension = image_path.suffix.lower()
            if extension not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue

            target_path = uploads_dir / image_path.name
            if target_path.exists():
                continue

            target_path.write_bytes(image_path.read_bytes())
            result["assets_seeded"] += 1


    try:
        result["chapters_seeded"] = _seed_long_chapters_for_books(cursor, use_sqlite=False)
        result["chapters_cleaned"] = _cleanup_seed_chapters_on_user_books(cursor, use_sqlite=False)
    except Exception:
        result["chapters_seeded"] = 0

    connection.commit()
    cursor.close()
    connection.close()
    return result
def get_connection():
    if mysql_connector is None:
        raise RuntimeError("mysql.connector is not installed; install mysql-connector-python to use MySQL mode")

    # Vercel's serverless workers should open short lived connections. On the
    # VPS, reuse MySQL connections between requests instead of handshaking for
    # every query.
    on_vercel = bool(os.getenv("VERCEL") or os.getenv("VERCEL_ENV"))
    if on_vercel:
        kwargs = {
            **mysql_connection_settings(include_database=True),
            "connection_timeout": int(os.getenv("MYSQL_CONNECT_TIMEOUT", "5")),
            "read_timeout": int(os.getenv("MYSQL_READ_TIMEOUT", "12")),
            "write_timeout": int(os.getenv("MYSQL_WRITE_TIMEOUT", "12")),
            "autocommit": True,
        }
        last_error = None
        retries = max(1, int(os.getenv("MYSQL_CONNECT_RETRIES", "1")))
        for attempt in range(retries):
            try:
                try:
                    return mysql_connector.connect(**kwargs)
                except TypeError:
                    kwargs.pop("read_timeout", None)
                    kwargs.pop("write_timeout", None)
                    return mysql_connector.connect(**kwargs)
            except Exception as exc:
                last_error = exc
                if attempt + 1 < retries:
                    time.sleep(0.25 * (attempt + 1))
        raise last_error

    # Reuse a small set of database connections. Opening a new MySQL+TLS
    # connection for every SELECT adds latency to endpoints that issue several
    # queries (and causes needless connection churn on the VPS).
    global _MYSQL_CONNECTION_POOL
    if _MYSQL_CONNECTION_POOL is None:
        with _MYSQL_CONNECTION_POOL_LOCK:
            if _MYSQL_CONNECTION_POOL is None:
                pool_size = max(1, min(32, int(os.getenv("MYSQL_POOL_SIZE", "20"))))
                _MYSQL_CONNECTION_POOL = MySQLConnectionPool(
                    pool_name="novelhub_api_pool",
                    pool_size=pool_size,
                    pool_reset_session=True,
                    **{
                        **mysql_connection_settings(include_database=True),
                        "connection_timeout": int(os.getenv("MYSQL_CONNECT_TIMEOUT", "8")),
                        "read_timeout": int(os.getenv("MYSQL_READ_TIMEOUT", "25")),
                        "write_timeout": int(os.getenv("MYSQL_WRITE_TIMEOUT", "25")),
                        "autocommit": True,
                    },
                )

    pool = _MYSQL_CONNECTION_POOL
    if pool is None:
        raise RuntimeError("MySQL connection pool was not initialized")
    deadline = time.monotonic() + 5.0
    while True:
        try:
            return pool.get_connection()
        except mysql_connector.errors.PoolError:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise
            time.sleep(min(0.05, remaining))


_MYSQL_CONNECTION_POOL = None
_MYSQL_CONNECTION_POOL_LOCK = threading.Lock()

def ensure_discover_catalog_seed(min_public_books: int = 18) -> dict[str, int | bool]:
    """Ensure a healthy discover catalog even if the DB already has some books.

    This is intentionally broader than "empty DB" detection so a stale local DB with
    only a few old seed rows still gets diverse public stories, chapters, and covers.
    It also refreshes the known seed titles when they already exist so stale old covers
    and summaries are replaced with the current seeded copy.
    """
    result: dict[str, int | bool] = {"books_added": 0, "chapters_seeded": 0, "changed": False}
    connection = get_connection()
    cursor = connection.cursor()
    try:
        use_sqlite = USE_SQLITE

        # Clean duplicate discover categories without touching real user data.
        try:
            if use_sqlite:
                cursor.execute("SELECT id, name, tab_group, sort_order FROM categories")
            else:
                cursor.execute("SELECT id, name, tab_group, sort_order FROM categories")
            rows = cursor.fetchall()
            seen_keys: set[tuple[str, str]] = set()
            for row in rows or []:
                name = row.get("name") if isinstance(row, dict) else row[0]
                tab_group = row.get("tab_group") if isinstance(row, dict) else row[2]
                key = (str(name or ""), str(tab_group or ""))
                if key in seen_keys:
                    delete_id = row.get("id") if isinstance(row, dict) else row[0]
                    if use_sqlite:
                        cursor.execute("DELETE FROM categories WHERE id=?", (delete_id,))
                    else:
                        cursor.execute("DELETE FROM categories WHERE id=%s", (delete_id,))
                else:
                    seen_keys.add(key)
        except Exception:
            pass

        try:
            if use_sqlite:
                cursor.execute(
                    "SELECT COUNT(*) FROM books WHERE status_text IS NOT NULL AND LOWER(status_text) NOT LIKE '%draft%' AND LOWER(status_text) NOT LIKE '%private%' AND LOWER(status_text) NOT LIKE '%unlisted%'"
                )
            else:
                cursor.execute(
                    "SELECT COUNT(*) FROM books WHERE COALESCE(status_text, '') NOT LIKE '%draft%' AND COALESCE(status_text, '') NOT LIKE '%private%' AND COALESCE(status_text, '') NOT LIKE '%unlisted%'"
                )
            row = cursor.fetchone()
            public_count = int((row[0] if not isinstance(row, dict) else next(iter(row.values()))))
        except Exception:
            public_count = 0

        inserted_or_refreshed = 0
        for (
            title,
            author,
            description,
            cover_path,
            accent_hex,
            section_name,
            status_text,
            rating,
            primary_genre,
            secondary_genre,
            cta_label,
            sort_order,
            is_completed,
        ) in SEED_BOOKS:
            if use_sqlite:
                cursor.execute(
                    "SELECT id, title, author, description, cover_path, accent_hex, section_name, status_text, rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed FROM books WHERE title=? LIMIT 1",
                    (title,),
                )
            else:
                cursor.execute(
                    "SELECT id, title, author, description, cover_path, accent_hex, section_name, status_text, rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed FROM books WHERE title=%s LIMIT 1",
                    (title,),
                )
            existing = cursor.fetchone()
            if existing is not None:
                current = existing.get("title") if isinstance(existing, dict) else existing[1]
                if not current:
                    continue
                if use_sqlite:
                    current_row = existing if isinstance(existing, dict) else {
                        "id": existing[0],
                        "title": existing[1],
                        "author": existing[2],
                        "description": existing[3],
                        "cover_path": existing[4],
                        "accent_hex": existing[5],
                        "section_name": existing[6],
                        "status_text": existing[7],
                        "rating": existing[8],
                        "genre": existing[9],
                        "primary_genre": existing[10],
                        "secondary_genre": existing[11],
                        "cta_label": existing[12],
                        "sort_order": existing[13],
                        "is_completed": existing[14],
                    }
                else:
                    current_row = existing if isinstance(existing, dict) else {
                        "id": existing[0],
                        "title": existing[1],
                        "author": existing[2],
                        "description": existing[3],
                        "cover_path": existing[4],
                        "accent_hex": existing[5],
                        "section_name": existing[6],
                        "status_text": existing[7],
                        "rating": existing[8],
                        "genre": existing[9],
                        "primary_genre": existing[10],
                        "secondary_genre": existing[11],
                        "cta_label": existing[12],
                        "sort_order": existing[13],
                        "is_completed": existing[14],
                    }
                stale_values = (
                    current_row.get("author") != author or
                    current_row.get("description") != description or
                    current_row.get("cover_path") != cover_path or
                    current_row.get("accent_hex") != accent_hex or
                    current_row.get("section_name") != section_name or
                    current_row.get("status_text") != status_text or
                    float(current_row.get("rating") or 0) != float(rating) or
                    current_row.get("primary_genre") != primary_genre or
                    current_row.get("secondary_genre") != secondary_genre or
                    current_row.get("cta_label") != cta_label or
                    int(current_row.get("sort_order") or 0) != int(sort_order) or
                    bool(current_row.get("is_completed") or 0) != bool(is_completed)
                )
                if stale_values:
                    book_id = current_row.get("id")
                    if use_sqlite:
                        cursor.execute(
                            """
                            UPDATE books
                            SET author=?, description=?, cover_path=?, accent_hex=?, section_name=?, status_text=?,
                                rating=?, genre=?, primary_genre=?, secondary_genre=?, cta_label=?, sort_order=?, is_completed=?
                            WHERE id=?
                            """,
                            (
                                author, description, cover_path, accent_hex, section_name, status_text,
                                rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, int(bool(is_completed)), book_id,
                            ),
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE books
                            SET author=%s, description=%s, cover_path=%s, accent_hex=%s, section_name=%s, status_text=%s,
                                rating=%s, genre=%s, primary_genre=%s, secondary_genre=%s, cta_label=%s, sort_order=%s, is_completed=%s
                            WHERE id=%s
                            """,
                            (
                                author, description, cover_path, accent_hex, section_name, status_text,
                                rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, int(bool(is_completed)), book_id,
                            ),
                        )
                    inserted_or_refreshed += 1
                    result["changed"] = True
                continue

            if use_sqlite:
                cursor.execute(
                    """
                    INSERT INTO books (
                        title, author, description, cover_path, accent_hex, section_name, status_text,
                        rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        title, author, description, cover_path, accent_hex, section_name, status_text,
                        rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                    ),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO books (
                        title, author, description, cover_path, accent_hex, section_name, status_text,
                        rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        title, author, description, cover_path, accent_hex, section_name, status_text,
                        rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                    ),
                )
            inserted_or_refreshed += 1
            result["books_added"] = int(result["books_added"]) + 1
            result["changed"] = True

        result["books_added"] = int(result["books_added"]) + int(inserted_or_refreshed > 0 and result["changed"] is True and 0)
        if int(result["books_added"]) > 0:
            try:
                result["chapters_seeded"] = _seed_long_chapters_for_books(cursor, use_sqlite=use_sqlite)
                result["chapters_cleaned"] = _cleanup_seed_chapters_on_user_books(cursor, use_sqlite=use_sqlite)
            except Exception:
                result["chapters_seeded"] = 0

        if public_count < min_public_books:
            try:
                if use_sqlite:
                    cursor.execute(
                        "SELECT COUNT(*) FROM books WHERE status_text IS NOT NULL AND LOWER(status_text) NOT LIKE '%draft%' AND LOWER(status_text) NOT LIKE '%private%' AND LOWER(status_text) NOT LIKE '%unlisted%'"
                    )
                else:
                    cursor.execute(
                        "SELECT COUNT(*) FROM books WHERE COALESCE(status_text, '') NOT LIKE '%draft%' AND COALESCE(status_text, '') NOT LIKE '%private%' AND COALESCE(status_text, '') NOT LIKE '%unlisted%'"
                    )
                check = cursor.fetchone()
                if isinstance(check, dict):
                    current_public_count = int(next(iter(check.values())))
                else:
                    current_public_count = int(check[0])
            except Exception:
                current_public_count = 0
            if current_public_count < min_public_books:
                cursor.execute("SELECT COUNT(*) FROM books WHERE title IS NOT NULL")
                existing_titles = set()
                if use_sqlite:
                    cursor.execute("SELECT title FROM books")
                else:
                    cursor.execute("SELECT title FROM books")
                for row in cursor.fetchall():
                    title_value = row.get("title") if isinstance(row, dict) else row[0]
                    if title_value:
                        existing_titles.add(str(title_value))
                for title, author, description, cover_path, accent_hex, section_name, status_text, rating, primary_genre, secondary_genre, cta_label, sort_order, is_completed in SEED_BOOKS:
                    if title in existing_titles:
                        continue
                    if use_sqlite:
                        cursor.execute(
                            """
                            INSERT INTO books (
                                title, author, description, cover_path, accent_hex, section_name, status_text,
                                rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                title, author, description, cover_path, accent_hex, section_name, status_text,
                                rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                            ),
                        )
                    else:
                        cursor.execute(
                            """
                            INSERT INTO books (
                                title, author, description, cover_path, accent_hex, section_name, status_text,
                                rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                title, author, description, cover_path, accent_hex, section_name, status_text,
                                rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                            ),
                        )
                    result["books_added"] = int(result["books_added"]) + 1
                    result["changed"] = True
                try:
                    result["chapters_seeded"] = _seed_long_chapters_for_books(cursor, use_sqlite=use_sqlite)
                except Exception:
                    result["chapters_seeded"] = 0

        connection.commit()
    except Exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise
    finally:
        cursor.close()
        connection.close()
    return result


def force_seed_if_empty() -> dict[str, int]:
    """Guarantee baseline categories/books/chapters exist (idempotent)."""
    result = {"books_added": 0, "categories_added": 0, "chapters_seeded": 0}
    connection = get_connection()
    cursor = connection.cursor()
    try:
        use_sqlite = USE_SQLITE
        # categories
        for name, topic_count, tab_group, sort_order in SEED_CATEGORIES:
            if use_sqlite:
                cursor.execute(
                    "SELECT id FROM categories WHERE name=? AND tab_group=? LIMIT 1",
                    (name, tab_group),
                )
                if cursor.fetchone() is None:
                    cursor.execute(
                        "INSERT INTO categories (name, topic_count, tab_group, sort_order) VALUES (?, ?, ?, ?)",
                        (name, topic_count, tab_group, sort_order),
                    )
                    result["categories_added"] += 1
            else:
                cursor.execute(
                    "SELECT id FROM categories WHERE name=%s AND tab_group=%s LIMIT 1",
                    (name, tab_group),
                )
                if cursor.fetchone() is None:
                    cursor.execute(
                        "INSERT INTO categories (name, topic_count, tab_group, sort_order) VALUES (%s, %s, %s, %s)",
                        (name, topic_count, tab_group, sort_order),
                    )
                    result["categories_added"] += 1

        for (
            title,
            author,
            description,
            cover_path,
            accent_hex,
            section_name,
            status_text,
            rating,
            primary_genre,
            secondary_genre,
            cta_label,
            sort_order,
            is_completed,
        ) in SEED_BOOKS:
            if use_sqlite:
                cursor.execute("SELECT id FROM books WHERE title=? LIMIT 1", (title,))
                if cursor.fetchone() is None:
                    cursor.execute(
                        """
                        INSERT INTO books (
                            title, author, description, cover_path, accent_hex, section_name, status_text,
                            rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            title, author, description, cover_path, accent_hex, section_name, status_text,
                            rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                        ),
                    )
                    result["books_added"] += 1
            else:
                cursor.execute("SELECT id FROM books WHERE title=%s LIMIT 1", (title,))
                if cursor.fetchone() is None:
                    cursor.execute(
                        """
                        INSERT INTO books (
                            title, author, description, cover_path, accent_hex, section_name, status_text,
                            rating, genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            title, author, description, cover_path, accent_hex, section_name, status_text,
                            rating, primary_genre, primary_genre, secondary_genre, cta_label, sort_order, is_completed,
                        ),
                    )
                    result["books_added"] += 1

        try:
            result["chapters_seeded"] = _seed_long_chapters_for_books(cursor, use_sqlite=use_sqlite)
            result["chapters_cleaned"] = _cleanup_seed_chapters_on_user_books(cursor, use_sqlite=use_sqlite)
        except Exception:
            result["chapters_seeded"] = 0

        connection.commit()
    except Exception:
        try:
            connection.rollback()
        except Exception:
            pass
        raise
    finally:
        cursor.close()
        connection.close()
    return result
