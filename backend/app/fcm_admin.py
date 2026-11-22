"""Firebase Admin sender used for authenticated device push notifications."""

import json
import logging
import os
from pathlib import Path
from threading import Lock
from typing import Any

LOGGER = logging.getLogger(__name__)
_app = None
_lock = Lock()


def _firebase_app():
    global _app
    if _app is not None:
        return _app
    with _lock:
        if _app is not None:
            return _app
        raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
        path = os.getenv("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip()
        if raw:
            info = json.loads(raw)
        elif path:
            info = json.loads(Path(path).read_text(encoding="utf-8"))
        else:
            return None
        import firebase_admin
        from firebase_admin import credentials

        try:
            _app = firebase_admin.get_app()
        except ValueError:
            _app = firebase_admin.initialize_app(credentials.Certificate(info))
        return _app


def send_to_tokens(
    tokens: list[str], title: str, body: str, data: dict[str, Any] | None = None
) -> set[str]:
    """Send a high priority visible notification; return invalid token strings."""
    if not tokens:
        return set()
    app = _firebase_app()
    if app is None:
        LOGGER.info("FCM sender not configured; skipped %s push target(s)", len(tokens))
        return set()
    from firebase_admin import messaging

    invalid: set[str] = set()
    for token in tokens:
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data={str(key): str(value) for key, value in (data or {}).items()},
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    channel_id="wingsaga_activity",
                    icon="ic_stat_wingsaga",
                    color="#128C70",
                ),
            ),
        )
        try:
            messaging.send(message, app=app)
        except messaging.UnregisteredError:
            invalid.add(token)
        except Exception:
            LOGGER.exception("FCM message send failed")
    return invalid
