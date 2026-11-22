
from pathlib import Path
import logging
from typing import Any

from .database import (
    initialize_database_if_needed,
    run_startup_migrations,
    get_connection,
    USE_SQLITE,
)
from . import mysql_compat

LOGGER = logging.getLogger(__name__)
_FULL_STARTUP_MIGRATIONS_DONE = False

DEFAULT_TAGS = [
    "Romance",
    "Love",
    "Romance/Drama",
    "Love Story",
    "Fantasy",
    "Dark",
    "Alpha Male",
    "Werewolves",
    "Paranormal",
    "Erotica",
    "Mystery",
    "Thriller",
    "Young Adult",
    "Adventure",
    "Horror",
    "SciFi",
    "Drama",
    "Humor",
    "LGBTQ+",
    "Boyxboy",
    "Omegaverse",
]


def _query_count(connection, table: str) -> int:
    cursor = connection.cursor()
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        row = cursor.fetchone()
        return int(row[0]) if row is not None else 0
    except Exception:
        return 0
    finally:
        cursor.close()


def _ensure_mysql_extra_tables(connection) -> int:
    """Create/alter missing MySQL tables and columns used by the API."""
    from . import database as db_mod

    if db_mod.USE_SQLITE:
        return 0

    cursor = connection.cursor()
    added = 0
    statements = [
        (
            "tags",
            """
            CREATE TABLE IF NOT EXISTS tags (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(80) NOT NULL UNIQUE,
                description TEXT NULL,
                cover_path VARCHAR(512) NOT NULL DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "book_tags",
            """
            CREATE TABLE IF NOT EXISTS book_tags (
                book_id INT NOT NULL,
                tag_id INT NOT NULL,
                PRIMARY KEY (book_id, tag_id),
                CONSTRAINT fk_bt_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
                CONSTRAINT fk_bt_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )
            """,
        ),
        (
            "book_reviews",
            """
            CREATE TABLE IF NOT EXISTS book_reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                book_id INT NOT NULL,
                user_id INT NOT NULL,
                rating TINYINT NOT NULL DEFAULT 5,
                comment TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_review_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            )
            """,
        ),
        (
            "author_follows",
            """
            CREATE TABLE IF NOT EXISTS author_follows (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                author_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_follow (user_id, author_id)
            )
            """,
        ),
        (
            "book_likes",
            """
            CREATE TABLE IF NOT EXISTS book_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                book_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_book_like (user_id, book_id)
            )
            """,
        ),
        (
            "chapter_comments",
            """
            CREATE TABLE IF NOT EXISTS chapter_comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                chapter_id INT NULL,
                book_id INT NULL,
                user_id INT NOT NULL,
                body TEXT NOT NULL,
                paragraph_index INT DEFAULT -1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "chat_messages",
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                sender VARCHAR(32) NOT NULL DEFAULT 'user',
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_chat_user (user_id)
            )
            """,
        ),
        (
            "support_requests",
            """
            CREATE TABLE IF NOT EXISTS support_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                first_name VARCHAR(120) NOT NULL,
                issue VARCHAR(120) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                device_type VARCHAR(120) NOT NULL DEFAULT '',
                attachment_path VARCHAR(255) NULL,
                status VARCHAR(40) NOT NULL DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "book_shares",
            """
            CREATE TABLE IF NOT EXISTS book_shares (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                book_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_share_user (user_id),
                INDEX idx_share_book (book_id)
            )
            """,
        ),
        (
            "wall_posts",
            """
            CREATE TABLE IF NOT EXISTS wall_posts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                target_user_id INT NOT NULL,
                body TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "chapter_comment_likes",
            """
            CREATE TABLE IF NOT EXISTS chapter_comment_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                comment_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_ccl (comment_id, user_id),
                INDEX idx_ccl_comment (comment_id)
            )
            """,
        ),
        (
            "user_support_notifications",
            """
            CREATE TABLE IF NOT EXISTS user_support_notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                support_request_id INT NULL,
                title VARCHAR(255) NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                is_read TINYINT(1) NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_usn_user (user_id)
            )
            """,
        ),
        (
            "user_preferences",
            """
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id INT PRIMARY KEY,
                prefs_json TEXT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "media_assets",
            """
            CREATE TABLE IF NOT EXISTS media_assets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                filename VARCHAR(255) NOT NULL,
                content_type VARCHAR(120) NULL,
                data LONGBLOB NULL,
                path VARCHAR(512) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "wall_post_likes",
            """
            CREATE TABLE IF NOT EXISTS wall_post_likes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                post_id INT NOT NULL,
                user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_wpl (post_id, user_id)
            )
            """,
        ),
        (
            "tag_follows",
            """
            CREATE TABLE IF NOT EXISTS tag_follows (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                tag_id INT NOT NULL,
                notify TINYINT NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_tf (user_id, tag_id),
                INDEX idx_tag_follows_tag (tag_id)
            )
            """,
        ),
        (
            "reading_list_items",
            """
            CREATE TABLE IF NOT EXISTS reading_list_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reading_list_id INT NOT NULL,
                book_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_rli (reading_list_id, book_id)
            )
            """,
        ),
        (
            "genres",
            """
            CREATE TABLE IF NOT EXISTS genres (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(80) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
        ),
        (
            "reading_list_items",
            """
            CREATE TABLE IF NOT EXISTS reading_list_items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                reading_list_id INT NOT NULL,
                book_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_list_book (reading_list_id, book_id),
                CONSTRAINT fk_rli_list FOREIGN KEY (reading_list_id) REFERENCES reading_lists(id) ON DELETE CASCADE,
                CONSTRAINT fk_rli_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
            )
            """,
        ),
    ]
    try:
        for name, sql in statements:
            cursor.execute(f"SHOW TABLES LIKE '{name}'")
            if cursor.fetchone() is None:
                cursor.execute(sql)
                added += 1
                LOGGER.info("Created missing table: %s", name)

        # Column patches on existing tables
        column_patches = [
            ("categories", "image_path", "ALTER TABLE categories ADD COLUMN image_path VARCHAR(255) NOT NULL DEFAULT ''"),
            ("app_users", "cover_url", "ALTER TABLE app_users ADD COLUMN cover_url TEXT NULL"),
            ("app_users", "bio", "ALTER TABLE app_users ADD COLUMN bio TEXT NULL"),
            ("author_follows", "user_id", "ALTER TABLE author_follows ADD COLUMN user_id INT NULL"),
            ("author_follows", "author_id", "ALTER TABLE author_follows ADD COLUMN author_id INT NULL"),
            ("app_users", "followers_count", "ALTER TABLE app_users ADD COLUMN followers_count INT NOT NULL DEFAULT 0"),
            ("books", "user_id", "ALTER TABLE books ADD COLUMN user_id INT NULL AFTER id"),
            ("books", "primary_genre", "ALTER TABLE books ADD COLUMN primary_genre VARCHAR(80) NOT NULL DEFAULT ''"),
            ("books", "secondary_genre", "ALTER TABLE books ADD COLUMN secondary_genre VARCHAR(80) NOT NULL DEFAULT ''"),
            ("books", "is_completed", "ALTER TABLE books ADD COLUMN is_completed TINYINT(1) NOT NULL DEFAULT 0"),
            ("reading_lists", "user_id", "ALTER TABLE reading_lists ADD COLUMN user_id INT NULL AFTER id"),
            ("library_entries", "user_id", "ALTER TABLE library_entries ADD COLUMN user_id INT NULL AFTER id"),
            ("book_reviews", "comment", "ALTER TABLE book_reviews ADD COLUMN comment TEXT NULL"),
            ("book_reviews", "title", "ALTER TABLE book_reviews ADD COLUMN title VARCHAR(255) NULL"),
            ("book_reviews", "plot_rating", "ALTER TABLE book_reviews ADD COLUMN plot_rating INT NULL"),
            ("book_reviews", "style_rating", "ALTER TABLE book_reviews ADD COLUMN style_rating INT NULL"),
            ("book_reviews", "tech_rating", "ALTER TABLE book_reviews ADD COLUMN tech_rating INT NULL"),
        ]
        for table, column, alter_sql in column_patches:
            try:
                cursor.execute(f"SHOW COLUMNS FROM {table} LIKE '{column}'")
                if cursor.fetchone() is None:
                    cursor.execute(alter_sql)
                    added += 1
                    LOGGER.info("Added column %s.%s", table, column)
            except Exception as col_exc:
                LOGGER.warning("Column patch %s.%s skipped: %s", table, column, col_exc)

        # If book_reviews has body but not comment, copy/rename
        try:
            cursor.execute("SHOW COLUMNS FROM book_reviews LIKE 'body'")
            has_body = cursor.fetchone() is not None
            cursor.execute("SHOW COLUMNS FROM book_reviews LIKE 'comment'")
            has_comment = cursor.fetchone() is not None
            if has_body and has_comment:
                cursor.execute(
                    "UPDATE book_reviews SET comment = body WHERE (comment IS NULL OR comment = '') AND body IS NOT NULL"
                )
            elif has_body and not has_comment:
                cursor.execute("ALTER TABLE book_reviews CHANGE body comment TEXT NOT NULL")
                added += 1
        except Exception as rev_exc:
            LOGGER.warning("book_reviews comment/body patch skipped: %s", rev_exc)

        # Widen books.section_name so values like 'trending' are allowed (was ENUM).
        try:
            cursor.execute("SHOW COLUMNS FROM books LIKE 'section_name'")
            col = cursor.fetchone()
            col_type = ""
            if col is not None:
                if isinstance(col, dict):
                    col_type = str(col.get("Type") or col.get("type") or "")
                else:
                    col_type = str(col[1]) if len(col) > 1 else ""
            if col_type and "enum" in col_type.lower():
                cursor.execute(
                    "ALTER TABLE books MODIFY COLUMN section_name VARCHAR(64) NOT NULL DEFAULT 'recently_updated'"
                )
                added += 1
                LOGGER.info("Migrated books.section_name ENUM -> VARCHAR(64)")
        except Exception as sec_exc:
            LOGGER.warning("section_name migration skipped: %s", sec_exc)

        
        # Library progress columns for Continue Reading / resume paragraph
        for col, ddl in [
            ("last_chapter_number", "ALTER TABLE library_entries ADD COLUMN last_chapter_number INT DEFAULT 1"),
            ("last_paragraph_index", "ALTER TABLE library_entries ADD COLUMN last_paragraph_index INT DEFAULT 0"),
            ("chapters_read", "ALTER TABLE library_entries ADD COLUMN chapters_read INT DEFAULT 0"),
            ("reading_progress_percent", "ALTER TABLE library_entries ADD COLUMN reading_progress_percent INT NULL"),
        ]:
            try:
                cursor.execute(f"SHOW COLUMNS FROM library_entries LIKE '{col}'")
                if not cursor.fetchone():
                    cursor.execute(ddl)
                    added += 1
            except Exception as le:
                LOGGER.warning("library col %s: %s", col, le)

        # app_users profile fields for complete-profile + display
        for col, ddl in [
            ("profile_complete", "ALTER TABLE app_users ADD COLUMN profile_complete TINYINT(1) NOT NULL DEFAULT 0"),
            ("gender", "ALTER TABLE app_users ADD COLUMN gender VARCHAR(32) NULL"),
            ("birth_date", "ALTER TABLE app_users ADD COLUMN birth_date VARCHAR(32) NULL"),
            ("country", "ALTER TABLE app_users ADD COLUMN country VARCHAR(64) NULL"),
            ("facebook_url", "ALTER TABLE app_users ADD COLUMN facebook_url VARCHAR(255) NULL"),
            ("youtube_url", "ALTER TABLE app_users ADD COLUMN youtube_url VARCHAR(255) NULL"),
            ("instagram_url", "ALTER TABLE app_users ADD COLUMN instagram_url VARCHAR(255) NULL"),
            ("twitter_url", "ALTER TABLE app_users ADD COLUMN twitter_url VARCHAR(255) NULL"),
            ("website_url", "ALTER TABLE app_users ADD COLUMN website_url VARCHAR(255) NULL"),
            ("bio", "ALTER TABLE app_users ADD COLUMN bio TEXT NULL"),
            ("photo_url", "ALTER TABLE app_users ADD COLUMN photo_url VARCHAR(512) NULL"),
            ("cover_url", "ALTER TABLE app_users ADD COLUMN cover_url VARCHAR(512) NULL"),
        ]:
            try:
                cursor.execute(f"SHOW COLUMNS FROM app_users LIKE '{col}'")
                if not cursor.fetchone():
                    cursor.execute(ddl)
                    added += 1
            except Exception as pe:
                LOGGER.warning("app_users col %s: %s", col, pe)

        connection.commit()
    except Exception as exc:
        LOGGER.warning("ensure_mysql_extra_tables failed: %s", exc)
        try:
            connection.rollback()
        except Exception:
            pass
    finally:
        cursor.close()
    return added


