from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Sentiment = Literal["BULLISH", "BEARISH", "NEUTRAL"]
Impact = Literal["HIGH", "MEDIUM", "LOW"]
NewsCategory = Literal[
    "REGULATION",
    "EXPLOIT",
    "UNLOCK",
    "ADOPTION",
    "MACRO",
    "ETF",
    "LISTING",
    "DELISTING",
    "PARTNERSHIP",
    "TECHNOLOGY",
    "SECURITY",
    "OTHER",
]
RsiState = Literal[
    "EXTREME_OVERSOLD",
    "OVERSOLD",
    "NEUTRAL",
    "OVERBOUGHT",
    "EXTREME_OVERBOUGHT",
]
Trend = Literal["BULLISH", "BEARISH"]
EwoState = Literal[
    "BULLISH_ZERO_CROSS",
    "BEARISH_ZERO_CROSS",
    "BULLISH_MOMENTUM",
    "BEARISH_MOMENTUM",
    "NEUTRAL",
]
SignalType = Literal["LONG", "SHORT"]
SignalStatus = Literal[
    "PENDING",
    "ACTIVE",
    "TP1_HIT",
    "TP2_HIT",
    "STOPPED_OUT",
    "EXPIRED",
    "INVALIDATED",
]
ConfidenceLevel = Literal["WEAK", "LOW", "MODERATE", "STRONG", "EXTREME"]
UnlockRisk = Literal["SAFE", "ELEVATED", "EXCLUDE", "UNKNOWN"]
WsStatus = Literal["CONNECTED", "RECONNECTING", "DISCONNECTED"]


class Candle(BaseModel):
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: datetime
    quote_volume: float


class Ticker24h(BaseModel):
    symbol: str
    last_price: float
    price_change_percent: float
    high_price: float
    low_price: float
    volume: float
    quote_volume: float


class MarketRow(BaseModel):
    symbol: str
    display_symbol: str
    last_price: float
    price_change_15m: float | None
    price_change_1h: float | None
    price_change_24h: float
    high_24h: float
    low_24h: float
    volume_24h: float
    quote_volume_24h: float
    average_volume_30: float | None
    volume_ratio: float | None
    momentum_score: float
    data_freshness: Literal["live", "cached"] = "live"
    updated_at: datetime


class SupertrendResult(BaseModel):
    trend: Trend
    value: float
    support: float | None
    resistance: float | None
    series: list[float | None] = Field(default_factory=list)


class RsiResult(BaseModel):
    rsi: float
    rsi_state: RsiState


class EwoResult(BaseModel):
    ewo: float
    previous_ewo: float
    histogram_direction: Literal["UP", "DOWN", "FLAT"]
    zero_cross: bool
    state: EwoState
    series: list[float | None] = Field(default_factory=list)


class SwingResult(BaseModel):
    recent_swing_high: float
    recent_swing_low: float
    major_resistance: float
    major_support: float


class TechnicalSnapshot(BaseModel):
    symbol: str
    timeframe: str
    rsi: RsiResult
    supertrend: SupertrendResult
    ewo: EwoResult
    swings: SwingResult
    last_close: float
    candle_count: int
    calculated_at: datetime


class LlmSentiment(BaseModel):
    news_id: str
    headline: str
    ticker: str
    sentiment: Sentiment
    sentiment_score: float
    category: NewsCategory
    impact_level: Impact
    reason: str

    @field_validator("sentiment_score")
    @classmethod
    def _score_range(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise ValueError("sentiment_score must be between 0 and 1")
        return value

    @field_validator("ticker")
    @classmethod
    def _ticker_upper(cls, value: str) -> str:
        return value.upper().replace("USDT", "").strip()


class NewsArticle(BaseModel):
    news_id: str
    source: str
    source_quality: float
    headline: str
    url: str | None = None
    body: str | None = None
    published_at: datetime | None = None
    tickers: list[str] = Field(default_factory=list)
    is_rejected: bool = False
    rejection_reason: str | None = None


class NewsCard(BaseModel):
    news_id: str
    ticker: str
    headline: str
    sentiment: Sentiment
    sentiment_score: float
    impact_level: Impact
    category: NewsCategory
    source: str
    published_at: datetime | None
    confidence: float
    reason: str | None = None


class ConfluenceBreakdown(BaseModel):
    news: float
    momentum: float
    volume: float
    supertrend: float
    ewo: float
    rsi: float
    sr: float
    total: float
    level: ConfidenceLevel
    reasons: list[str]
    warnings: list[str]


TradeOutcome = Literal["PROFIT", "LOSS", "BREAKEVEN", "OPEN"]


class GeneratedSignal(BaseModel):
    signal_id: str
    coin: str
    symbol: str
    timeframe: str
    type: SignalType
    entry: float
    sl: float
    tp1: float
    tp2: float
    risk_percentage: float
    risk_reward_tp1: float
    risk_reward_tp2: float
    confidence_score: int
    confidence_level: ConfidenceLevel
    confluence_reasons: list[str]
    warnings: list[str]
    timestamp: datetime
    status: SignalStatus = "PENDING"
    fingerprint: str
    unlock_risk: UnlockRisk = "UNKNOWN"
    expires_at: datetime | None = None
    current_price: float | None = None
    exit_price: float | None = None
    pnl_pct: float = 0.0
    pnl_usd: float = 0.0
    pnl_r: float = 0.0
    max_profit_pct: float = 0.0
    max_drawdown_pct: float = 0.0
    outcome: TradeOutcome = "OPEN"
    closed_at: datetime | None = None
    updated_at: datetime | None = None


class SignalDecision(BaseModel):
    signal: GeneratedSignal | None
    reason: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    utc_now: datetime
    binance_ws: WsStatus
    supabase_configured: bool
    llm_configured: bool
    news_configured: bool
    last_market_update: datetime | None = None
    details: dict[str, Any] = Field(default_factory=dict)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
