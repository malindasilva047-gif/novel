from fastapi import APIRouter

from app.api.v1.endpoints import admin, auth, discovery, engagement, reader, stories, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(stories.router)
api_router.include_router(discovery.router)
api_router.include_router(engagement.router)
api_router.include_router(reader.router)
api_router.include_router(admin.router)
