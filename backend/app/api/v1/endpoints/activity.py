from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.cache import cache
from app.db.deps import get_current_user, get_database
from app.services.recommendations import RecommendationEngine

router = APIRouter(tags=["activity"])


class UserActivityPayload(BaseModel):
    post_id: str = Field(min_length=1, max_length=120)
    action_type: str = Field(pattern="^(view|like|comment|bookmark)$")
    read_time: int = Field(default=0, ge=0, le=86400)
    scroll_depth: float = Field(default=0, ge=0, le=100)


@router.post("/user-activity")
async def track_user_activity(
    payload: UserActivityPayload,
    current_user: dict = Depends(get_current_user),
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> dict:
    story = await database.stories.find_one(
        {"_id": payload.post_id},
        {"categories": 1, "tags": 1, "status": 1},
    )
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")

    categories = story.get("categories") or []
    category_id = str(categories[0]) if categories else ""
    tags = story.get("tags") if isinstance(story.get("tags"), list) else []

    engine = RecommendationEngine(database)
    await engine.track_user_activity(
        user_id=current_user["_id"],
        post_id=payload.post_id,
        category_id=category_id,
        action_type=payload.action_type,
        tags=tags,
        read_time=payload.read_time,
        scroll_depth=payload.scroll_depth,
    )

    cache.invalidate_prefix(f"recommendations:{current_user['_id']}")
    return {"message": "Activity tracked"}
