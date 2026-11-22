from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


settings = get_settings()


@dataclass
class RunContext:
    mode: str
    base_url: str
    admin_identifier: str
    admin_password: str


def _print_result(name: str, ok: bool, details: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    suffix = f" :: {details}" if details else ""
    print(f"[{status}] {name}{suffix}")


def _assert(condition: bool, name: str, details: str = "") -> None:
    if not condition:
        raise AssertionError(f"{name}: {details}" if details else name)
    _print_result(name, True, details)


class RemoteSession:
    def __init__(self, base_url: str):
        self.client = httpx.Client(base_url=base_url, timeout=30.0)

    def request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        return self.client.request(method, path, **kwargs)

    def close(self) -> None:
        self.client.close()


class LocalSession:
    def __init__(self):
        self._context = TestClient(app)
        self.client = self._context.__enter__()

    def request(self, method: str, path: str, **kwargs: Any):
        return self.client.request(method, path, **kwargs)

    def close(self) -> None:
        self._context.__exit__(None, None, None)


def login(session: Any, identifier: str, password: str) -> tuple[str, dict[str, Any]]:
    response = session.request(
        "POST",
        f"{settings.api_v1_prefix}/auth/login",
        json={"identifier": identifier, "password": password},
    )
    _assert(response.status_code == 200, "admin login", response.text[:300])
    payload = response.json()
    token = payload.get("access_token")
    _assert(bool(token), "admin token issued")
    return token, payload


def get_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def request_ok(session: Any, method: str, path: str, name: str, token: str, expected_status: int = 200, **kwargs: Any):
    response = session.request(method, path, headers=get_headers(token), **kwargs)
    _assert(response.status_code == expected_status, name, f"status={response.status_code} body={response.text[:300]}")
    return response


def run_suite(session: Any, context: RunContext) -> None:
    token, _ = login(session, context.admin_identifier, context.admin_password)

    panel = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/panel-data", "panel-data", token).json()
    stories = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/stories", "stories-list", token).json()
    reports = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/reports", "reports-list", token).json()
    languages_payload = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/languages", "languages-list", token).json()
    cms_pages_payload = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/cms-pages", "cms-pages-list", token).json()
    settings_before = request_ok(session, "GET", f"{settings.api_v1_prefix}/admin/settings/full", "settings-read", token).json()
    me_before = request_ok(session, "GET", f"{settings.api_v1_prefix}/users/me", "profile-read", token).json()
    languages = languages_payload.get("items", []) if isinstance(languages_payload, dict) else languages_payload
    cms_pages = cms_pages_payload.get("items", []) if isinstance(cms_pages_payload, dict) else cms_pages_payload
    avatars = panel.get("avatars", []) if isinstance(panel, dict) else []

    _assert(isinstance(panel, dict), "panel-data shape")
    _assert(isinstance(stories, list), "stories list shape", f"count={len(stories)}")
    _assert(isinstance(reports, list), "reports list shape", f"count={len(reports)}")
    _assert(isinstance(languages, list), "languages list shape", f"count={len(languages)}")
    _assert(isinstance(avatars, list), "avatars list shape", f"count={len(avatars)}")
    _assert(isinstance(cms_pages, list), "cms list shape", f"count={len(cms_pages)}")

    suffix = str(int(time.time()))
    temp_language = f"TempLang{suffix}"
    temp_avatar = f"TempAvatar{suffix}"
    temp_slug = f"temp-admin-smoke-{suffix}"
    temp_user_username = f"tempsmoke{suffix}"
    temp_user_email = f"tempsmoke{suffix}@example.com"
    temp_user_password = "TempSmoke123!"
    temp_user_id = ""
    temp_report_id = ""
    selected_story_id = stories[0]["id"] if stories else ""
    original_country = me_before.get("country", "")
    original_copyright = settings_before.get("copyright_text", "")
    temp_avatar_id = ""

    try:
        request_ok(
            session,
            "POST",
            f"{settings.api_v1_prefix}/admin/languages",
            "language-create",
            token,
            json={"name": temp_language, "country": "Testland", "status": "active", "is_default": False},
        )
        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/admin/languages/{temp_language}",
            "language-update",
            token,
            json={"country": "Testland Updated", "status": "inactive", "is_default": False},
        )

        avatar_create = request_ok(
            session,
            "POST",
            f"{settings.api_v1_prefix}/admin/avatars",
            "avatar-create",
            token,
            json={"name": temp_avatar, "gender": "other", "image_url": "https://example.com/avatar.png"},
        )
        temp_avatar_id = avatar_create.json().get("id", "")
        _assert(bool(temp_avatar_id), "avatar id returned")
        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/admin/avatars/{temp_avatar_id}",
            "avatar-update",
            token,
            json={"name": f"{temp_avatar}-updated", "gender": "female", "image_url": "https://example.com/avatar-2.png"},
        )

        request_ok(
            session,
            "POST",
            f"{settings.api_v1_prefix}/admin/cms-pages",
            "cms-create",
            token,
            json={
                "slug": temp_slug,
                "title": "Temp Smoke Page",
                "excerpt": "Smoke test excerpt",
                "content": "Smoke test content body",
                "is_published": True,
            },
        )
        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/admin/cms-pages/{temp_slug}",
            "cms-update",
            token,
            json={
                "slug": temp_slug,
                "title": "Temp Smoke Page Updated",
                "excerpt": "Updated excerpt",
                "content": "Updated smoke test content body",
                "is_published": False,
            },
        )

        user_create = request_ok(
            session,
            "POST",
            f"{settings.api_v1_prefix}/admin/users",
            "user-create",
            token,
            json={
                "username": temp_user_username,
                "email": temp_user_email,
                "password": temp_user_password,
                "full_name": "Temp Smoke User",
                "phone": "",
                "country": "Smoke Country",
                "preferred_language": temp_language,
                "gender": "other",
                "profile_image": "",
                "is_admin": False,
                "is_banned": False,
            },
        )
        temp_user_id = user_create.json().get("id", "")
        _assert(bool(temp_user_id), "user id returned")

        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/admin/users/{temp_user_id}",
            "user-update",
            token,
            json={"country": "Smoke Country Updated", "preferred_language": "English", "full_name": "Temp Smoke User Updated"},
        )
        request_ok(session, "POST", f"{settings.api_v1_prefix}/admin/users/{temp_user_id}/ban", "user-ban", token)
        request_ok(session, "POST", f"{settings.api_v1_prefix}/admin/users/{temp_user_id}/unban", "user-unban", token)

        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/users/me",
            "profile-update",
            token,
            json={
                "full_name": me_before.get("full_name") or me_before.get("username") or context.admin_identifier,
                "profile_image": me_before.get("profile_image", ""),
                "phone": me_before.get("phone", ""),
                "date_of_birth": me_before.get("date_of_birth", ""),
                "gender": me_before.get("gender", "male"),
                "country": f"Smoke-{suffix}",
                "preferred_language": me_before.get("preferred_language", "English"),
                "bio": me_before.get("bio", "Admin profile"),
                "location": me_before.get("location", "Admin HQ"),
                "favorite_genres": me_before.get("favorite_genres") or ["Administration"],
                "reading_goal": me_before.get("reading_goal", "Manage the platform"),
                "website": me_before.get("website", ""),
            },
        )

        updated_settings_payload = dict(settings_before)
        updated_settings_payload["copyright_text"] = f"{original_copyright} [smoke {suffix}]".strip()
        request_ok(
            session,
            "PATCH",
            f"{settings.api_v1_prefix}/admin/settings/full",
            "settings-update",
            token,
            json={"settings": updated_settings_payload},
        )

        if selected_story_id:
            temp_token, _ = login(session, temp_user_username, temp_user_password)
            request_ok(
                session,
                "POST",
                f"{settings.api_v1_prefix}/engagement/reports",
                "report-create",
                temp_token,
                json={"story_id": selected_story_id, "reason": f"Smoke report {suffix}"},
            )
            temp_report_id = f"{temp_user_id}::{selected_story_id}"
            request_ok(
                session,
                "POST",
                f"{settings.api_v1_prefix}/admin/reports/{temp_report_id}/resolve",
                "report-resolve",
                token,
            )
        else:
            _print_result("report-create", True, "skipped because no stories exist")
            _print_result("report-resolve", True, "skipped because no stories exist")

    finally:
        if temp_user_id:
            response = session.request("DELETE", f"{settings.api_v1_prefix}/admin/users/{temp_user_id}", headers=get_headers(token))
            _print_result("user-delete", response.status_code == 200, f"status={response.status_code}")

        if temp_avatar_id:
            response = session.request("DELETE", f"{settings.api_v1_prefix}/admin/avatars/{temp_avatar_id}", headers=get_headers(token))
            _print_result("avatar-delete", response.status_code == 200, f"status={response.status_code}")

        response = session.request("DELETE", f"{settings.api_v1_prefix}/admin/languages/{temp_language}", headers=get_headers(token))
        _print_result("language-delete", response.status_code == 200, f"status={response.status_code}")

        response = session.request("DELETE", f"{settings.api_v1_prefix}/admin/cms-pages/{temp_slug}", headers=get_headers(token))
        _print_result("cms-delete", response.status_code == 200, f"status={response.status_code}")

        if original_country != f"Smoke-{suffix}":
            response = session.request(
                "PATCH",
                f"{settings.api_v1_prefix}/users/me",
                headers=get_headers(token),
                json={
                    "full_name": me_before.get("full_name") or me_before.get("username") or context.admin_identifier,
                    "profile_image": me_before.get("profile_image", ""),
                    "phone": me_before.get("phone", ""),
                    "date_of_birth": me_before.get("date_of_birth", ""),
                    "gender": me_before.get("gender", "male"),
                    "country": original_country,
                    "preferred_language": me_before.get("preferred_language", "English"),
                    "bio": me_before.get("bio", "Admin profile"),
                    "location": me_before.get("location", "Admin HQ"),
                    "favorite_genres": me_before.get("favorite_genres") or ["Administration"],
                    "reading_goal": me_before.get("reading_goal", "Manage the platform"),
                    "website": me_before.get("website", ""),
                },
            )
            _print_result("profile-restore", response.status_code == 200, f"status={response.status_code}")

        restore_settings = dict(settings_before)
        response = session.request(
            "PATCH",
            f"{settings.api_v1_prefix}/admin/settings/full",
            headers=get_headers(token),
            json={"settings": restore_settings},
        )
        _print_result("settings-restore", response.status_code == 200, f"status={response.status_code}")


def build_context(mode: str) -> RunContext:
    base_url = settings.public_backend_base_url.rstrip("/")
    return RunContext(
        mode=mode,
        base_url=base_url,
        admin_identifier=settings.default_admin_username,
        admin_password=settings.default_admin_password,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run admin smoke tests locally or against the deployed backend.")
    parser.add_argument("--mode", choices=["local", "remote", "both"], default="both")
    args = parser.parse_args()

    modes = [args.mode] if args.mode != "both" else ["local", "remote"]
    failures: list[str] = []

    for mode in modes:
        context = build_context(mode)
        print(f"\n=== Running {mode} admin smoke tests ===")
        print(json.dumps({"mode": mode, "base_url": context.base_url, "admin_identifier": context.admin_identifier}, indent=2))
        session = LocalSession() if mode == "local" else RemoteSession(context.base_url)
        try:
            run_suite(session, context)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{mode}: {exc}")
            _print_result(f"{mode}-suite", False, str(exc))
        finally:
            session.close()

    if failures:
        print("\nSmoke test failures:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nAll requested admin smoke tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())