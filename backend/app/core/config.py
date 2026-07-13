from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    app_name: str = "Accounting"
    env: str = "local"
    uvicorn_port: int = 8000
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    mongodb_db: str = "accounting"
    jwt_secret: str = "accounting-local-dev-secret"
    jwt_expires_minutes: int = 1440
    auth_cookie_name: str = "accounting_session"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cors_origins: str = "http://localhost:8443,http://127.0.0.1:8443"
    allowed_hosts: str = "localhost,127.0.0.1,testserver"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "no-reply@accounting.local"
    otp_expires_minutes: int = 10
    otp_resend_cooldown_seconds: int = 60

    model_config = SettingsConfigDict(
        env_file=ENV_FILE, env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]


settings = Settings()
