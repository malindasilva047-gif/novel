import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import certifi
from pymongo.errors import ConfigurationError, ConnectionFailure, ServerSelectionTimeoutError

from app.core.config import get_settings
from app.db.indexes import ensure_indexes
from app.db.seed import ensure_seed_data


class MongoDB:
    client: AsyncIOMotorClient | None = None
    database: AsyncIOMotorDatabase | None = None
    connection_error: str | None = None


db = MongoDB()
logger = logging.getLogger(__name__)


async def connect_to_mongo() -> None:
    settings = get_settings()
    db.connection_error = None

    # Primary URI (Atlas in production) with optional local fallback.
    uris_to_try: list[str] = [settings.mongodb_uri]
    if settings.mongodb_uri_local and settings.mongodb_uri_local not in uris_to_try:
        uris_to_try.append(settings.mongodb_uri_local)

    last_error: str | None = None
    for uri in uris_to_try:
        try:
            is_atlas = uri.startswith("mongodb+srv://")
            client_kwargs: dict = {
                "serverSelectionTimeoutMS": 10000,
                "connectTimeoutMS": 10000,
            }
            if is_atlas:
                client_kwargs["tlsCAFile"] = certifi.where()

            db.client = AsyncIOMotorClient(uri, **client_kwargs)
            await db.client.admin.command("ping")
            db.database = db.client[settings.mongodb_db_name]
            await ensure_indexes(db.database)
            await ensure_seed_data(db.database)
            db.connection_error = None
            logger.info("MongoDB connected using URI: %s", "Atlas" if is_atlas else "Local")
            return
        except (ServerSelectionTimeoutError, ConnectionFailure, ConfigurationError, OSError) as exc:
            last_error = str(exc)
            if db.client:
                db.client.close()
            db.client = None
            db.database = None
            continue

    db.connection_error = last_error
    logger.warning("MongoDB connection unavailable, continuing in fallback mode: %s", last_error)


async def close_mongo_connection() -> None:
    if db.client:
        db.client.close()
