from datetime import datetime
from pydantic import BaseModel, Field


class StoryCreate(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=10, max_length=1000)
    cover_image: str
    tags: list[str] = []
    categories: list[str] = []
    is_draft: bool = False
    is_premium: bool = False
    premium_price: float | None = Field(default=None, ge=0)


class StoryUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=140)
    description: str | None = Field(default=None, min_length=10, max_length=1000)
    cover_image: str | None = None
    tags: list[str] | None = None
    categories: list[str] | None = None
    is_draft: bool | None = None
    is_premium: bool | None = None
    premium_price: float | None = Field(default=None, ge=0)


class ChapterCreate(BaseModel):
    story_id: str | None = None
    title: str = Field(min_length=2, max_length=140)
    content: str = Field(min_length=50)


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=140)
    content: str | None = Field(default=None, min_length=50)


class StoryOut(BaseModel):
    id: str
    author_id: str
    title: str
    description: str
    cover_image: str
    tags: list[str]
    categories: list[str]
    likes: int
    views: int
    created_at: datetime
