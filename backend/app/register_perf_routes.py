"""Call register_perf_routes(app) once from main after app is created."""
from __future__ import annotations

import logging
from typing import Callable

LOGGER = logging.getLogger("register_perf_routes")


def register_perf_routes(app, fetch_all: Callable) -> None:
    def fetch_media(media_id: int):
        rows = fetch_all(
            "SELECT data, content_type FROM media_files WHERE id=%s LIMIT 1",
            (media_id,),
        )
        if not rows:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Media not found")
        row = rows[0]
        data = row["data"] if isinstance(row, dict) else row[0]
        ctype = (row["content_type"] if isinstance(row, dict) else row[1]) if isinstance(row, (dict, tuple, list)) else "image/jpeg"
        if isinstance(data, memoryview):
            data = data.tobytes()
        if isinstance(data, str):
            data = data.encode("latin-1")
        return bytes(data), str(ctype or "image/jpeg")

    try:
        from app.image_variants import register_image_routes
        register_image_routes(app, fetch_media)
        LOGGER.info("Performance image variant routes registered (/api/img)")
    except Exception as exc:
        LOGGER.warning("Could not register image variant routes: %s", exc)
