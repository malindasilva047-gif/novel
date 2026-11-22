from __future__ import annotations

import argparse
from dataclasses import dataclass

import certifi
from pymongo import MongoClient
from pymongo.collection import Collection

from app.core.config import get_settings


@dataclass
class ResetSummary:
    target: str
    deleted_users: int
    deleted_email_tokens: int
    deleted_password_tokens: int
    deleted_followers: int
    deleted_bookmarks: int
    deleted_history: int
    deleted_likes: int
    deleted_comments: int
    deleted_reports: int


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Delete all registered user accounts and related auth/activity documents from Atlas and/or local MongoDB.",
    )
    parser.add_argument(
        "--targets",
        default="atlas,local",
        help="Comma-separated targets to reset: atlas, local, or both. Default: atlas,local",
    )
    return parser.parse_args()


def _delete_many(collection: Collection, query: dict) -> int:
    return int(collection.delete_many(query).deleted_count)


def _reset_target(target: str, uri: str, db_name: str) -> ResetSummary:
    client_kwargs = {
        "serverSelectionTimeoutMS": 10000,
        "connectTimeoutMS": 10000,
    }
    if uri.startswith("mongodb+srv://"):
        client_kwargs["tlsCAFile"] = certifi.where()

    client = MongoClient(uri, **client_kwargs)
    try:
        client.admin.command("ping")
        database = client[db_name]

        users = list(database.users.find({}, {"_id": 1, "email": 1, "username": 1}))
        user_ids = [user["_id"] for user in users]
        emails = [str(user.get("email") or "").strip() for user in users if user.get("email")]

        if not users:
            return ResetSummary(
                target=target,
                deleted_users=0,
                deleted_email_tokens=0,
                deleted_password_tokens=0,
                deleted_followers=0,
                deleted_bookmarks=0,
                deleted_history=0,
                deleted_likes=0,
                deleted_comments=0,
                deleted_reports=0,
            )

        deleted_email_tokens = _delete_many(database.email_verification_tokens, {"email": {"$in": emails}}) if emails else 0
        deleted_password_tokens = _delete_many(database.password_reset_tokens, {"email": {"$in": emails}}) if emails else 0
        deleted_followers = _delete_many(
            database.followers,
            {"$or": [{"follower_id": {"$in": user_ids}}, {"target_id": {"$in": user_ids}}]},
        )
        deleted_bookmarks = _delete_many(database.bookmarks, {"user_id": {"$in": user_ids}})
        deleted_history = _delete_many(database.reading_history, {"user_id": {"$in": user_ids}})
        deleted_likes = _delete_many(database.likes, {"user_id": {"$in": user_ids}})
        deleted_comments = _delete_many(database.comments, {"user_id": {"$in": user_ids}})
        deleted_reports = _delete_many(database.reports, {"user_id": {"$in": user_ids}})
        deleted_users = _delete_many(database.users, {"_id": {"$in": user_ids}})

        return ResetSummary(
            target=target,
            deleted_users=deleted_users,
            deleted_email_tokens=deleted_email_tokens,
            deleted_password_tokens=deleted_password_tokens,
            deleted_followers=deleted_followers,
            deleted_bookmarks=deleted_bookmarks,
            deleted_history=deleted_history,
            deleted_likes=deleted_likes,
            deleted_comments=deleted_comments,
            deleted_reports=deleted_reports,
        )
    finally:
        client.close()


def main() -> int:
    settings = get_settings()
    raw_targets = [item.strip().lower() for item in str(_parse_args().targets).split(",") if item.strip()]
    valid_targets = [target for target in raw_targets if target in {"atlas", "local"}]
    if not valid_targets:
        raise SystemExit("No valid targets supplied. Use atlas, local, or atlas,local.")

    uri_map = {
        "atlas": settings.mongodb_uri,
        "local": settings.mongodb_uri_local,
    }

    summaries: list[ResetSummary] = []
    for target in valid_targets:
        uri = str(uri_map.get(target) or "").strip()
        if not uri:
            print(f"[{target}] skipped: URI is not configured")
            continue
        summary = _reset_target(target=target, uri=uri, db_name=settings.mongodb_db_name)
        summaries.append(summary)
        print(
            f"[{summary.target}] users={summary.deleted_users}, "
            f"email_tokens={summary.deleted_email_tokens}, password_tokens={summary.deleted_password_tokens}, "
            f"followers={summary.deleted_followers}, bookmarks={summary.deleted_bookmarks}, "
            f"history={summary.deleted_history}, likes={summary.deleted_likes}, "
            f"comments={summary.deleted_comments}, reports={summary.deleted_reports}"
        )

    if not summaries:
        print("No database targets were reset.")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())