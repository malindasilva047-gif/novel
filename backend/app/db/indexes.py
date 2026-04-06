from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING


async def ensure_indexes(database: AsyncIOMotorDatabase) -> None:
    await database.users.create_index([("email", ASCENDING)], unique=True)
    await database.users.create_index([("is_banned", ASCENDING)])
    await database.users.create_index([("followers_count", DESCENDING)])

    await database.stories.create_index([("author_id", ASCENDING)])
    await database.stories.create_index([("created_at", DESCENDING)])
    await database.stories.create_index([("likes", DESCENDING), ("views", DESCENDING)])
    await database.stories.create_index([("title", ASCENDING)])

    await database.chapters.create_index([("story_id", ASCENDING), ("chapter_number", ASCENDING)], unique=True)
    await database.comments.create_index([("story_id", ASCENDING), ("created_at", DESCENDING)])

    await database.likes.create_index([("user_id", ASCENDING), ("story_id", ASCENDING)], unique=True)
    await database.followers.create_index([("follower_id", ASCENDING), ("target_id", ASCENDING)], unique=True)

    await database.bookmarks.create_index([("user_id", ASCENDING), ("story_id", ASCENDING)], unique=True)
    await database.bookmarks.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])

    await database.reading_history.create_index([("user_id", ASCENDING), ("story_id", ASCENDING)], unique=True)
    await database.reading_history.create_index([("user_id", ASCENDING), ("updated_at", DESCENDING)])

    await database.badges.create_index([("user_id", ASCENDING), ("badge_key", ASCENDING)], unique=True)

    await database.views.create_index([("story_id", ASCENDING), ("viewed_at", DESCENDING)])

    await database.reports.create_index([("status", ASCENDING), ("updated_at", DESCENDING)])
    await database.reports.create_index([("story_id", ASCENDING), ("status", ASCENDING)])

    await database.email_verification_tokens.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
    await database.password_reset_tokens.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0)
