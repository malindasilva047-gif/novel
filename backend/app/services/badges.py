from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase


BADGE_RULES = [
    {
        "key": "early_writer",
        "title": "Early Writer",
        "description": "Publish your first story.",
        "metric": "stories",
        "tiers": [
            {"name": "Bronze", "min": 1},
            {"name": "Silver", "min": 2},
            {"name": "Gold", "min": 3},
            {"name": "Platinum", "min": 5},
        ],
    },
    {
        "key": "first_story",
        "title": "First Story",
        "description": "Create your first published story.",
        "metric": "stories",
        "tiers": [{"name": "Unlocked", "min": 1}],
    },
    {
        "key": "five_stories",
        "title": "5 Stories",
        "description": "Publish five stories.",
        "metric": "stories",
        "tiers": [{"name": "Unlocked", "min": 5}],
    },
    {
        "key": "top_writer",
        "title": "Top Writer",
        "description": "Earn likes as an author.",
        "metric": "likes",
        "tiers": [
            {"name": "Bronze", "min": 100},
            {"name": "Silver", "min": 300},
            {"name": "Gold", "min": 700},
            {"name": "Platinum", "min": 1200},
        ],
    },
    {
        "key": "verified_writer",
        "title": "Verified Writer",
        "description": "Verify email and publish one story.",
        "metric": "verified_story",
        "tiers": [{"name": "Verified", "min": 1}],
    },
    {
        "key": "active_reader",
        "title": "Active Reader",
        "description": "Read stories consistently.",
        "metric": "history",
        "tiers": [
            {"name": "Bronze", "min": 5},
            {"name": "Silver", "min": 15},
            {"name": "Gold", "min": 30},
            {"name": "Platinum", "min": 60},
        ],
    },
]


def _resolve_tier(metric_value: int, tiers: list[dict]) -> dict:
    unlocked = False
    active_tier = None
    for tier in tiers:
        if metric_value >= tier["min"]:
            unlocked = True
            active_tier = tier
    next_tier = None
    for tier in tiers:
        if metric_value < tier["min"]:
            next_tier = tier
            break
    return {
        "unlocked": unlocked,
        "tier": active_tier["name"] if active_tier else None,
        "next_tier": next_tier["name"] if next_tier else None,
        "next_target": next_tier["min"] if next_tier else None,
    }


async def calculate_user_badges(database: AsyncIOMotorDatabase, user: dict) -> list[dict]:
    user_id = user["_id"]
    story_count = await database.stories.count_documents({"author_id": user_id})
    history_count = await database.reading_history.count_documents({"user_id": user_id})

    total_likes_pipeline = [
        {"$match": {"author_id": user_id}},
        {"$group": {"_id": None, "likes": {"$sum": "$likes"}}},
    ]
    like_docs = await database.stories.aggregate(total_likes_pipeline).to_list(length=1)
    total_likes = like_docs[0]["likes"] if like_docs else 0

    verified_story_value = 1 if user.get("is_email_verified", False) and story_count >= 1 else 0
    metrics = {
        "stories": story_count,
        "history": history_count,
        "likes": total_likes,
        "verified_story": verified_story_value,
    }

    result: list[dict] = []
    for rule in BADGE_RULES:
        metric_value = metrics.get(rule["metric"], 0)
        tier_state = _resolve_tier(metric_value, rule["tiers"])

        if tier_state["unlocked"]:
            await database.badges.update_one(
                {"user_id": user_id, "badge_key": rule["key"]},
                {
                    "$setOnInsert": {
                        "_id": f"{user_id}::{rule['key']}",
                        "earned_at": datetime.now(timezone.utc),
                    },
                    "$set": {
                        "user_id": user_id,
                        "badge_key": rule["key"],
                        "title": rule["title"],
                        "tier": tier_state["tier"],
                        "progress_value": metric_value,
                    },
                },
                upsert=True,
            )

        result.append(
            {
                "badge_key": rule["key"],
                "title": rule["title"],
                "description": rule["description"],
                "unlocked": tier_state["unlocked"],
                "tier": tier_state["tier"],
                "progress_value": metric_value,
                "next_tier": tier_state["next_tier"],
                "next_target": tier_state["next_target"],
            }
        )

    result.sort(key=lambda item: (not item["unlocked"], item["title"]))
    return result
