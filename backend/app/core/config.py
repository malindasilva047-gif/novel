from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    project_name: str = "Novel Reading and Writing Platform API"
    api_v1_prefix: str = "/api/v1"

    mongodb_uri: str = "mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority"
    mongodb_db_name: str = "novel_platform"

    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: str = "http://localhost:3000"

    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60

    discovery_cache_ttl_seconds: int = 30

    upload_dir: str = "uploads"
    public_backend_base_url: str = "http://localhost:8000"

    admin_bootstrap_key: str = "change-this-admin-bootstrap-key"
    default_admin_username: str = "admin"
    default_admin_email: str = "admin@example.com"
    default_admin_password: str = "admin"

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Novel Platform"
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