def _seed_tags(connection) -> int:
    cursor = connection.cursor()
    inserted = 0
    try:
        from . import database as db_mod

        use_sqlite = db_mod.USE_SQLITE
        for name in DEFAULT_TAGS:
            if use_sqlite:
                cursor.execute("SELECT id FROM tags WHERE name=? LIMIT 1", (name,))
                if cursor.fetchone() is None:
                    cursor.execute("INSERT INTO tags (name) VALUES (?)", (name,))
                    inserted += 1
            else:
                cursor.execute("SELECT id FROM tags WHERE name=%s LIMIT 1", (name,))
                if cursor.fetchone() is None:
                    cursor.execute("INSERT INTO tags (name) VALUES (%s)", (name,))
                    inserted += 1
        connection.commit()
    except Exception as exc:
        LOGGER.warning("Tag seed skipped or partial: %s", exc)
        try:
            connection.rollback()
        except Exception:
            pass
    finally:
        cursor.close()
    return inserted


def _apply_runtime_patches() -> None:
    try:
        from . import main as main_mod
        from . import database as db_mod

        def _to_db_query(query: str) -> str:
            return mysql_compat.to_db_query(query, db_mod.USE_SQLITE)

        main_mod._to_db_query = _to_db_query  # type: ignore[attr-defined]

        def _set_story_tags(story_id: int, tag_names: list[str] | None) -> None:
            mysql_compat.set_story_tags(
                story_id,
                tag_names,
                fetch_all=main_mod.fetch_all,
                execute_write=main_mod.execute_write,
            )

        main_mod._set_story_tags = _set_story_tags  # type: ignore[attr-defined]

        def _fetch_one(query: str, params=None):
            rows = main_mod.fetch_all(query, params)
            return rows[0] if rows else None

        try:
            from .tag_routes import register_extra_routes

            serialize = getattr(main_mod, "_serialize_book", None)
            register_extra_routes(
                main_mod.app,
                fetch_all=main_mod.fetch_all,
                fetch_one=_fetch_one,
                execute_write=main_mod.execute_write,
                serialize_book=serialize,
            )
            LOGGER.info("Registered extra tag/book routes")
        except Exception as route_exc:
            LOGGER.warning("Extra routes not registered: %s", route_exc)

        try:
            from .inkitt_routes import register_inkitt_routes

            register_inkitt_routes(
                main_mod.app,
                fetch_all=main_mod.fetch_all,
                fetch_one=_fetch_one,
                execute_write=main_mod.execute_write,
                require_user=getattr(main_mod, "require_user", None),
                require_admin=getattr(main_mod, "require_admin", None),
                bump_content_version=getattr(main_mod, "bump_content_version", None),
            )
            LOGGER.info("Registered inkitt routes")
        except Exception as inkitt_exc:
            LOGGER.warning("Inkitt routes not registered: %s", inkitt_exc)

        try:
            from .genre_routes import register_genre_routes
            register_genre_routes(
                main_mod.app,
                fetch_all=main_mod.fetch_all,
                fetch_one=getattr(main_mod, "fetch_one", None),
                serialize_book=getattr(main_mod, "serialize_book", None),
                is_public_status=getattr(main_mod, "is_public_status", None),
            )
            LOGGER.info("Registered genre routes")
        except Exception as genre_exc:
            LOGGER.warning("Genre routes not registered: %s", genre_exc)

        try:
            from .inkitt_extra_routes import register_inkitt_extra_routes

            register_inkitt_extra_routes(
                main_mod.app,
                require_user=main_mod.require_user,
                require_admin=main_mod.require_admin,
                fetch_all=main_mod.fetch_all,
                execute_write=main_mod.execute_write,
                LOGGER=LOGGER,
                USE_SQLITE=USE_SQLITE,
            )
            LOGGER.info("Registered inkitt extra routes (contests, list follow, audiobooks)")
        except Exception as extra_exc:
            LOGGER.warning("inkitt extra routes not registered: %s", extra_exc)

        try:
            from .auth_professional import apply_professional_auth

            apply_professional_auth(main_mod)
            LOGGER.info("Professional auth hardening applied")
        except Exception as auth_exc:
            LOGGER.warning("Professional auth not applied: %s", auth_exc)

        try:
            mysql_compat.patch_execute_write(main_mod, db_mod.USE_SQLITE)
            LOGGER.info("Patched execute_write for lastrowid recovery")
        except Exception as ew_exc:
            LOGGER.warning("execute_write patch skipped: %s", ew_exc)

        LOGGER.info(
            "Applied runtime patches (db_mode=%s)",
            "sqlite" if db_mod.USE_SQLITE else "mysql",
        )
    except Exception as exc:
        LOGGER.warning("Runtime patches not applied: %s", exc)


