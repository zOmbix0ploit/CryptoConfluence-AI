from __future__ import annotations

from datetime import datetime, timezone

from app.config import Settings
from app.engines.signals import evaluate_signal, signal_fingerprint
from app.schemas.market import (
    EwoResult,
    MarketRow,
    NewsCard,
    RsiResult,
    SupertrendResult,
    SwingResult,
    TechnicalSnapshot,
)


def _market(change_15: float = 1.2, ratio: float = 2.0) -> MarketRow:
    return MarketRow(
        symbol="ZROUSDT",
        display_symbol="ZRO/USDT",
        last_price=2.005,
        price_change_15m=change_15,
        price_change_1h=0.8,
        price_change_24h=3.1,
        high_24h=2.1,
        low_24h=1.9,
        volume_24h=1_000_000,
        quote_volume_24h=5_000_000,
        average_volume_30=1_000_000,
        volume_ratio=ratio,
        momentum_score=80,
        updated_at=datetime.now(timezone.utc),
    )


def _news(sentiment: str = "BULLISH", score: float = 0.85) -> NewsCard:
    return NewsCard(
        news_id="n1",
        ticker="ZRO",
        headline="Major ecosystem adoption announcement",
        sentiment=sentiment,  # type: ignore[arg-type]
        sentiment_score=score,
        impact_level="HIGH",
        category="ADOPTION",
        source="coindesk",
        published_at=datetime.now(timezone.utc),
        confidence=0.9,
        reason="Adoption headline",
    )


def _tech(trend: str = "BULLISH", rsi: float = 55, ewo: float = 0.2, prev: float = 0.1) -> TechnicalSnapshot:
    support = 1.96
    resistance = 2.08
    return TechnicalSnapshot(
        symbol="ZROUSDT",
        timeframe="15m",
        rsi=RsiResult(rsi=rsi, rsi_state="NEUTRAL" if 30 < rsi < 70 else "OVERBOUGHT"),
        supertrend=SupertrendResult(
            trend=trend,  # type: ignore[arg-type]
            value=support if trend == "BULLISH" else resistance,
            support=support if trend == "BULLISH" else None,
            resistance=resistance if trend == "BEARISH" else None,
        ),
        ewo=EwoResult(
            ewo=ewo,
            previous_ewo=prev,
            histogram_direction="UP" if ewo >= prev else "DOWN",
            zero_cross=False,
            state="BULLISH_MOMENTUM" if ewo > 0 else "BEARISH_MOMENTUM",
        ),
        swings=SwingResult(
            recent_swing_high=2.08,
            recent_swing_low=1.96,
            major_resistance=2.14,
            major_support=1.90,
        ),
        last_close=2.005,
        candle_count=120,
        calculated_at=datetime.now(timezone.utc),
    )


def test_valid_long():
    decision = evaluate_signal(
        settings=Settings(),
        market=_market(),
        technicals=_tech(),
        news=_news(),
    )
    assert decision.signal is not None
    assert decision.signal.type == "LONG"
    assert decision.signal.entry > 0
    assert decision.signal.tp2 > decision.signal.tp1 > decision.signal.entry
    assert decision.signal.sl < decision.signal.entry


def test_valid_short():
    tech = _tech(trend="BEARISH", ewo=-0.2, prev=-0.1)
    tech.swings.recent_swing_high = 2.05
    tech.supertrend.resistance = 2.05
    tech.supertrend.value = 2.05
    decision = evaluate_signal(
        settings=Settings(),
        market=_market(change_15=-1.2),
        technicals=tech,
        news=_news(sentiment="BEARISH"),
    )
    assert decision.signal is not None
    assert decision.signal.type == "SHORT"


def test_insufficient_confluence():
    decision = evaluate_signal(
        settings=Settings(),
        market=_market(change_15=0.1, ratio=1.1),
        technicals=_tech(),
        news=_news(score=0.4),
    )
    assert decision.signal is None
    assert "confluence" in decision.reason.lower() or "sentiment" in decision.reason.lower() or "volume" in decision.reason.lower()


def test_extreme_rsi_rejection():
    decision = evaluate_signal(
        settings=Settings(aggressive_mode=False),
        market=_market(),
        technicals=_tech(rsi=88),
        news=_news(),
    )
    assert decision.signal is None
    assert "RSI" in decision.reason


def test_insufficient_rr_rejection():
    tight = _tech()
    tight.swings.recent_swing_low = 1.999
    tight.supertrend.support = 1.999
    tight.supertrend.value = 1.999
    decision = evaluate_signal(
        settings=Settings(),
        market=_market(),
        technicals=tight,
        news=_news(),
    )
    assert decision.signal is None


def test_duplicate_signal_rejection():
    first = evaluate_signal(
        settings=Settings(),
        market=_market(),
        technicals=_tech(),
        news=_news(),
    )
    assert first.signal is not None
    second = evaluate_signal(
        settings=Settings(),
        market=_market(),
        technicals=_tech(),
        news=_news(),
        existing_fingerprints={first.signal.fingerprint},
    )
    assert second.signal is None
    assert "Duplicate" in second.reason


def test_fingerprint_stable():
    a = signal_fingerprint("ZROUSDT", "LONG", "15m", "breakout_close", "2.005000")
    b = signal_fingerprint("zrousdt", "LONG", "15m", "breakout_close", "2.005000")
    assert a == b
