"""
On-demand responsive image variants (WebP + optional AVIF).
Serves resized images for /uploads/* and /api/media/* without changing DB paths or UI.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError

LOGGER = logging.getLogger("image_variants")

# Allowed widths for srcset (matches media endpoint style)
ALLOWED_WIDTHS = {300, 320, 600, 640, 960, 1200, 1280}
VARIANT_ROOT = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve() / ".variants"
VARIANT_ROOT.mkdir(parents=True, exist_ok=True)

_SAFE_SRC = re.compile(r"^/(uploads|api/media)/[A-Za-z0-9._\-/]+$")


def _cache_key(src: str, width: int, fmt: str) -> Path:
    digest = hashlib.sha1(f"{src}|{width}|{fmt}".encode("utf-8")).hexdigest()
    return VARIANT_ROOT / f"{digest}.{fmt}"


def _load_source_bytes(src: str, fetch_media) -> tuple[bytes, str]:
    """fetch_media(media_id) -> (bytes, content_type) provided by main."""
    src = src.split("?", 1)[0]
    if src.startswith("/api/media/"):
        try:
            media_id = int(src.rstrip("/").rsplit("/", 1)[-1])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid media id") from exc
        data, ctype = fetch_media(media_id)
        return data, ctype or "image/jpeg"
    if src.startswith("/uploads/"):
        name = src[len("/uploads/") :].lstrip("/")
        if ".." in name or name.startswith("/") or not name:
            raise HTTPException(status_code=400, detail="Invalid upload path")
        path = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve() / name
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Image not found")
        return path.read_bytes(), "image/jpeg"
    raise HTTPException(status_code=400, detail="Unsupported image source")


def _encode(image: Image.Image, fmt: str, quality: int = 80) -> bytes:
    out = BytesIO()
    if fmt == "avif":
        try:
            image.save(out, format="AVIF", quality=quality)
            return out.getvalue()
        except Exception:
            # Fall through to webp if AVIF encoder missing
            fmt = "webp"
            out = BytesIO()
    if "A" in image.getbands():
        image = image.convert("RGBA")
        image.save(out, format="WEBP", quality=quality, method=4)
    else:
        image = image.convert("RGB")
        image.save(out, format="WEBP", quality=quality, method=4)
    return out.getvalue()


def make_variant(source: bytes, width: int, prefer_avif: bool = False) -> tuple[bytes, str]:
    try:
        with Image.open(BytesIO(source)) as im:
            image = ImageOps.exif_transpose(im)
            if image.width > width:
                image.thumbnail((width, max(width * 4, 1)), Image.Resampling.LANCZOS)
            if prefer_avif:
                try:
                    data = _encode(image, "avif")
                    # WebP RIFF signature means encoder fell back
                    if data[:4] != b"RIFF":
                        return data, "image/avif"
                except Exception:
                    pass
            data = _encode(image, "webp")
            return data, "image/webp"
    except (UnidentifiedImageError, OSError) as exc:
        LOGGER.warning("variant failed: %s", exc)
        raise HTTPException(status_code=415, detail="Could not process image") from exc


def register_image_routes(app: FastAPI, fetch_media) -> None:
    """
    Register GET /api/img?src=...&w=600&fmt=webp|avif
    fetch_media(id) must return (bytes, content_type).
    """

    @app.get("/api/img")
    def get_image_variant(
        request: Request,
        src: str = Query(..., min_length=3, max_length=512),
        w: int = Query(600, ge=160, le=1280),
        fmt: str = Query("webp", pattern="^(webp|avif)$"),
    ):
        src = src.strip()
        if not _SAFE_SRC.match(src.split("?", 1)[0]):
            raise HTTPException(status_code=400, detail="Invalid src")
        # Snap to nearest allowed width
        width = min(ALLOWED_WIDTHS, key=lambda x: abs(x - w))
        prefer_avif = fmt == "avif"
        cache_path = _cache_key(src, width, "avif" if prefer_avif else "webp")

        if cache_path.is_file() and cache_path.stat().st_size > 0:
            data = cache_path.read_bytes()
            media_type = "image/avif" if prefer_avif and data[:4] != b"RIFF" else "image/webp"
            if data[:4] == b"RIFF":
                media_type = "image/webp"
            return Response(
                content=data,
                media_type=media_type,
                headers={
                    "Cache-Control": "public, max-age=31536000, immutable",
                    "Vary": "Accept",
                },
            )

        source, _ = _load_source_bytes(src, fetch_media)
        data, media_type = make_variant(source, width, prefer_avif=prefer_avif)
        try:
            cache_path.write_bytes(data)
        except OSError as exc:
            LOGGER.info("variant cache write skipped: %s", exc)

        return Response(
            content=data,
            media_type=media_type,
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "Vary": "Accept",
            },
        )