def _cleanup_duplicate_seed_rows() -> dict[str, Any]:
    """Auto-remove duplicate categories/books from stale or repeated seed runs.

    This is intentionally safe and idempotent: it only removes rows with the same
    title/category name and keeps the lowest id for each logical item.
    """
    report: dict[str, Any] = {"deleted_categories": 0, "deleted_books": 0, "errors": []}
    if USE_SQLITE:
        return report
    try:
        conn = get_connection()
        cursor = conn.cursor()
        try:
            for label, sql in (
                (
                    "categories",
                    "DELETE c1 FROM categories c1 JOIN categories c2 ON c1.id > c2.id AND c1.name = c2.name AND c1.tab_group = c2.tab_group",
                ),
                (
                    "books",
                    "DELETE b1 FROM books b1 JOIN books b2 ON b1.id > b2.id AND b1.title = b2.title",
                ),
            ):
                cursor.execute(sql)
                deleted = int(cursor.rowcount or 0)
                report[f"deleted_{label}"] = deleted
                if deleted:
                    LOGGER.info("Startup duplicate cleanup removed %s %s rows", deleted, label)
            conn.commit()
        finally:
            cursor.close()
            conn.close()
    except Exception as exc:
        report["errors"].append(str(exc)[:300])
        LOGGER.warning("duplicate seed cleanup failed: %s", exc)
    return report


