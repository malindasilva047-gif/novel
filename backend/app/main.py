from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.rate_limit import rate_limiter
from app.db.mongodb import close_mongo_connection, connect_to_mongo
from app.db.mongodb import db
from app.services.email import check_smtp_connection

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(title=settings.project_name, lifespan=lifespan)

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://.*$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)

upload_dir = Path(settings.upload_dir)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.middleware("http")
async def global_rate_limit(request: Request, call_next):
    # Let CORS preflight and health checks pass through untouched.
    if request.method == "OPTIONS" or request.url.path == "/health":
        return await call_next(request)

    client_ip = request.client.host if request.client else "unknown"
    allowed = rate_limiter.is_allowed(
        key=client_ip,
        max_requests=settings.rate_limit_requests,
        window_seconds=settings.rate_limit_window_seconds,
    )
    if not allowed:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Try again later."})

    return await call_next(request)


@app.get("/health")
async def health_check() -> dict:
    smtp_connected, smtp_error = check_smtp_connection()
    return {
        "status": "ok",
        "database_connected": db.database is not None,
        "database_error": db.connection_error,
        "smtp_connected": smtp_connected,
        "smtp_error": smtp_error,
    }


@app.get("/", response_class=HTMLResponse)
async def root() -> str:
    return """
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Novel API</title>
    <style>
        body { font-family: Segoe UI, Arial, sans-serif; background: #0f1115; color: #e8edf2; margin: 0; }
        .wrap { max-width: 760px; margin: 56px auto; padding: 0 20px; }
        .card { background: #171b22; border: 1px solid #2a3140; border-radius: 12px; padding: 20px; }
        h1 { margin: 0 0 12px; font-size: 22px; }
        p { color: #b8c1cf; line-height: 1.55; }
        a { color: #6fd3ff; text-decoration: none; }
        code { background: #0f1115; padding: 2px 6px; border-radius: 6px; border: 1px solid #2a3140; }
        ul { margin-top: 14px; }
        li { margin: 8px 0; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <h1>Novel Reading and Writing Platform API</h1>
            <p>This is the backend API service.</p>
            <ul>
                <li>Frontend app: <a href="http://127.0.0.1:3000">http://127.0.0.1:3000</a></li>
                <li>Health: <a href="/health"><code>/health</code></a></li>
                <li>API base: <code>/api/v1</code></li>
            </ul>
        </div>
    </div>
</body>
</html>
"""
