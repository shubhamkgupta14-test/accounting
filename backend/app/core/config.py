from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    # Application defaults belong here. Every field may still be overridden by
    # an environment variable with the same uppercase name when a deployment
    # needs a custom value. Keep secrets and machine-specific values in .env.
    app_name: str = "Accounting"
    env: str = "local"
    uvicorn_port: int = 8000
    mongodb_uri: str = "mongodb://127.0.0.1:27017"
    mongodb_db: str = "accounting"
    jwt_secret: str = "accounting-local-dev-secret"
    jwt_expires_minutes: int = 480
    jwt_issuer: str = "accounting-api"
    jwt_audience: str = "accounting-app"
    auth_cookie_name: str = "accounting_session"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8443,http://127.0.0.1:8443"
    )
    allowed_hosts: str = "localhost,127.0.0.1,testserver"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "no-reply@accounting.local"
    otp_expires_minutes: int = 10
    otp_resend_cooldown_seconds: int = 60
    max_json_body_bytes: int = 2 * 1024 * 1024
    max_excel_upload_bytes: int = 5 * 1024 * 1024
    max_excel_uncompressed_bytes: int = 25 * 1024 * 1024
    max_excel_rows: int = 20_000
    max_excel_columns: int = 50
    max_excel_new_accounts: int = 500
    api_requests_per_minute: int = 240
    report_requests_per_minute: int = 60
    import_requests_per_minute: int = 12
    ai_requests_per_minute: int = 30
    ai_key_idle_minutes: int = 30
    ai_max_history_messages: int = 20
    ai_default_history_messages: int = 12
    ai_max_message_chars: int = 2_000
    ai_max_context_chars: int = 12_000
    xai_model: str = "grok-4.3"
    xai_base_url: str = "https://api.x.ai/v1"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    xai_timeout_seconds: float = 25.0
    max_comparative_periods: int = 10
    max_report_rows: int = 20_000

    model_config = SettingsConfigDict(
        env_file=ENV_FILE, env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_host_list(self) -> list[str]:
        return [host.strip() for host in self.allowed_hosts.split(",") if host.strip()]

    @property
    def environment(self) -> str:
        return self.env.strip().lower()

    @property
    def is_test_or_dev(self) -> bool:
        return self.environment in {"dev", "development", "test"}

    @property
    def is_secure_environment(self) -> bool:
        return self.environment in {"stage", "staging", "prod", "production"}

    @property
    def docs_enabled(self) -> bool:
        return not self.is_secure_environment


settings = Settings()