def _apply_safe_sql_scripts() -> dict[str, Any]:
    """Run reviewed migrations and numbered, additive DDL migrations."""
    report: dict[str, Any] = {"files": [], "statements_ok": 0, "errors": []}
    try:
        sql_dir = Path(__file__).resolve().parent.parent / "sql"
        if not sql_dir.is_dir():
            report["skipped"] = "no_sql_dir"
            return report
        reviewed_names = {
            "00_widen_section_name.sql",
            "01_tag_follows_notify.sql",
            "02_writer_settings.sql",
            # Repairs only known stale seed image paths and is safe to repeat.
            "fix_stale_cover_paths.sql",
        }
        files = sorted(sql_dir.glob("*.sql"))
        conn = get_connection()
        try:
            cursor = conn.cursor()
            for path in files:
                name = path.name
                is_numbered_migration = (
                    len(name) > 3
                    and name[:2].isdigit()
                    and name[2] == "_"
                )
                if name not in reviewed_names and not is_numbered_migration:
                    report["files"].append({"file": name, "status": "skipped_unreviewed_or_one_off"})
                    continue
                if USE_SQLITE:
                    report["files"].append({"file": name, "status": "handled_by_runtime_schema_ensures"})
                    continue
                raw = path.read_text(encoding="utf-8", errors="ignore")
                upper = raw.upper()
                if "DROP DATABASE" in upper:
                    report["files"].append({"file": name, "status": "skipped_drop_database"})
                    continue
                # Numbered migrations may contain schema DDL only. Reset scripts,
                # data rewrites, and account mutations must stay explicit.
                statements = []
                for stmt in raw.split(";"):
                    lines = [ln for ln in stmt.splitlines() if not ln.strip().startswith("--")]
                    s = "\n".join(lines).strip()
                    if s:
                        statements.append(s)
                if name not in reviewed_names and any(
                    not (
                        stmt.upper().startswith("ALTER TABLE ")
                        or stmt.upper().startswith("CREATE TABLE IF NOT EXISTS ")
                        or stmt.upper().startswith("CREATE INDEX IF NOT EXISTS ")
                    )
                    for stmt in statements
                ):
                    report["files"].append({"file": name, "status": "skipped_non_ddl_migration"})
                    continue
                # Apply idempotent schema statements; duplicate columns are expected
                # when a migration was already applied on an earlier startup.
                ok = 0
                err = 0
                for s in statements:
                    su = s.upper()
                    if su.startswith("USE ") or su.startswith("DROP DATABASE"):
                        continue
                    if su.startswith("DROP TABLE") and "IF EXISTS" not in su:
                        continue
                    try:
                        cursor.execute(s)
                        # Some reviewed data migrations include a final SELECT
                        # for verification. Consume its rows before the same
                        # MySQL cursor is reused for the next SQL file.
                        if getattr(cursor, "with_rows", False):
                            cursor.fetchall()
                        ok += 1
                        report["statements_ok"] += 1
                    except Exception as stmt_exc:
                        err += 1
                        # Idempotent schema: duplicate column/table is fine
                        msg = str(stmt_exc).lower()
                        if any(x in msg for x in ("already exists", "duplicate", "exists")):
                            ok += 1
                            report["statements_ok"] += 1
                        else:
                            report["errors"].append({"file": name, "error": str(stmt_exc)[:200]})
                try:
                    conn.commit()
                except Exception:
                    pass
                report["files"].append({"file": name, "status": "applied", "ok": ok, "err": err})
            cursor.close()
        finally:
            try:
                conn.close()
            except Exception:
                pass
    except Exception as exc:
        report["errors"].append({"file": "*", "error": str(exc)[:300]})
        LOGGER.warning("apply_safe_sql_scripts failed: %s", exc)
    return report


