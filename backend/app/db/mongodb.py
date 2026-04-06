import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
import certifi
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

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
    try:
        # Use TLS only for Atlas SRV URIs; plain mongodb:// (local) does not need it.
        is_atlas = settings.mongodb_uri.startswith("mongodb+srv://")
        client_kwargs: dict = {
            "serverSelectionTimeoutMS": 10000,
            "connectTimeoutMS": 10000,
        }
        if is_atlas:
            client_kwargs["tlsCAFile"] = certifi.where()
        db.client = AsyncIOMotorClient(settings.mongodb_uri, **client_kwargs)
        await db.client.admin.command("ping")
        db.database = db.client[settings.mongodb_db_name]
        await ensure_indexes(db.database)
        await ensure_seed_data(db.database)
    except (ServerSelectionTimeoutError, ConnectionFailure, OSError) as exc:
        db.connection_error = str(exc)
        db.database = None
        if db.client:
            db.client.close()
        db.client = None
        logger.warning("MongoDB Atlas connection unavailable, continuing in fallback mode: %s", exc)


async def close_mongo_connection() -> None:
    if db.client:
        db.client.close()
