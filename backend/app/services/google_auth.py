import re
from uuid import uuid4

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from motor.motor_asyncio import AsyncIOMotorDatabase


def verify_google_credential(credential: str, client_id: str) -> dict:
    request = google_requests.Request()
    claims = google_id_token.verify_oauth2_token(credential, request, client_id)
    issuer = claims.get("iss")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise ValueError("Invalid Google token issuer")
    return claims


def normalize_email(value: str) -> str:
    return value.strip().lower()


def make_username_base(source: str) -> str:
    candidate = re.sub(r"[^a-z0-9_]+", "_", source.strip().lower())
    candidate = re.sub(r"_+", "_", candidate).strip("_")
    return candidate[:24] or f"reader_{uuid4().hex[:8]}"


async def generate_unique_username(database: AsyncIOMotorDatabase, source: str) -> str:
    base = make_username_base(source)
    candidate = base
    suffix = 0
    while await database.users.find_one({"username": candidate}, {"_id": 1}):
        suffix += 1
        suffix_text = str(suffix)
        candidate = f"{base[: max(1, 30 - len(suffix_text))]}{suffix_text}"
    return candidate