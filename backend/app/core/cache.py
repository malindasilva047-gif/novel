from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any


@dataclass
class CacheItem:
    value: Any
    expires_at: datetime


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, CacheItem] = {}

    def get(self, key: str) -> Any | None:
        item = self._store.get(key)
        if item is None:
            return None
        if item.expires_at <= datetime.now(timezone.utc):
            self._store.pop(key, None)
            return None
        return item.value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._store[key] = CacheItem(
            value=value,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds),
        )

    def invalidate_prefix(self, prefix: str) -> None:
        to_delete = [key for key in self._store if key.startswith(prefix)]
        for key in to_delete:
            self._store.pop(key, None)


cache = TTLCache()