def _run_safe_sql_migrations(result: dict[str, Any], *, enabled: bool) -> None:
    if not enabled:
        result["sql_scripts"] = {"skipped": True, "reason": "AUTO_RUN_DB_MIGRATIONS_disabled"}
        return
    report = _apply_safe_sql_scripts()
    result["sql_scripts"] = report
    LOGGER.info("Auto SQL scripts: %s", report)
    if report.get("errors"):
        raise RuntimeError(f"Automatic SQL migrations failed: {report['errors']}")




def _ensure_home_slider_sections(connection) -> None:
    """Create home_slider_sections + seed defaults if empty."""
    cursor = connection.cursor()
    try:
        if USE_SQLITE:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS home_slider_sections (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    section_key TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 100,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        else:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS home_slider_sections (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    section_key VARCHAR(64) NOT NULL UNIQUE,
                    label VARCHAR(120) NOT NULL,
                    description VARCHAR(512) NOT NULL DEFAULT '',
                    sort_order INT NOT NULL DEFAULT 100,
                    is_active TINYINT NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        connection.commit()
        cursor.execute("SELECT COUNT(*) FROM home_slider_sections")
        row = cursor.fetchone()
        count = int(row[0]) if row else 0
        if count == 0:
            defaults = [
                ("featured", "Featured", "Top featured stories", 10),
                ("trending", "Hot Right Now", "Trending stories", 20),
                ("new_releases", "New Releases", "Just published", 30),
                ("recently_updated", "Recently Updated", "Fresh chapters", 40),
                ("recently_completed", "Recently Completed", "Finished stories", 50),
                ("editor_picks", "Editors' Picks", "Staff selections", 60),
                ("weekend_binge", "Weekend Binge", "Perfect for a weekend read", 70),
            ]
            for key, label, desc, order in defaults:
                try:
                    if USE_SQLITE:
                        cursor.execute(
                            "INSERT INTO home_slider_sections (section_key, label, description, sort_order, is_active) VALUES (?,?,?,?,1)",
                            (key, label, desc, order),
                        )
                    else:
                        cursor.execute(
                            "INSERT INTO home_slider_sections (section_key, label, description, sort_order, is_active) VALUES (%s,%s,%s,%s,1)",
                            (key, label, desc, order),
                        )
                except Exception:
                    pass
            connection.commit()
    finally:
        cursor.close()



def _ensure_tag_follows_notify(connection) -> None:
    """Add tag_follows.notify if missing (fixes ProgrammingError 1054)."""
    cursor = connection.cursor()
    try:
        if USE_SQLITE:
            cursor.execute("PRAGMA table_info(tag_follows)")
            cols = [row[1] for row in (cursor.fetchall() or [])]
            if "notify" not in cols:
                cursor.execute(
                    "ALTER TABLE tag_follows ADD COLUMN notify INTEGER NOT NULL DEFAULT 0"
                )
                connection.commit()
                LOGGER.info("startup: added tag_follows.notify (sqlite)")
        else:
            cursor.execute("SHOW COLUMNS FROM tag_follows LIKE %s", ("notify",))
            if not cursor.fetchall():
                cursor.execute(
                    "ALTER TABLE tag_follows ADD COLUMN notify TINYINT NOT NULL DEFAULT 0"
                )
                connection.commit()
                LOGGER.info("startup: added tag_follows.notify (mysql)")
    except Exception as exc:
        LOGGER.warning("startup tag_follows.notify: %s", exc)
    finally:
        cursor.close()



def _ensure_tags_columns(connection) -> None:
    """Add description/cover_path to tags if missing."""
    cursor = connection.cursor()
    try:
        if USE_SQLITE:
            cursor.execute("PRAGMA table_info(tags)")
            cols = [r[1] for r in (cursor.fetchall() or [])]
            if "description" not in cols:
                cursor.execute("ALTER TABLE tags ADD COLUMN description TEXT NOT NULL DEFAULT ''")
            if "cover_path" not in cols:
                cursor.execute("ALTER TABLE tags ADD COLUMN cover_path TEXT NOT NULL DEFAULT ''")
            connection.commit()
        else:
            for col, ddl in (
                ("description", "ALTER TABLE tags ADD COLUMN description TEXT NULL"),
                ("cover_path", "ALTER TABLE tags ADD COLUMN cover_path VARCHAR(512) NOT NULL DEFAULT ''"),
            ):
                try:
                    cursor.execute("SHOW COLUMNS FROM tags LIKE %s", (col,))
                    if not cursor.fetchall():
                        cursor.execute(ddl)
                        connection.commit()
                        LOGGER.info("startup added tags.%s", col)
                except Exception as e:
                    LOGGER.warning("tags column %s: %s", col, e)
    finally:
        cursor.close()


def run_startup_tasks() -> dict[str, Any]:
    """Run safe schema migrations and idempotent catalog seeds on startup.

    Destructive setup/reset dumps and data-rewrite scripts are deliberately not
    executed automatically; reviewed additive SQL migrations are allowlisted.
    """
    import os as _os
    global _FULL_STARTUP_MIGRATIONS_DONE

    result: dict[str, Any] = {
        "initialized": False,
        "migrations": {},
        "counts": {},
        "tags_seeded": 0,
        "tables_ensured": 0,
        "patches_applied": False,
        "db_mode": "sqlite" if USE_SQLITE else "mysql",
        "fast_path": False,
    }

    # Probe MySQL once (or fall back to SQLite).
    try:
        from . import database as db_mod
        from . import db_runtime

        probe_info = db_runtime.apply_mysql_fallback_if_needed(db_mod)
        result["db_mode"] = probe_info.get("db_mode", result["db_mode"])
        if probe_info.get("mysql_fallback_reason"):
            result["mysql_fallback_reason"] = probe_info["mysql_fallback_reason"]
    except Exception as probe_exc:
        LOGGER.warning("DB probe skipped: %s", probe_exc)

    # ---- Fast path: DB already populated (production normal case) ----
    book_count = 0
    try:
        conn = get_connection()
        try:
            book_count = _query_count(conn, "books")
            result["counts"]["books"] = book_count
        finally:
            conn.close()
    except Exception as count_exc:
        LOGGER.warning("quick books count failed: %s", count_exc)
        book_count = 0

    auto_migrate = _os.getenv("AUTO_RUN_DB_MIGRATIONS", "true").strip().lower() in ("1", "true", "yes")
    on_vercel = bool(_os.getenv("VERCEL") or _os.getenv("VERCEL_ENV"))

    cleanup_duplicates = _os.getenv(
        "CLEAN_DUPLICATE_SEED_ROWS_ON_STARTUP", ""
    ).strip().lower() in ("1", "true", "yes")
    if cleanup_duplicates:
        try:
            result["duplicate_cleanup"] = _cleanup_duplicate_seed_rows()
            LOGGER.info("Duplicate cleanup result: %s", result["duplicate_cleanup"])
        except Exception as dup_exc:
            LOGGER.warning("duplicate cleanup failed: %s", dup_exc)
            result["duplicate_cleanup_error"] = str(dup_exc)
    else:
        result["duplicate_cleanup"] = {
            "skipped": True,
            "reason": "requires_explicit_opt_in",
        }

    if book_count > 0:
        if auto_migrate and not _FULL_STARTUP_MIGRATIONS_DONE:
            try:
                result["migrations"] = run_startup_migrations()
                from .database import force_seed_if_empty

                result["force_seed"] = force_seed_if_empty()
                _FULL_STARTUP_MIGRATIONS_DONE = True
            except Exception as migration_exc:
                result["migration_error"] = str(migration_exc)
                LOGGER.exception("fast_path migrations failed")
                raise RuntimeError("Automatic database migrations failed during backend startup.") from migration_exc
        if auto_migrate:
            conn = get_connection()
            try:
                result["tables_ensured"] = _ensure_mysql_extra_tables(conn)
                _ensure_tags_columns(conn)
                _ensure_tag_follows_notify(conn)
                result["tags_seeded"] = _seed_tags(conn)
            finally:
                conn.close()
        _run_safe_sql_migrations(result, enabled=auto_migrate)
        try:
            from .database import ensure_discover_catalog_seed

            discover_seed = ensure_discover_catalog_seed(min_public_books=18)
            result["discover_seed"] = discover_seed
            result["force_seed"] = {"skipped": False, "reason": "ensure_discover_catalog_seed", "books": book_count, "added": discover_seed.get("books_added", 0)}
        except Exception as seed_exc:
            LOGGER.warning("discover catalog seed failed: %s", seed_exc)
            result["discover_seed_error"] = str(seed_exc)
            result["force_seed"] = {"skipped": True, "reason": "books_present", "books": book_count}

        try:
            _apply_runtime_patches()
            result["patches_applied"] = True
            from .main import _seed_book_tag_links

            result["book_tag_links"] = _seed_book_tag_links()
        except Exception as exc:
            LOGGER.exception("Patch step failed: %s", exc)

        result["fast_path"] = True
        # Idempotent catalog seed runs on startup by default in all environments.
        # Use local connection wrappers (execute_write lives in main.py, not database).
        try:
            enable_inkitt = _os.getenv("ENABLE_INKITT_SEED", "").strip().lower() in ("1", "true", "yes")
            auto_inkitt = _os.getenv("AUTO_RUN_INKITT_SEED", "true").strip().lower() in ("1", "true", "yes")
            if auto_inkitt or enable_inkitt:
                from .inkitt_seed import ensure_inkitt_catalog

                seed_conn = get_connection()
                try:
                    def _fetch(q, p=None):
                        if USE_SQLITE:
                            cur = seed_conn.cursor()
                        else:
                            try:
                                cur = seed_conn.cursor(dictionary=True)
                            except TypeError:
                                cur = seed_conn.cursor()
                        try:
                            qq = q.replace("%s", "?") if USE_SQLITE else q
                            cur.execute(qq, p or ())
                            rows = cur.fetchall()
                            if not rows:
                                return []
                            if isinstance(rows[0], dict):
                                return list(rows)
                            cols = [d[0] for d in cur.description]
                            return [dict(zip(cols, r)) for r in rows]
                        finally:
                            cur.close()

                    def _write(q, p=()):
                        cur = seed_conn.cursor()
                        try:
                            qq = q.replace("%s", "?") if USE_SQLITE else q
                            cur.execute(qq, p)
                            seed_conn.commit()
                            lid = getattr(cur, "lastrowid", None) or 0
                            return lid, cur.rowcount
                        finally:
                            cur.close()

                    result["inkitt_seed"] = ensure_inkitt_catalog(_write, _fetch, USE_SQLITE)
                    LOGGER.info("fast_path inkitt_seed: %s", result["inkitt_seed"])
                finally:
                    try:
                        seed_conn.close()
                    except Exception:
                        pass
            else:
                result["inkitt_seed"] = {
                    "skipped": True,
                    "reason": "AUTO_RUN_INKITT_SEED_disabled",
                }
        except Exception as inkitt_exc:
            LOGGER.warning("fast_path inkitt_seed: %s", inkitt_exc)
            result["inkitt_seed_error"] = str(inkitt_exc)
        # NEVER run enrichment on Vercel cold starts — it blocks the first request
        # for minutes and causes 504 (Task timed out after 300 seconds).
        # Local development defaults on; serverless requires explicit opt-in.
        import os as _os
        on_vercel = bool(_os.getenv("VERCEL") or _os.getenv("VERCEL_ENV"))
        enrich_setting = _os.getenv("RUN_CONTENT_ENRICHMENT")
        enrich_mode = (enrich_setting or "").strip().lower()
        run_enrich = (
            enrich_mode in ("1", "true", "yes")
            if enrich_setting is not None
            else not on_vercel
        )
        if enrich_mode == "background":
            result["content_enrichment"] = {"scheduled": True, "mode": "background"}
        elif not run_enrich:
            result["content_enrichment"] = {
                "skipped": True,
                "reason": "serverless_startup_timeout_protection",
            }
        else:
            try:
                from .content_enrichment_seed import run_content_enrichment
                result["content_enrichment"] = run_content_enrichment(force=False)
            except Exception as enrich_exc:
                LOGGER.warning("content_enrichment skipped: %s", enrich_exc)
                result["content_enrichment_error"] = str(enrich_exc)
        # Lightweight, idempotent: ensure tags table + seed default hashtags
        # even when books already exist (fixes empty admin hashtags in prod).
        try:
            conn = get_connection()
            try:
                result["tables_ensured"] = _ensure_mysql_extra_tables(conn)
                try:
                    _ensure_tags_columns(conn)
                except Exception as tc_exc:
                    LOGGER.warning("tags columns: %s", tc_exc)
                try:
                    _ensure_tag_follows_notify(conn)
                except Exception as tf_exc:
                    LOGGER.warning("tag_follows notify: %s", tf_exc)
                result["tags_seeded"] = _seed_tags(conn)
                result["counts"]["tags"] = _query_count(conn, "tags")

                try:
                    from .main import _ensure_tags_schema, _seed_book_tag_links
                    _ensure_tags_schema()
                    link_report = _seed_book_tag_links()
                    result["book_tag_links"] = link_report
                except Exception as link_exc:
                    LOGGER.warning("book_tag_links: %s", link_exc)
                # Catalog health: min chapters + genre/hashtag links (every local start)
                if not on_vercel:
                    try:
                        from .seed_catalog_links import run_catalog_health
                        result["catalog_health"] = run_catalog_health()
                        LOGGER.info("catalog_health: %s", result.get("catalog_health"))
                    except Exception as ch_exc:
                        LOGGER.warning("catalog_health: %s", ch_exc)

                try:
                    _ensure_home_slider_sections(conn)
                    result["home_slider_sections_ensured"] = True
                except Exception as hs_exc:
                    LOGGER.exception("home_slider_sections failed")
                    raise RuntimeError("Could not ensure home slider database tables.") from hs_exc
            finally:
                conn.close()
        except Exception as tag_exc:
            LOGGER.warning("fast_path tag ensure/seed failed: %s", tag_exc)
            result["tags_seed_error"] = str(tag_exc)

        LOGGER.info(
            "Startup FAST PATH (books=%s tags_seeded=%s tags_count=%s) — enrichment=%s",
            book_count,
            result.get("tags_seeded"),
            result.get("counts", {}).get("tags"),
            result.get("content_enrichment"),
        )
        LOGGER.info("Startup tasks finished: %s", result)
        return result

    # ---- Slow path: empty DB — full init once ----
    LOGGER.warning("Books table empty — running full migrations + seed")

    try:
        initialized = initialize_database_if_needed()
        result["initialized"] = bool(initialized)
    except Exception as init_exc:
        LOGGER.exception("initialize_database_if_needed failed")
        raise RuntimeError("Automatic database initialization failed.") from init_exc

    try:
        migration_report = run_startup_migrations()
        result["migrations"] = migration_report
    except Exception as mig_exc:
        LOGGER.exception("run_startup_migrations failed")
        raise RuntimeError("Automatic database migrations failed.") from mig_exc

    try:
        from .database import force_seed_if_empty

        seed_report = force_seed_if_empty()
        result["force_seed"] = seed_report
        LOGGER.info("force_seed_if_empty: %s", seed_report)
    except Exception as seed_exc:
        LOGGER.exception("force_seed_if_empty failed")
        raise RuntimeError("Automatic baseline database seeding failed.") from seed_exc

    try:
        conn = get_connection()
        result["tables_ensured"] = _ensure_mysql_extra_tables(conn)
        try:
            _ensure_tags_columns(conn)
        except Exception as tc_exc:
            LOGGER.warning("tags columns: %s", tc_exc)
        try:
            _ensure_tag_follows_notify(conn)
        except Exception as tf_exc:
            LOGGER.warning("tag_follows notify: %s", tf_exc)
        result["tags_seeded"] = _seed_tags(conn)
        try:
            _ensure_home_slider_sections(conn)
            result["home_slider_sections_ensured"] = True
        except Exception as hs_exc:
            LOGGER.warning("home_slider_sections: %s", hs_exc)
        for tbl in (
            "menu_items",
            "achievements",
            "reading_lists",
            "profiles",
            "write_screen",
            "tags",
            "books",
        ):
            result["counts"][tbl] = _query_count(conn, tbl)
        conn.close()
    except Exception as exc:
        LOGGER.exception("Failed after migrations: %s", exc)
        raise RuntimeError("Automatic database startup setup failed.") from exc

    _run_safe_sql_migrations(result, enabled=auto_migrate)

    try:
        _apply_runtime_patches()
        result["patches_applied"] = True
    except Exception as exc:
        LOGGER.exception("Patch step failed: %s", exc)

    LOGGER.info("Startup tasks finished: %s", result)

    # The idempotent story catalog seed runs on startup by default.
    _run_inkitt = _os.getenv("AUTO_RUN_INKITT_SEED", "true").strip().lower() in ("1", "true", "yes")
    if not _run_inkitt and _os.getenv("ENABLE_INKITT_SEED", "").strip().lower() in ("1", "true", "yes"):
        _run_inkitt = True
    if not _run_inkitt:
        result["inkitt_seed"] = {"skipped": True, "reason": "AUTO_RUN_INKITT_SEED_disabled"}
    if _run_inkitt:
        try:
            from .inkitt_seed import ensure_inkitt_catalog

            seed_conn = get_connection()
            try:
                if not USE_SQLITE:
                    cur = seed_conn.cursor()
                    try:
                        cur.execute(
                            "ALTER TABLE books MODIFY COLUMN section_name "
                            "VARCHAR(64) NOT NULL DEFAULT 'recently_updated'"
                        )
                        seed_conn.commit()
                    except Exception as alter_exc:
                        LOGGER.warning("section_name widen: %s", alter_exc)
                    finally:
                        cur.close()

                def _fetch(q, p=None):
                    if USE_SQLITE:
                        cur = seed_conn.cursor()
                    else:
                        try:
                            cur = seed_conn.cursor(dictionary=True)
                        except TypeError:
                            cur = seed_conn.cursor()
                    try:
                        qq = q.replace("%s", "?") if USE_SQLITE else q
                        cur.execute(qq, p or ())
                        rows = cur.fetchall()
                        if not rows:
                            return []
                        if isinstance(rows[0], dict):
                            return list(rows)
                        cols = [d[0] for d in cur.description]
                        return [dict(zip(cols, r)) for r in rows]
                    finally:
                        cur.close()

                def _write(q, p=()):
                    cur = seed_conn.cursor()
                    try:
                        qq = q.replace("%s", "?") if USE_SQLITE else q
                        cur.execute(qq, p)
                        seed_conn.commit()
                        lid = getattr(cur, "lastrowid", None) or 0
                        return lid, cur.rowcount
                    finally:
                        cur.close()

                result["inkitt_seed"] = ensure_inkitt_catalog(_write, _fetch, USE_SQLITE)
                LOGGER.info("inkitt_seed (ENABLE_INKITT_SEED): %s", result["inkitt_seed"])
            finally:
                try:
                    seed_conn.close()
                except Exception:
                    pass
        except Exception as ink_exc:
            LOGGER.warning("inkitt_seed failed: %s", ink_exc)
            result["inkitt_seed_error"] = str(ink_exc)
    else:
        result["inkitt_seed"] = {"skipped": True, "reason": "disabled_on_startup"}
        LOGGER.info("inkitt_seed skipped (disabled on startup)")

    # Apply the same idempotent demo/catalog enrichment after empty-DB setup.
    # It defaults on for long-lived local backends and remains opt-in on Vercel.
    enrich_setting = _os.getenv("RUN_CONTENT_ENRICHMENT")
    enrich_mode = (enrich_setting or "").strip().lower()
    on_vercel = bool(_os.getenv("VERCEL") or _os.getenv("VERCEL_ENV"))
    run_enrich = (
        enrich_setting.strip().lower() in ("1", "true", "yes")
        if enrich_setting is not None
        else not on_vercel
    )
    if enrich_mode == "background":
        result["content_enrichment"] = {"scheduled": True, "mode": "background"}
    elif run_enrich:
        try:
            from .content_enrichment_seed import run_content_enrichment

            result["content_enrichment"] = run_content_enrichment(force=False)
        except Exception as enrich_exc:
            LOGGER.warning("content enrichment skipped: %s", enrich_exc)
            result["content_enrichment_error"] = str(enrich_exc)
    else:
        result["content_enrichment"] = {
            "skipped": True,
            "reason": "serverless_startup_timeout_protection",
        }

    return result
