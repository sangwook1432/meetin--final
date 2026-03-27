from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = Field(default="MEETIN API", alias="APP_NAME")
    env: str = Field(default="local", alias="ENV")
    debug: bool = Field(default=True, alias="DEBUG")

    database_url: str = Field(alias="DATABASE_URL")

    # ─── DB Connection Pool ───────────────────────────────────────
    db_pool_size:    int = Field(default=10,   alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20,   alias="DB_MAX_OVERFLOW")
    db_pool_timeout: int = Field(default=30,   alias="DB_POOL_TIMEOUT")
    db_pool_recycle: int = Field(default=1800, alias="DB_POOL_RECYCLE")

    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_alg: str = Field(default="HS256", alias="JWT_ALG")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days: int = Field(default=14, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    phone_hmac_secret: str = Field(alias="PHONE_HMAC_SECRET")

    admin_usernames: str = Field(default="", alias="ADMIN_USERNAMES")

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

    # ─── PASS 휴대폰 본인인증 (Solapi SMS) ──────────────────────────
    # https://developers.solapi.com → API 키 발급 후 아래 3개만 입력
    pass_api_key: str = Field(default="", alias="PASS_API_KEY")
    pass_api_secret: str = Field(default="", alias="PASS_API_SECRET")
    pass_sender_number: str = Field(default="", alias="PASS_SENDER_NUMBER")

    # ─── Redis ───────────────────────────────────────────────────
    # 없으면 WebSocket 인메모리 모드, 스케줄러 단일 실행 모드로 fallback
    redis_url: str = Field(default="", alias="REDIS_URL")

    # ─── Cloudflare R2 ───────────────────────────────────────────
    r2_endpoint_url: str = Field(default="", alias="R2_ENDPOINT_URL")
    r2_access_key_id: str = Field(default="", alias="R2_ACCESS_KEY_ID")
    r2_secret_access_key: str = Field(default="", alias="R2_SECRET_ACCESS_KEY")
    r2_bucket_name: str = Field(default="meetin-uploads", alias="R2_BUCKET_NAME")
    r2_public_url: str = Field(default="", alias="R2_PUBLIC_URL")

    # ─── Sentry ──────────────────────────────────────────────────
    sentry_dsn: str = Field(default="", alias="SENTRY_DSN")

    def admin_username_set(self) -> set[str]:
        raw = (self.admin_usernames or "").strip()
        if not raw:
            return set()
        return {u.strip().lower() for u in raw.split(",") if u.strip()}

    def allowed_origins_list(self) -> list[str]:
        """환경변수 하나로 여러 origin 관리 — 배포 시 프론트 도메인만 추가하면 됨"""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
