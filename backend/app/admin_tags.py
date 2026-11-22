"""Admin hashtag (tags) CRUD routes.

Wired from main.py via register_admin_tag_routes(app).
Authors can only attach tags that exist here (max 3 per story).
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException
from pydantic import BaseModel


class AdminTagCreateRequest(BaseModel):
    name: str
    cover_path: str | None = None
    description: str | None = None


class AdminTagUpdateRequest(BaseModel):
    name: str
    cover_path: str | None = None
    description: str | None = None


def register_admin_tag_routes(app, *, require_admin, fetch_all, execute_write, bump_content_version, LOGGER):
    """Register /api/admin/tags routes on the given FastAPI app."""

    def _normalize_name(raw: str) -> str:
        return (raw or "").strip().lstrip("#").strip()

    def _serialize(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row.get("name") or "",
            "description": row.get("description") or "",
            "cover_path": row.get("cover_path") or "",
            "book_count": int(row.get("book_count") or 0),
            "followers_count": int(row.get("followers_count") or 0),
        }

    @app.get("/api/write/tag-options")
    def writer_tag_options(q: str = ""):
        query = q.strip().lstrip("#").strip()
        if not query:
            return {"items": [], "total": 0}
        rows = fetch_all(
            "SELECT id, name FROM tags WHERE LOWER(name) LIKE %s ORDER BY name ASC LIMIT 50",
            (f"{query.lower()}%",),
        ) or []
        items = [{"id": row["id"], "name": row["name"]} for row in rows]
        return {"items": items, "total": len(items)}

    @app.get("/api/admin/tags")
    def admin_list_tags(_: dict[str, Any] = Depends(require_admin)):
        rows = fetch_all(
            """
            SELECT t.id, t.name, t.description, t.cover_path,
                   (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id = t.id) AS book_count,
                   (SELECT COUNT(*) FROM tag_follows tf WHERE tf.tag_id = t.id) AS followers_count
            FROM tags t
            ORDER BY t.name ASC
            """
        )
        return {"items": [_serialize(r) for r in rows]}

    @app.post("/api/admin/tags")
    def admin_create_tag(
        payload: AdminTagCreateRequest,
        _: dict[str, Any] = Depends(require_admin),
    ):
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail="Tag name is required")
        if len(name) > 64:
            raise HTTPException(status_code=400, detail="Tag name is too long")
        existing = fetch_all("SELECT id FROM tags WHERE LOWER(name)=LOWER(%s) LIMIT 1", (name,))
        if existing:
            raise HTTPException(status_code=400, detail="Tag already exists")
        cover_path = (payload.cover_path or "").strip()
        description = (payload.description or "").strip()
        try:
            row_id, _ = execute_write(
                "INSERT INTO tags (name, cover_path, description, created_by_admin) VALUES (%s, %s, %s, 1)",
                (name, cover_path, description),
            )
        except Exception:
            try:
                row_id, _ = execute_write(
                    "INSERT INTO tags (name, cover_path, description) VALUES (%s, %s, %s)",
                    (name, cover_path, description),
                )
            except Exception:
                row_id, _ = execute_write("INSERT INTO tags (name) VALUES (%s)", (name,))
        bump_content_version()
        return {"ok": True, "id": row_id, "name": name}

    @app.put("/api/admin/tags/{tag_id}")
    def admin_update_tag(
        tag_id: int,
        payload: AdminTagUpdateRequest,
        _: dict[str, Any] = Depends(require_admin),
    ):
        name = _normalize_name(payload.name)
        if not name:
            raise HTTPException(status_code=400, detail="Tag name is required")
        rows = fetch_all("SELECT id FROM tags WHERE id=%s LIMIT 1", (tag_id,))
        if not rows:
            raise HTTPException(status_code=404, detail="Tag not found")
        dup = fetch_all(
            "SELECT id FROM tags WHERE LOWER(name)=LOWER(%s) AND id!=%s LIMIT 1",
            (name, tag_id),
        )
        if dup:
            raise HTTPException(status_code=400, detail="Another tag already uses that name")
        cover_path = (payload.cover_path or "").strip()
        description = (payload.description or "").strip()
        execute_write(
            "UPDATE tags SET name=%s, cover_path=%s, description=%s WHERE id=%s",
            (name, cover_path, description, tag_id),
        )
        bump_content_version()
        return {"ok": True, "id": tag_id, "name": name}

    @app.delete("/api/admin/tags/{tag_id}")
    def admin_delete_tag(
        tag_id: int,
        _: dict[str, Any] = Depends(require_admin),
    ):
        rows = fetch_all("SELECT id FROM tags WHERE id=%s LIMIT 1", (tag_id,))
        if not rows:
            raise HTTPException(status_code=404, detail="Tag not found")
        try:
            execute_write("DELETE FROM book_tags WHERE tag_id=%s", (tag_id,))
        except Exception as exc:
            LOGGER.warning("book_tags cleanup on tag delete: %s", exc)
        _, affected = execute_write("DELETE FROM tags WHERE id=%s", (tag_id,))
        if affected == 0:
            raise HTTPException(status_code=404, detail="Tag not found")
        bump_content_version()
        return {"ok": True}
