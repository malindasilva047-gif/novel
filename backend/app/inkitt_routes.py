"""Inkitt-style routes: genres, publish, story reports, admin hashtag CRUD."""
from __future__ import annotations

from typing import Any, Callable

from fastapi import Body, Depends, HTTPException, Request


def register_inkitt_routes(
    app,
    *,
    fetch_all,
    fetch_one,
    execute_write,
    require_user: Callable | None = None,
    require_admin: Callable | None = None,
    bump_content_version: Callable | None = None,
):
    # Runtime startup hooks call this a second time to apply patched database
    # helpers. Registering FastAPI endpoints twice causes ambiguous dispatch and
    # duplicate OpenAPI operation IDs, so keep route installation idempotent.
    if getattr(app.state, "inkitt_routes_registered", False):
        return
    app.state.inkitt_routes_registered = True

    def _bump():
        if bump_content_version:
            try:
                bump_content_version()
            except Exception:
                pass

    def _ensure_reports_table():
        try:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS story_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    book_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    reason TEXT DEFAULT '',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(book_id, user_id)
                )
                """,
                (),
            )
        except Exception:
            try:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS story_reports (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        book_id INT NOT NULL,
                        user_id INT NOT NULL,
                        reason TEXT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY uq_report (book_id, user_id)
                    )
                    """,
                    (),
                )
            except Exception:
                pass

    _ensure_reports_table()

    def _ensure_genres_table():
        try:
            execute_write(
                """
                CREATE TABLE IF NOT EXISTS genres (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """,
                (),
            )
        except Exception:
            try:
                execute_write(
                    """
                    CREATE TABLE IF NOT EXISTS genres (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        name VARCHAR(80) NOT NULL UNIQUE,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """,
                    (),
                )
            except Exception:
                pass

    _ensure_genres_table()

    @app.get("/api/genres")
    def list_genres():
        _ensure_genres_table()
        names: list[str] = []
        seen: set[str] = set()

        def _add(n: str):
            n = (n or "").strip()
            if not n:
                return
            key = n.lower()
            if key in seen:
                return
            seen.add(key)
            names.append(n)

        try:
            for row in fetch_all("SELECT name FROM genres ORDER BY name"):
                if isinstance(row, dict):
                    _add(str(row.get("name") or ""))
                elif row:
                    _add(str(row[0]))
        except Exception:
            pass

        try:
            rows = fetch_all(
                """
                SELECT DISTINCT genre AS name FROM books
                WHERE genre IS NOT NULL AND TRIM(genre) <> ''
                UNION
                SELECT DISTINCT primary_genre AS name FROM books
                WHERE primary_genre IS NOT NULL AND TRIM(primary_genre) <> ''
                """
            )
            for row in rows:
                if isinstance(row, dict):
                    _add(str(row.get("name") or ""))
                elif row:
                    _add(str(row[0]))
        except Exception:
            pass

        names.sort(key=lambda s: s.lower())
        return {"items": names}

    @app.post("/api/genres")
    def create_genre(payload: dict[str, Any] = Body(...)):
        """Create a genre so it appears in the shared dropdown for all users."""
        _ensure_genres_table()
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Genre name required")
        if len(name) > 80:
            raise HTTPException(status_code=400, detail="Genre name too long")
        existing = fetch_all(
            "SELECT id, name FROM genres WHERE LOWER(name)=LOWER(%s) LIMIT 1",
            (name,),
        )
        if existing:
            row = existing[0]
            return {
                "ok": True,
                "id": row.get("id") if isinstance(row, dict) else row[0],
                "name": row.get("name") if isinstance(row, dict) else row[1],
                "already_exists": True,
            }
        try:
            genre_id, _ = execute_write(
                "INSERT INTO genres (name) VALUES (%s)",
                (name,),
            )
        except Exception:
            # race / unique
            existing = fetch_all(
                "SELECT id, name FROM genres WHERE LOWER(name)=LOWER(%s) LIMIT 1",
                (name,),
            )
            if existing:
                row = existing[0]
                return {
                    "ok": True,
                    "id": row.get("id") if isinstance(row, dict) else row[0],
                    "name": row.get("name") if isinstance(row, dict) else name,
                    "already_exists": True,
                }
            raise HTTPException(status_code=400, detail="Could not create genre")
        _bump()
        return {"ok": True, "id": genre_id, "name": name, "already_exists": False}

    def _publish_impl(story_id: int, user: dict[str, Any] | None):
        uid = user.get("user_id") if isinstance(user, dict) else None
        rows = fetch_all("SELECT id, user_id, status_text, description, genre, primary_genre FROM books WHERE id=%s", (story_id,))
        if not rows:
            raise HTTPException(status_code=404, detail="Story not found")
        book = rows[0]
        description = str(book.get("description") or "") if isinstance(book, dict) else ""
        genre = str((book.get("genre") or book.get("primary_genre") or "") if isinstance(book, dict) else "")
        if not description.strip() or not genre.strip():
            raise HTTPException(status_code=400, detail="Complete the story summary and primary genre before publishing.")
        owner = book.get("user_id") if isinstance(book, dict) else None
        if uid is not None and owner is not None and int(owner) != int(uid):
            raise HTTPException(status_code=403, detail="Not your story")
        # Live on Discover: Published + recently_updated rail + near top of list
        try:
            execute_write(
                """
                UPDATE books
                SET status_text=%s,
                    section_name=%s,
                    sort_order=%s
                WHERE id=%s
                """,
                ("Published", "recently_updated", 0, story_id),
            )
        except Exception:
            execute_write(
                "UPDATE books SET status_text=%s WHERE id=%s",
                ("Published", story_id),
            )
        _bump()
        return {
            "ok": True,
            "status_text": "Published",
            "section_name": "recently_updated",
        }

    def _report_impl(book_id: int, user: dict[str, Any] | None, reason: str):
        if not user or not user.get("user_id"):
            raise HTTPException(status_code=401, detail="Sign in to report")
        uid = int(user["user_id"])
        rows = fetch_all("SELECT id FROM books WHERE id=%s", (book_id,))
        if not rows:
            raise HTTPException(status_code=404, detail="Book not found")
        try:
            execute_write(
                "INSERT INTO story_reports (book_id, user_id, reason) VALUES (%s, %s, %s)",
                (book_id, uid, (reason or "")[:500]),
            )
        except Exception:
            pass
        count_rows = fetch_all(
            "SELECT COUNT(DISTINCT user_id) AS c FROM story_reports WHERE book_id=%s",
            (book_id,),
        )
        count = 0
        if count_rows:
            r = count_rows[0]
            count = int((r.get("c") if isinstance(r, dict) else r[0]) or 0)
        flagged = count >= 3
        if flagged:
            try:
                execute_write(
                    "UPDATE books SET status_text=%s WHERE id=%s AND status_text NOT LIKE %s",
                    ("Under review", book_id, "%review%"),
                )
            except Exception:
                pass
        return {"ok": True, "report_count": count, "flagged_for_admin": flagged}

    if require_user is not None:

        @app.post("/api/write/stories/{story_id}/publish")
        def publish_writer_story(story_id: int, user: dict[str, Any] = Depends(require_user)):
            return _publish_impl(story_id, user)

        @app.post("/api/write/chapters/{chapter_id}/submit")
        def submit_chapter(chapter_id: int, user: dict[str, Any] = Depends(require_user)):
            rows = fetch_all("SELECT * FROM chapters WHERE id=%s", (chapter_id,))
            if not rows:
                raise HTTPException(status_code=404, detail="Chapter not found")
            chapter = rows[0]
            story_id = chapter.get("story_id") if isinstance(chapter, dict) else None
            if story_id is None:
                raise HTTPException(status_code=400, detail="Chapter has no story.")
            owner_rows = fetch_all("SELECT user_id FROM books WHERE id=%s LIMIT 1", (story_id,))
            owner_id = owner_rows[0].get("user_id") if owner_rows and isinstance(owner_rows[0], dict) else None
            if owner_id is not None and int(owner_id) != int(user.get("user_id") or 0):
                raise HTTPException(status_code=403, detail="Not your story")
            story_rows = fetch_all(
                "SELECT description, genre, primary_genre FROM books WHERE id=%s LIMIT 1",
                (story_id,),
            )
            story = story_rows[0] if story_rows else {}
            description = str(story.get("description") or "") if isinstance(story, dict) else ""
            genre = str((story.get("genre") or story.get("primary_genre") or "") if isinstance(story, dict) else "")
            if not description.strip() or not genre.strip():
                raise HTTPException(status_code=400, detail="Complete the story summary and primary genre before publishing.")
            execute_write(
                "UPDATE chapters SET submission_status=%s WHERE id=%s",
                ("submitted", chapter_id),
            )
            if story_id is not None:
                execute_write(
                    "UPDATE books SET status_text=%s WHERE id=%s",
                    ("Published", story_id),
                )
            _bump()
            return {"ok": True, "story_id": story_id, "status_text": "Published"}

    else:

        @app.post("/api/write/stories/{story_id}/publish")
        def publish_writer_story_open(story_id: int):
            return _publish_impl(story_id, None)

