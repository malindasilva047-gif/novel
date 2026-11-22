"""Contests CRUD + reading-list follow + public reading lists."""
from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException
from pydantic import BaseModel


class ContestCreate(BaseModel):
    title: str
    theme: str = ""
    deadline: str = "Open entry"
    is_active: bool = True
    is_neon: bool = False


class ContestUpdate(BaseModel):
    title: str | None = None
    theme: str | None = None
    deadline: str | None = None
    is_active: bool | None = None
    is_neon: bool | None = None


def register_inkitt_extra_routes(
    app,
    *,
    require_user,
    require_admin,
    fetch_all,
    execute_write,
    LOGGER,
    USE_SQLITE: bool,
):
    def _ensure_contests():
        try:
            if USE_SQLITE:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS contests (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        title TEXT NOT NULL,
                        theme TEXT DEFAULT '',
                        deadline TEXT DEFAULT 'Open entry',
                        is_active INTEGER DEFAULT 1,
                        is_neon INTEGER DEFAULT 0,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    (),
                )
            else:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS contests (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        theme TEXT,
                        deadline VARCHAR(128) DEFAULT 'Open entry',
                        is_active TINYINT DEFAULT 1,
                        is_neon TINYINT DEFAULT 0,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    (),
                )
        except Exception as exc:
            LOGGER.warning("contests ensure failed: %s", exc)

    def _ensure_list_follows():
        try:
            if USE_SQLITE:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS reading_list_follows (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        reading_list_id INTEGER NOT NULL,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(user_id, reading_list_id)
                    )
                    """,
                    (),
                )
            else:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS reading_list_follows (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        reading_list_id INT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_rl_follow (user_id, reading_list_id)
                    )
                    """,
                    (),
                )
        except Exception as exc:
            LOGGER.warning("reading_list_follows ensure failed: %s", exc)

    _ensure_contests()
    _ensure_list_follows()

    def _ser_contest(row):
        if not row:
            return None
        if not isinstance(row, dict):
            cols = ["id", "title", "theme", "deadline", "is_active", "is_neon", "created_at"]
            row = dict(zip(cols, row))
        return {
            "id": row.get("id"),
            "title": row.get("title"),
            "theme": row.get("theme") or "",
            "deadline": row.get("deadline") or "Open entry",
            "is_active": bool(row.get("is_active")),
            "is_neon": bool(row.get("is_neon")),
            "created_at": str(row.get("created_at") or ""),
        }

    @app.get("/api/contests")
    def list_contests():
        _ensure_contests()
        try:
            rows = fetch_all(
                "SELECT id, title, theme, deadline, is_active, is_neon, created_at FROM contests WHERE is_active=1 ORDER BY is_neon DESC, id DESC"
            )
            return {"items": [_ser_contest(r) for r in (rows or [])]}
        except Exception as exc:
            LOGGER.exception("list contests: %s", exc)
            return {"items": []}

    @app.get("/api/admin/contests")
    def list_all_contests(user: dict[str, Any] = Depends(require_admin)):
        _ensure_contests()
        rows = fetch_all(
            "SELECT id, title, theme, deadline, is_active, is_neon, created_at FROM contests ORDER BY id DESC"
        )
        return {"items": [_ser_contest(r) for r in (rows or [])]}

    @app.post("/api/admin/contests")
    def create_contest(payload: ContestCreate, user: dict[str, Any] = Depends(require_admin)):
        _ensure_contests()
        title = (payload.title or "").strip()
        if not title:
            raise HTTPException(400, "title required")
        execute_write(
            "INSERT INTO contests (title, theme, deadline, is_active, is_neon) VALUES (%s,%s,%s,%s,%s)",
            (title, payload.theme or "", payload.deadline or "Open entry", 1 if payload.is_active else 0, 1 if payload.is_neon else 0),
        )
        rows = fetch_all("SELECT id, title, theme, deadline, is_active, is_neon, created_at FROM contests ORDER BY id DESC LIMIT 1")
        return {"ok": True, "item": _ser_contest(rows[0]) if rows else None}

    @app.patch("/api/admin/contests/{contest_id}")
    def update_contest(contest_id: int, payload: ContestUpdate, user: dict[str, Any] = Depends(require_admin)):
        _ensure_contests()
        fields = []
        vals = []
        data = payload.model_dump(exclude_unset=True)
        mapping = {
            "title": "title",
            "theme": "theme",
            "deadline": "deadline",
            "is_active": "is_active",
            "is_neon": "is_neon",
        }
        for k, col in mapping.items():
            if k in data and data[k] is not None:
                fields.append(f"{col}=%s")
                v = data[k]
                if k in ("is_active", "is_neon"):
                    v = 1 if v else 0
                vals.append(v)
        if not fields:
            raise HTTPException(400, "nothing to update")
        vals.append(contest_id)
        execute_write(f"UPDATE contests SET {', '.join(fields)} WHERE id=%s", tuple(vals))
        return {"ok": True}

    @app.delete("/api/admin/contests/{contest_id}")
    def delete_contest(contest_id: int, user: dict[str, Any] = Depends(require_admin)):
        _ensure_contests()
        execute_write("DELETE FROM contests WHERE id=%s", (contest_id,))
        return {"ok": True}

    # Public reading lists (no auth required for discovery)
    @app.get("/api/public/reading-lists")
    def public_reading_lists():
        try:
            rows = fetch_all(
                """
                SELECT id, name, cover_path, sort_order
                FROM reading_lists
                WHERE user_id IS NULL
                ORDER BY sort_order ASC, id ASC
                LIMIT 40
                """
            )
            items = []
            for r in rows or []:
                if not isinstance(r, dict):
                    r = {"id": r[0], "name": r[1], "cover_path": r[2] if len(r) > 2 else "", "sort_order": r[3] if len(r) > 3 else 0}
                lid = r.get("id")
                covers = []
                actual_story_count = 0
                try:
                    cov = fetch_all(
                        """
                        SELECT b.cover_path FROM reading_list_items rli
                        JOIN books b ON b.id = rli.book_id
                        WHERE rli.reading_list_id=%s
                        ORDER BY rli.created_at DESC, rli.id DESC
                        LIMIT 4
                        """,
                        (lid,),
                    )
                    for c in cov or []:
                        cp = c.get("cover_path") if isinstance(c, dict) else c[0]
                        if cp:
                            covers.append(cp)
                    count_rows = fetch_all(
                        "SELECT COUNT(*) AS story_count FROM reading_list_items WHERE reading_list_id=%s",
                        (lid,),
                    )
                    if count_rows:
                        count_row = count_rows[0]
                        actual_story_count = int(count_row.get("story_count") or 0) if isinstance(count_row, dict) else int(count_row[0] or 0)
                except Exception:
                    pass
                items.append(
                    {
                        "id": lid,
                        "name": r.get("name"),
                        "story_count": actual_story_count,
                        "cover_path": r.get("cover_path") or "",
                        "covers": covers[:4],
                        "owner_name": "Community",
                    }
                )
            # Bootstrap seeds from older versions can contain duplicate labels.
            # Keep one stable public collection per normalized name.
            unique_items = []
            seen_names = set()
            for item in items:
                key = " ".join(str(item.get("name") or "").casefold().split())
                if not key or key in seen_names:
                    continue
                seen_names.add(key)
                unique_items.append(item)
            return {"items": unique_items}
        except Exception as exc:
            LOGGER.exception("public reading lists: %s", exc)
            return {"items": []}

    @app.post("/api/reading-lists/{reading_list_id}/follow")
    def follow_reading_list(reading_list_id: int, user: dict[str, Any] = Depends(require_user)):
        _ensure_list_follows()
        public_list = fetch_all(
            "SELECT id FROM reading_lists WHERE id=%s AND user_id IS NULL LIMIT 1",
            (reading_list_id,),
        )
        if not public_list:
            raise HTTPException(status_code=404, detail="Public reading list not found")
        existing = fetch_all(
            "SELECT id FROM reading_list_follows WHERE user_id=%s AND reading_list_id=%s LIMIT 1",
            (user["user_id"], reading_list_id),
        )
        if existing:
            execute_write(
                "DELETE FROM reading_list_follows WHERE user_id=%s AND reading_list_id=%s",
                (user["user_id"], reading_list_id),
            )
            return {"ok": True, "following": False}
        execute_write(
            "INSERT INTO reading_list_follows (user_id, reading_list_id) VALUES (%s, %s)",
            (user["user_id"], reading_list_id),
        )
        return {"ok": True, "following": True}

    @app.get("/api/reading-lists/{reading_list_id}/follow")
    def get_list_follow(reading_list_id: int, user: dict[str, Any] = Depends(require_user)):
        _ensure_list_follows()
        public_list = fetch_all(
            "SELECT id FROM reading_lists WHERE id=%s AND user_id IS NULL LIMIT 1",
            (reading_list_id,),
        )
        if not public_list:
            raise HTTPException(status_code=404, detail="Public reading list not found")
        rows = fetch_all(
            "SELECT id FROM reading_list_follows WHERE user_id=%s AND reading_list_id=%s LIMIT 1",
            (user["user_id"], reading_list_id),
        )
        return {"following": bool(rows)}

    @app.get("/api/audiobooks")
    def list_audiobooks():
        """Report unavailable until the catalog stores playable audio assets."""
        return {
            "available": False,
            "items": [],
            "message": "Audiobook editions are not available yet.",
        }
