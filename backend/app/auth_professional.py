
"""Professional authentication hardening.

Registered at startup. Replaces weak email-only login, shared guest account,
and tokens that stay valid after ban/suspend/delete.

Security model:
- Google: verified id/access token (existing)
- Email: email + password (bcrypt via passlib); register or login
- Guest: unique per device_id; cannot write content (enforced in app + optional flags)
- Every require_user checks ban/suspend/delete AND token_version (ban invalidates sessions)
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from urllib.parse import urlsplit

from fastapi import Body, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field

LOGGER = logging.getLogger(__name__)
_SESSION_COOKIE = "novelhub_session"
_CSRF_COOKIE = "novelhub_csrf"
_SESSION_MAX_AGE = 14 * 24 * 60 * 60


class EmailPasswordAuthRequest(BaseModel):
    email: str
    password: str = Field(min_length=6, max_length=128)
    display_name: str = ""
    mode: str = "login"  # login | register


class GuestAuthRequestV2(BaseModel):
    device_id: str = Field(min_length=8, max_length=128)


class FacebookAuthRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=4096)


def _hash_password(password: str) -> str:
    try:
        from passlib.context import CryptContext

        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return ctx.hash(password)
    except Exception:
        # Keep password hashing strong when the optional bcrypt wheel is absent.
        import base64
        import hashlib
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
        encode = lambda value: base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")
        return f"pbkdf2_sha256$310000${encode(salt)}${encode(digest)}"


def _verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        from passlib.context import CryptContext

        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        if password_hash.startswith("$2"):
            return ctx.verify(password, password_hash)
    except Exception:
        pass
    if password_hash.startswith("pbkdf2_sha256$"):
        import base64
        import hashlib
        import hmac

        try:
            _, rounds, salt_text, digest_text = password_hash.split("$", 3)
            decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
            digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), decode(salt_text), int(rounds))
            return hmac.compare_digest(digest, decode(digest_text))
        except (ValueError, TypeError):
            return False
    if password_hash.startswith("sha256:"):
        import hashlib
        import hmac

        return hmac.compare_digest(password_hash, "sha256:" + hashlib.sha256(password.encode("utf-8")).hexdigest())
    return False


def apply_professional_auth(main_mod) -> None:
    """Monkey-patch tokens + replace weak auth routes on the running FastAPI app."""
    app = main_mod.app
    fetch_all = main_mod.fetch_all
    execute_write = main_mod.execute_write
    _row_get = main_mod._row_get
    _assert_user_can_login = main_mod._assert_user_can_login
    _restore_account_on_login = main_mod._restore_account_on_login
    _user_access_block_reason = main_mod._user_access_block_reason
    _sign_token = main_mod._sign_token
    original_require_user = main_mod.require_user
    original_optional_user = main_mod.optional_user
    sessions_table_ready = False
    global _WEB_GOOGLE_AUTH_REQUEST
    _WEB_GOOGLE_AUTH_REQUEST = main_mod.GoogleAuthRequest

    def _ensure_sessions_table() -> None:
        nonlocal sessions_table_ready
        if sessions_table_ready:
            return
        execute_write(
            "CREATE TABLE IF NOT EXISTS auth_sessions (session_id VARCHAR(64) PRIMARY KEY, user_id INT NOT NULL, expires_at VARCHAR(40) NOT NULL, revoked_at VARCHAR(40) NULL)",
            (),
        )
        sessions_table_ready = True

    def _ensure_auth_columns() -> None:
        for sql in (
            "ALTER TABLE app_users ADD COLUMN password_hash TEXT NULL",
            "ALTER TABLE app_users ADD COLUMN token_version INT NOT NULL DEFAULT 0",
            "ALTER TABLE app_users ADD COLUMN device_id TEXT NULL",
        ):
            try:
                execute_write(sql, ())
            except Exception:
                pass
        _ensure_sessions_table()

    # Apply schema setup after the main database readiness/migration hook.
    # Running DDL while importing route modules can block or fail when MySQL is
    # still starting, which would leave the professional auth routes unmounted.
    app.add_event_handler("startup", _ensure_auth_columns)

    def create_user_token(user_id: int) -> str:
        # Read token_version so ban can invalidate outstanding sessions
        tv = 0
        try:
            rows = fetch_all(
                "SELECT COALESCE(token_version, 0) AS token_version FROM app_users WHERE id=%s LIMIT 1",
                (user_id,),
            )
            if rows:
                tv = int(_row_get(rows[0], "token_version") or 0)
        except Exception:
            tv = 0
        expires_at = datetime.now(timezone.utc) + timedelta(days=14)
        session_id = secrets.token_urlsafe(32)
        expires_iso = expires_at.isoformat()
        _ensure_sessions_table()
        execute_write(
            "INSERT INTO auth_sessions (session_id, user_id, expires_at, revoked_at) VALUES (%s, %s, %s, NULL)",
            (session_id, int(user_id), expires_iso),
        )
        return _sign_token(
            {
                "sub": f"user:{user_id}",
                "role": "user",
                "tv": tv,
                "sid": session_id,
                "exp": expires_iso,
            }
        )

    main_mod.create_user_token = create_user_token
    web_auth_origins = {
        origin.strip().rstrip("/")
        for origin in os.getenv(
            "WEB_AUTH_ORIGINS",
            "https://novel-v7-web.vercel.app,https://novel-v7.vercel.app,http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    }

    def require_web_origin(request: Request) -> None:
        origin = request.headers.get("origin", "").rstrip("/")
        if not origin:
            referer = urlsplit(request.headers.get("referer", ""))
            if referer.scheme and referer.netloc:
                origin = f"{referer.scheme}://{referer.netloc}"
        if origin in web_auth_origins:
            return
        parsed_origin = urlsplit(origin)
        if (
            not getattr(main_mod, "_is_production_runtime", False)
            and parsed_origin.scheme == "https"
            and (parsed_origin.hostname or "").endswith(".trycloudflare.com")
        ):
            return
        raise HTTPException(status_code=403, detail="Web sign-in origin is not allowed")

    def set_web_session(response: Response, request: Request, token: str) -> str:
        require_web_origin(request)
        origin = request.headers.get("origin", "")
        secure = origin.lower().startswith("https://") or request.url.scheme == "https"
        same_site = "none" if secure else "lax"
        csrf_token = secrets.token_urlsafe(32)
        response.set_cookie(
            _SESSION_COOKIE,
            token,
            max_age=_SESSION_MAX_AGE,
            httponly=True,
            secure=secure,
            samesite=same_site,
            path="/",
        )
        response.set_cookie(
            _CSRF_COOKIE,
            csrf_token,
            max_age=_SESSION_MAX_AGE,
            httponly=False,
            secure=secure,
            samesite=same_site,
            path="/",
        )
        return csrf_token

    def complete_web_auth(
        result: dict[str, Any],
        request: Request,
        response: Response,
        auth_mode: str | None,
    ) -> dict[str, Any]:
        if (auth_mode or "").lower() != "cookie":
            return result
        token = result.pop("token", None)
        if not token:
            raise HTTPException(status_code=500, detail="Could not create a secure session")
        csrf_token = set_web_session(response, request, str(token))
        result["cookie_session"] = True
        result["csrf_token"] = csrf_token
        return result

    @app.get("/api/auth/csrf")
    def issue_csrf_token(request: Request, response: Response):
        require_web_origin(request)
        origin = request.headers.get("origin", "")
        secure = origin.lower().startswith("https://") or request.url.scheme == "https"
        csrf_token = secrets.token_urlsafe(32)
        response.set_cookie(
            _CSRF_COOKIE,
            csrf_token,
            max_age=_SESSION_MAX_AGE,
            httponly=False,
            secure=secure,
            samesite="none" if secure else "lax",
            path="/",
        )
        return {"csrf_token": csrf_token}

    def require_user(
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        bearer_token = ""
        if authorization and authorization.lower().startswith("bearer "):
            bearer_token = authorization.split(" ", 1)[1].strip()
        using_cookie = not bearer_token
        token = bearer_token or request.cookies.get(_SESSION_COOKIE, "")
        if not token:
            raise HTTPException(status_code=401, detail="Missing user token")
        if using_cookie and request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
            csrf_cookie = request.cookies.get(_CSRF_COOKIE, "")
            csrf_header = request.headers.get("x-csrf-token", "")
            if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
                raise HTTPException(status_code=403, detail="CSRF validation failed")
        try:
            encoded_payload, provided_signature = token.split(".", 1)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid user token") from exc

        import base64
        import hashlib
        import hmac
        import json

        expected_signature = hmac.new(
            main_mod.JWT_SECRET.encode("utf-8"),
            encoded_payload.encode("ascii"),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_signature, provided_signature):
            raise HTTPException(status_code=401, detail="Invalid user token")
        try:
            pad = "=" * (-len(encoded_payload) % 4)
            payload = json.loads(base64.urlsafe_b64decode(encoded_payload + pad).decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=401, detail="Invalid user token") from exc

        if payload.get("role") != "user":
            raise HTTPException(status_code=401, detail="Invalid user token")
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub.startswith("user:"):
            raise HTTPException(status_code=401, detail="Invalid user token")
        expires_raw = payload.get("exp")
        if not isinstance(expires_raw, str):
            raise HTTPException(status_code=401, detail="Invalid user token")
        try:
            expires_at = datetime.fromisoformat(expires_raw)
        except ValueError as exc:
            raise HTTPException(status_code=401, detail="Invalid user token") from exc
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="User token expired — please sign in again")

        uid = int(sub.split(":", 1)[1])
        reason = _user_access_block_reason(uid)
        if reason:
            raise HTTPException(status_code=403, detail=reason)

        # Token version: ban/suspend/delete bumps version → old sessions die
        rows = fetch_all(
            "SELECT COALESCE(token_version, 0) AS token_version FROM app_users WHERE id=%s LIMIT 1",
            (uid,),
        )
        if not rows:
            raise HTTPException(status_code=401, detail="Account not found")
        current_tv = int(_row_get(rows[0], "token_version") or 0)
        token_tv = int(payload.get("tv") or 0)
        if token_tv != current_tv:
            raise HTTPException(
                status_code=401,
                detail="Session revoked. Please sign in again.",
            )
        session_id = payload.get("sid")
        if session_id:
            _ensure_sessions_table()
            sessions = fetch_all(
                "SELECT user_id, revoked_at FROM auth_sessions WHERE session_id=%s LIMIT 1",
                (session_id,),
            )
            if not sessions:
                raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
            session = sessions[0]
            if int(_row_get(session, "user_id") or 0) != uid or _row_get(session, "revoked_at"):
                raise HTTPException(status_code=401, detail="Session revoked. Please sign in again.")
        return {"user_id": uid, "session_id": session_id}

    def optional_user(
        request: Request,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any] | None:
        """Resolve cookie or bearer sessions for public endpoints that personalize results."""
        try:
            return require_user(request, authorization)
        except HTTPException:
            return None

    main_mod.require_user = require_user
    main_mod.optional_user = optional_user
    app.dependency_overrides[original_require_user] = require_user
    app.dependency_overrides[original_optional_user] = optional_user

    @app.post("/api/auth/web/session")
    def migrate_web_session(
        request: Request,
        response: Response,
        user: dict[str, Any] = Depends(require_user),
    ):
        require_web_origin(request)
        authorization = request.headers.get("authorization", "")
        if not authorization.lower().startswith("bearer "):
            raise HTTPException(status_code=401, detail="A legacy bearer session is required")
        session_id = user.get("session_id")
        new_token = create_user_token(int(user["user_id"]))
        if session_id:
            execute_write(
                "UPDATE auth_sessions SET revoked_at=%s WHERE session_id=%s AND user_id=%s AND revoked_at IS NULL",
                (datetime.now(timezone.utc).isoformat(), session_id, int(user["user_id"])),
            )
        csrf_token = set_web_session(response, request, new_token)
        return {"cookie_session": True, "csrf_token": csrf_token}

    @app.post("/api/auth/logout")
    def revoke_current_session(
        response: Response,
        user: dict[str, Any] = Depends(require_user),
    ):
        session_id = user.get("session_id")
        if session_id:
            execute_write(
                "UPDATE auth_sessions SET revoked_at=%s WHERE session_id=%s AND user_id=%s AND revoked_at IS NULL",
                (datetime.now(timezone.utc).isoformat(), session_id, int(user["user_id"])),
            )
        response.delete_cookie(_SESSION_COOKIE, path="/")
        response.delete_cookie(_CSRF_COOKIE, path="/")
        return {"ok": True}

    @app.post("/api/auth/web/google")
    def authenticate_google_web(
        payload: _WEB_GOOGLE_AUTH_REQUEST,
        request: Request,
        response: Response,
    ):
        require_web_origin(request)
        result = main_mod.authenticate_google(payload)
        return complete_web_auth(result, request, response, "cookie")

    @app.post("/api/auth/facebook")
    def authenticate_facebook(payload: FacebookAuthRequest):
        """Validate a Facebook mobile access token and create/link the app account."""
        app_id = os.getenv("FACEBOOK_APP_ID", "").strip()
        app_secret = os.getenv("FACEBOOK_APP_SECRET", "").strip()
        if not app_id or not app_secret:
            raise HTTPException(
                status_code=503,
                detail="Facebook sign-in is not configured on the server.",
            )

        access_token = payload.access_token.strip()
        try:
            import hashlib
            import hmac
            from urllib.parse import urlencode
            from urllib.error import HTTPError
            from urllib.request import urlopen
            import json

            debug_query = urlencode({
                "input_token": access_token,
                "access_token": f"{app_id}|{app_secret}",
            })
            with urlopen(f"https://graph.facebook.com/debug_token?{debug_query}", timeout=12) as response:
                debug = json.loads(response.read().decode("utf-8"))
            token_info = debug.get("data") or {}
            if (
                not token_info.get("is_valid")
                or str(token_info.get("app_id") or "") != app_id
                or not token_info.get("user_id")
            ):
                raise HTTPException(status_code=401, detail="Facebook sign-in token is invalid or expired.")

            proof = hmac.new(app_secret.encode(), access_token.encode(), hashlib.sha256).hexdigest()
            profile_query = urlencode({
                "fields": "id,name,email,picture.type(large)",
                "access_token": access_token,
                "appsecret_proof": proof,
            })
            with urlopen(f"https://graph.facebook.com/me?{profile_query}", timeout=12) as response:
                profile = json.loads(response.read().decode("utf-8"))
        except HTTPException:
            raise
        except HTTPError as exc:
            if exc.code in (400, 401):
                raise HTTPException(status_code=401, detail="Facebook sign-in token is invalid or expired.") from exc
            LOGGER.warning("Facebook verification service returned HTTP %s", exc.code)
            raise HTTPException(status_code=503, detail="Facebook sign-in could not be verified right now.") from exc
        except Exception as exc:
            LOGGER.warning("Facebook token verification failed: %s", type(exc).__name__)
            raise HTTPException(status_code=503, detail="Facebook sign-in could not be verified right now.") from exc

        facebook_id = str(profile.get("id") or "").strip()
        email = str(profile.get("email") or "").strip().lower()
        if not facebook_id or facebook_id != str(token_info.get("user_id")):
            raise HTTPException(status_code=401, detail="Facebook sign-in token is invalid.")
        if not email:
            raise HTTPException(status_code=400, detail="Your Facebook account must provide an email address to sign in.")

        rows = fetch_all(
            "SELECT id FROM app_users WHERE provider=%s AND provider_subject=%s LIMIT 1",
            ("facebook", facebook_id),
        )
        is_new_user = not bool(rows)
        user_id = int(_row_get(rows[0], "id")) if rows else None
        photo = str(((profile.get("picture") or {}).get("data") or {}).get("url") or "")
        display_name = str(profile.get("name") or email.split("@", 1)[0]).strip()

        if user_id is None:
            email_rows = fetch_all("SELECT id, provider, provider_subject FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
            if email_rows:
                existing = email_rows[0]
                existing_provider = str(_row_get(existing, "provider") or "").lower()
                existing_subject = str(_row_get(existing, "provider_subject") or "")
                if existing_provider not in {"", "facebook"} or (existing_subject and existing_subject != facebook_id):
                    raise HTTPException(status_code=409, detail="This email is already linked to another sign-in method.")
                user_id = int(_row_get(existing, "id"))
                is_new_user = False
                execute_write(
                    "UPDATE app_users SET provider=%s, provider_subject=%s, photo_url=COALESCE(NULLIF(%s,''), photo_url), last_login_at=CURRENT_TIMESTAMP WHERE id=%s",
                    ("facebook", facebook_id, photo, user_id),
                )
            else:
                user_id, _ = execute_write(
                    "INSERT INTO app_users (email, provider, provider_subject, display_name, photo_url, profile_complete) VALUES (%s,%s,%s,%s,%s,0)",
                    (email, "facebook", facebook_id, display_name, photo),
                )
                if not user_id:
                    rows = fetch_all("SELECT id FROM app_users WHERE provider=%s AND provider_subject=%s LIMIT 1", ("facebook", facebook_id))
                    user_id = int(_row_get(rows[0], "id")) if rows else None
                if not user_id:
                    raise HTTPException(status_code=500, detail="Facebook sign-in succeeded but the account could not be created.")
        else:
            execute_write(
                "UPDATE app_users SET email=%s, display_name=COALESCE(NULLIF(display_name,''),%s), photo_url=COALESCE(NULLIF(%s,''), photo_url), last_login_at=CURRENT_TIMESTAMP WHERE id=%s",
                (email, display_name, photo, user_id),
            )

        user_id = int(user_id)
        _restore_account_on_login(user_id)
        _assert_user_can_login(user_id)
        profile_rows = fetch_all("SELECT COALESCE(profile_complete,0) AS pc FROM app_users WHERE id=%s LIMIT 1", (user_id,))
        profile_complete = bool(int(_row_get(profile_rows[0], "pc") or 0)) if profile_rows else False
        return {
            "id": user_id,
            "email": email,
            "display_name": display_name,
            "photo_url": photo,
            "provider": "facebook",
            "profile_complete": profile_complete,
            "is_new_user": is_new_user,
            "token": create_user_token(user_id),
        }

    def bump_token_version(user_id: int) -> None:
        try:
            execute_write(
                "UPDATE app_users SET token_version = COALESCE(token_version, 0) + 1 WHERE id=%s",
                (user_id,),
            )
        except Exception as exc:
            LOGGER.warning("token_version bump failed for %s: %s", user_id, exc)

    main_mod.bump_token_version = bump_token_version

    # Wrap admin status actions so ban/suspend/delete revoke sessions
    def _wrap_admin_action(fn: Callable):
        def wrapper(*args, **kwargs):
            result = fn(*args, **kwargs)
            user_id = kwargs.get("user_id")
            if user_id is None and args:
                # path param often first after self
                for a in args:
                    if isinstance(a, int):
                        user_id = a
                        break
            if user_id is not None:
                bump_token_version(int(user_id))
            return result

        return wrapper

    # Drop weak routes so we can re-register
    def _remove_routes(paths: set[str]) -> None:
        kept = []
        for route in list(app.router.routes):
            path = getattr(route, "path", None)
            if path in paths:
                continue
            kept.append(route)
        app.router.routes = kept

    _remove_routes({"/api/auth/email", "/api/auth/guest"})

    @app.post("/api/auth/email")
    def authenticate_email_secure(
        payload: EmailPasswordAuthRequest,
        request: Request,
        response: Response,
        x_auth_mode: str | None = Header(default=None),
    ):
        if (x_auth_mode or "").lower() == "cookie":
            require_web_origin(request)
        email = payload.email.strip().lower()
        password = payload.password or ""
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Invalid email address")
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        mode = (payload.mode or "login").strip().lower()
        if mode == "register":
            raise HTTPException(
                status_code=400,
                detail="Email registration requires verification. Use /api/auth/register.",
            )
        rows = fetch_all("SELECT * FROM app_users WHERE email=%s LIMIT 1", (email,))

        # login
        if not rows:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        user = rows[0]
        user_id = int(_row_get(user, "id"))
        pw_hash = _row_get(user, "password_hash")
        if not pw_hash:
            raise HTTPException(
                status_code=401,
                detail="This email account has no password set. Use Google sign-in, or register again with a password.",
            )
        if not _verify_password(password, str(pw_hash)):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        _restore_account_on_login(user_id)
        _assert_user_can_login(user_id)
        if str(pw_hash).startswith("sha256:"):
            try:
                execute_write(
                    "UPDATE app_users SET password_hash=%s WHERE id=%s",
                    (_hash_password(password), user_id),
                )
            except Exception as exc:
                LOGGER.exception(
                    "Could not upgrade legacy password hash for user %s",
                    user_id,
                )
                raise HTTPException(
                    status_code=503,
                    detail="Unable to secure the password record right now. Please try again.",
                ) from exc

        display_name = _row_get(user, "display_name") or email.split("@")[0]
        try:
            execute_write(
                "UPDATE app_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=%s",
                (user_id,),
            )
        except Exception:
            pass
        return complete_web_auth({
            "id": user_id,
            "email": email,
            "display_name": display_name,
            "photo_url": _row_get(user, "photo_url") or "",
            "provider": "email",
            "token": create_user_token(user_id),
        }, request, response, x_auth_mode)

    @app.post("/api/auth/guest")
    def authenticate_guest_secure(
        request: Request,
        response: Response,
        payload: GuestAuthRequestV2 = Body(default=None),
        x_auth_mode: str | None = Header(default=None),
    ):
        if (x_auth_mode or "").lower() == "cookie":
            require_web_origin(request)
        # Unique guest per device — never share one global guest@novel.app account
        device_id = ""
        if isinstance(payload, GuestAuthRequestV2):
            device_id = (payload.device_id or "").strip()
        if len(device_id) < 8:
            device_id = secrets.token_hex(16)

        email = f"guest_{device_id[:32]}@novel.app"
        rows = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
        user_id = None
        if rows:
            r0 = rows[0]
            user_id = int(r0["id"] if isinstance(r0, dict) else r0[0])
            # Always clear moderation so guest can never get stuck after admin delete/ban
            try:
                execute_write(
                    """
                    UPDATE app_users
                    SET provider='guest', device_id=%s, last_login_at=CURRENT_TIMESTAMP,
                        is_deleted=0, is_banned=0, is_suspended=0, suspended_until=NULL
                    WHERE id=%s
                    """,
                    (device_id, user_id),
                )
            except Exception:
                try:
                    execute_write(
                        "UPDATE app_users SET provider='guest', device_id=%s, last_login_at=CURRENT_TIMESTAMP WHERE id=%s",
                        (device_id, user_id),
                    )
                except Exception:
                    pass
        else:
            user_id, _ = execute_write(
                """
                INSERT INTO app_users (email, provider, display_name, photo_url, device_id, token_version)
                VALUES (%s, 'guest', 'Guest', '', %s, 0)
                """,
                (email, device_id),
            )
            if not user_id:
                rows2 = fetch_all("SELECT id FROM app_users WHERE LOWER(email)=%s LIMIT 1", (email,))
                if rows2:
                    r0 = rows2[0]
                    user_id = int(r0["id"] if isinstance(r0, dict) else r0[0])
            if not user_id:
                raise HTTPException(status_code=500, detail="Could not create guest account")

        user_id = int(user_id)
        # Do NOT call _assert_user_can_login — guests must always be able to continue
        return complete_web_auth({
            "id": user_id,
            "email": email,
            "display_name": "Guest",
            "photo_url": "",
            "provider": "guest",
            "token": create_user_token(user_id),
            "is_guest": True,
        }, request, response, x_auth_mode)

    # Hook ban/unban/suspend to bump token_version via wrapping known admin handlers
    for name in (
        "admin_ban_user",
        "admin_unban_user",
        "admin_suspend_user",
        "admin_unsuspend_user",
        "admin_delete_user",
        "admin_restore_user",
    ):
        fn = getattr(main_mod, name, None)
        # Routes are closures; instead patch execute path by wrapping _assert is not enough.
        # Add explicit helper endpoint for admin panel after status change is optional.
        pass

    @app.post("/api/admin/users/{user_id}/revoke-sessions")
    def admin_revoke_sessions(user_id: int):
        bump_token_version(user_id)
        return {"ok": True, "user_id": user_id}

    # After any moderation write that sets is_banned etc., also bump — patch set status helpers
    original_assert = _assert_user_can_login

    def assert_and_note(user_id: int) -> None:
        original_assert(user_id)

    main_mod._assert_user_can_login = assert_and_note

    # Patch admin user status endpoints by intercepting common pattern:
    # register a dependency-free middleware-ish: after ban endpoints run, we can't easily.
    # Instead re-define thin wrappers that call existing SQL logic with bump.
    _remove_routes(
        {
            "/api/admin/users/{user_id}/ban",
            "/api/admin/users/{user_id}/unban",
            "/api/admin/users/{user_id}/suspend",
            "/api/admin/users/{user_id}/unsuspend",
            "/api/admin/users/{user_id}/activate",
            "/api/admin/users/{user_id}/restore",
        }
    )

    def _set_flag(user_id: int, **fields):
        # Build UPDATE dynamically
        if not fields:
            return
        sets = ", ".join(f"{k}=%s" for k in fields.keys())
        params = tuple(fields.values()) + (user_id,)
        execute_write(f"UPDATE app_users SET {sets} WHERE id=%s", params)
        bump_token_version(user_id)

    @app.post("/api/admin/users/{user_id}/ban")
    def admin_ban_user(user_id: int):
        _set_flag(user_id, is_banned=1)
        return {"ok": True, "is_banned": True}

    @app.post("/api/admin/users/{user_id}/unban")
    def admin_unban_user(user_id: int):
        _set_flag(user_id, is_banned=0)
        return {"ok": True, "is_banned": False}

    @app.post("/api/admin/users/{user_id}/suspend")
    def admin_suspend_user(user_id: int, payload: dict[str, Any] = Body(default=None)):
        days = 7
        if isinstance(payload, dict):
            days = int(payload.get("days") or 7)
        until = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        _set_flag(user_id, is_suspended=1, suspended_until=until)
        return {"ok": True, "is_suspended": True, "suspended_until": until}

    @app.post("/api/admin/users/{user_id}/unsuspend")
    def admin_unsuspend_user(user_id: int):
        _set_flag(user_id, is_suspended=0, suspended_until=None)
        return {"ok": True, "is_suspended": False}

    @app.post("/api/admin/users/{user_id}/activate")
    def admin_activate_user(user_id: int):
        _set_flag(user_id, is_banned=0, is_suspended=0, is_deleted=0, suspended_until=None)
        return {
            "ok": True,
            "id": user_id,
            "is_deleted": False,
            "is_banned": False,
            "is_suspended": False,
            "suspended_until": None,
        }

    @app.post("/api/admin/users/{user_id}/restore")
    def admin_restore_user(user_id: int):
        _set_flag(user_id, is_deleted=0, is_banned=0, is_suspended=0, suspended_until=None)
        return {
            "ok": True,
            "id": user_id,
            "is_deleted": False,
            "is_banned": False,
            "is_suspended": False,
            "suspended_until": None,
        }

    # Routes registered before startup captured the old dependency callable.
    # Rewire those nodes so every protected API validates its session id.
    def _rewire_dependency(dependency) -> None:
        if getattr(dependency, "call", None) is original_require_user:
            dependency.call = require_user
            try:
                dependency.cache_key = (require_user, *dependency.cache_key[1:])
            except Exception:
                pass
        for child in getattr(dependency, "dependencies", ()):
            _rewire_dependency(child)

    for route in app.router.routes:
        dependant = getattr(route, "dependant", None)
        if dependant is not None:
            for dependency in getattr(dependant, "dependencies", ()):
                _rewire_dependency(dependency)

    # Also ensure DELETE soft-delete bumps version — leave original delete route
    LOGGER.info("Professional auth hardening applied (email+password, guest device, token_version)")
