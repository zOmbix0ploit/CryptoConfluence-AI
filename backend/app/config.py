from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    log_level: str = "INFO"
    fastapi_base_url: str = "http://localhost:8000"
    backend_cors_origins: str = "http://localhost:3000"

    supabase_url: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    )
    supabase_service_role_key: str = ""
    supabase_anon_key: str = Field(
        default="",
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    )

    binance_base_url: str = "https://api.binance.com"
    binance_ws_url: str = "wss://stream.binance.com:9443/ws"

    coinmarketcap_api_key: str = ""
    crypto_news_api_key: str = ""
    cryptopanic_auth_token: str = ""
    news_rss_urls: str = (
        "https://www.coindesk.com/arc/outboundfeeds/rss/,https://cointelegraph.com/rss"
    )

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    google_ai_api_key: str = ""
    llm_provider: Literal["openai", "anthropic", "google"] = "openai"

    signal_cooldown_minutes: int = 30
    signal_expiration_minutes: int = 240
    default_timeframe: str = "15m"
    min_stop_distance_pct: float = 1.5
    max_stop_distance_pct: float = 3.5
    stop_buffer_pct: float = 0.5
    min_tp1_r: float = 1.5
    min_tp2_r: float = 2.5
    aggressive_mode: bool = False
    news_ingest_interval_seconds: int = 300

    notify_browser: bool = True
    notify_discord: bool = False
    discord_webhook_url: str = ""
    notify_discord_pnl: bool = True
    discord_pnl_webhook_url: str = ""
    pnl_alert_on_tp: bool = True
    pnl_alert_on_sl: bool = True
    pnl_alert_on_milestone: bool = True
    pnl_profit_threshold_pct: float = 1.0
    pnl_loss_threshold_pct: float = 1.0
    notify_telegram: bool = False
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    weight_news: float = 0.25
    weight_momentum: float = 0.20
    weight_volume: float = 0.15
    weight_supertrend: float = 0.15
    weight_ewo: float = 0.10
    weight_rsi: float = 0.05
    weight_sr: float = 0.10

    ticker_cache_ttl_seconds: int = 8
    candle_cache_ttl_seconds: int = 20
    news_cache_ttl_seconds: int = 60
    technical_cache_ttl_seconds: int = 25
    screener_limit: int = 120
    min_quote_volume_usdt: float = 1_000_000
    kline_limit: int = 120

    @field_validator("backend_cors_origins")
    @classmethod
    def _strip_origins(cls, value: str) -> str:
        return value.strip()

    @field_validator("supabase_url")
    @classmethod
    def _normalize_supabase_url(cls, value: str) -> str:
        val = value.strip().rstrip("/")
        prefix = "https://supabase.com/dashboard/project/"
        if val.startswith(prefix):
            project_ref = val[len(prefix):].split("/")[0]
            if project_ref:
                return f"https://{project_ref}.supabase.co"
        return val

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.backend_cors_origins.split(",") if item.strip()]

    @property
    def rss_url_list(self) -> list[str]:
        return [item.strip() for item in self.news_rss_urls.split(",") if item.strip()]

    @property
    def confluence_weights(self) -> dict[str, float]:
        return {
            "news": self.weight_news,
            "momentum": self.weight_momentum,
            "volume": self.weight_volume,
            "supertrend": self.weight_supertrend,
            "ewo": self.weight_ewo,
            "rsi": self.weight_rsi,
            "sr": self.weight_sr,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
