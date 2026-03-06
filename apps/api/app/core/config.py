from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = Field(default="MEETIN API", alias="APP_NAME")
    env: str = Field(default="local", alias="ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    database_url: str = Field(alias="DATABASE_URL")

    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_alg: str = Field(default="HS256", alias="JWT_ALG")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=14, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    phone_hmac_secret: str = Field(alias="PHONE_HMAC_SECRET")

    admin_emails: str = Field(default="", alias="ADMIN_EMAILS")

    # CORS: 콤마 구분 허용 origin 목록
    allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="ALLOWED_ORIGINS",
    )

    # ─── Toss Payments ───────────────────────────────────────────
    # 테스트 키: https://developers.tosspayments.com/
    toss_secret_key: str = Field(default="", alias="TOSS_SECRET_KEY")
    toss_client_key: str = Field(default="", alias="TOSS_CLIENT_KEY")

    # ─── 카카오 알림톡 ────────────────────────────────────────────
    kakao_api_key: str = Field(default="", alias="KAKAO_API_KEY")
    kakao_sender_key: str = Field(default="", alias="KAKAO_SENDER_KEY")
    # 템플릿 코드 (카카오 비즈메시지 채널에서 승인 후 발급)
    kakao_template_waiting_confirm: str = Field(default="MEETIN_WAIT", alias="KAKAO_TPL_WAITING_CONFIRM")
    kakao_template_confirmed: str = Field(default="MEETIN_CONF", alias="KAKAO_TPL_CONFIRMED")
    kakao_template_refunded: str = Field(default="MEETIN_RFND", alias="KAKAO_TPL_REFUNDED")
    kakao_template_forfeited: str = Field(default="MEETIN_FORF", alias="KAKAO_TPL_FORFEITED")
    kakao_template_replacement: str = Field(default="MEETIN_REPL", alias="KAKAO_TPL_REPLACEMENT")

    # ─── Sentry ──────────────────────────────────────────────────
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")

    def admin_email_set(self) -> set[str]:
        raw = (self.admin_emails or "").strip()
        if not raw:
            return set()
        return {e.strip().lower() for e in raw.split(",") if e.strip()}

    def allowed_origins_list(self) -> list[str]:
        """환경변수 하나로 여러 origin 관리 — 배포 시 프론트 도메인만 추가하면 됨"""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
