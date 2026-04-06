from __future__ import annotations

from collections import deque
from datetime import datetime, timedelta, timezone


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._requests: dict[str, deque[datetime]] = {}

    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)

        bucket = self._requests.setdefault(key, deque())
        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= max_requests:
            return False

        bucket.append(now)
        return True


rate_limiter = InMemoryRateLimiter()
