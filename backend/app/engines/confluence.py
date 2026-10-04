from __future__ import annotations

from app.config import Settings
from app.schemas.market import (
    ConfidenceLevel,
    ConfluenceBreakdown,
    EwoResult,
    MarketRow,
    NewsCard,
    RsiResult,
    SupertrendResult,
    SwingResult,
    TechnicalSnapshot,
)
from app.utils.numbers import percent_distance


def confidence_level(score: float) -> ConfidenceLevel:
    if score >= 90:
        return "EXTREME"
    if score >= 75:
        return "STRONG"
    if score >= 60:
        return "MODERATE"
    if score >= 40:
        return "LOW"
    return "WEAK"


def score_confluence(
    *,
    settings: Settings,
    direction: str,
    market: MarketRow,
    technicals: TechnicalSnapshot,
    news: NewsCard | None,
) -> ConfluenceBreakdown:
    weights = settings.confluence_weights
    news_score, news_reasons, news_warnings = _news_component(direction, news)
    mom_score, mom_reasons = _momentum_component(direction, market)
    vol_score, vol_reasons, vol_warnings = _volume_component(market)
    st_score, st_reasons = _supertrend_component(direction, technicals.supertrend)
    ewo_score, ewo_reasons = _ewo_component(direction, technicals.ewo)
    rsi_score, rsi_reasons, rsi_warnings = _rsi_component(direction, technicals.rsi)
    sr_score, sr_reasons = _sr_component(direction, technicals.last_close, technicals.swings)

    total = 100.0 * (
        weights["news"] * news_score
        + weights["momentum"] * mom_score
        + weights["volume"] * vol_score
        + weights["supertrend"] * st_score
        + weights["ewo"] * ewo_score
        + weights["rsi"] * rsi_score
        + weights["sr"] * sr_score
    )
    total = max(0.0, min(100.0, total))
    reasons = news_reasons + mom_reasons + vol_reasons + st_reasons + ewo_reasons + rsi_reasons + sr_reasons
    warnings = news_warnings + vol_warnings + rsi_warnings
    return ConfluenceBreakdown(
        news=news_score,
        momentum=mom_score,
        volume=vol_score,
        supertrend=st_score,
        ewo=ewo_score,
        rsi=rsi_score,
        sr=sr_score,
        total=total,
        level=confidence_level(total),
        reasons=reasons,
        warnings=warnings,
    )


def _news_component(direction: str, news: NewsCard | None) -> tuple[float, list[str], list[str]]:
    if news is None:
        return 0.0, [], ["No validated news sentiment for this ticker"]
    aligned = (direction == "LONG" and news.sentiment == "BULLISH") or (
        direction == "SHORT" and news.sentiment == "BEARISH"
    )
    if not aligned:
        return 0.0, [], [f"News sentiment {news.sentiment} does not align with {direction}"]
    score = news.confidence
    return score, [f"{news.sentiment.title()} news sentiment: {news.sentiment_score:.2f}"], []


def _momentum_component(direction: str, market: MarketRow) -> tuple[float, list[str]]:
    change_15 = market.price_change_15m or 0.0
    change_1h = market.price_change_1h or 0.0
    if direction == "LONG":
        ok_15 = change_15 > 0.50
        ok_1h = change_1h > 0.50
        if not (ok_15 or ok_1h):
            return 0.0, []
        magnitude = max(change_15, change_1h)
        return min(1.0, magnitude / 3.0), [f"Positive momentum 15m={change_15:.2f}% 1h={change_1h:.2f}%"]
    ok_15 = change_15 < -0.50
    ok_1h = change_1h < -0.50
    if not (ok_15 or ok_1h):
        return 0.0, []
    magnitude = abs(min(change_15, change_1h))
    return min(1.0, magnitude / 3.0), [f"Negative momentum 15m={change_15:.2f}% 1h={change_1h:.2f}%"]


def _volume_component(market: MarketRow) -> tuple[float, list[str], list[str]]:
    ratio = market.volume_ratio
    if ratio is None:
        return 0.0, [], ["Volume ratio unavailable"]
    if ratio < 1.5:
        return 0.0, [], [f"Volume ratio {ratio:.2f} below 1.5x"]
    return min(1.0, (ratio - 1.5) / 1.5 + 0.6), [f"Volume ratio above 1.5x ({ratio:.2f})"], []


def _supertrend_component(direction: str, st: SupertrendResult) -> tuple[float, list[str]]:
    aligned = (direction == "LONG" and st.trend == "BULLISH") or (direction == "SHORT" and st.trend == "BEARISH")
    if not aligned:
        return 0.0, []
    return 1.0, [f"15m Supertrend {st.trend.lower()}"]


def _ewo_component(direction: str, ewo: EwoResult) -> tuple[float, list[str]]:
    if direction == "LONG":
        positive = ewo.ewo > 0
        increasing = ewo.ewo > ewo.previous_ewo and ewo.state in {
            "BULLISH_MOMENTUM",
            "BULLISH_ZERO_CROSS",
        }
        if not (positive or increasing):
            return 0.0, []
        return 1.0 if increasing else 0.7, ["EWO positive or bullish momentum increasing"]
    negative = ewo.ewo < 0
    increasing_bear = ewo.ewo < ewo.previous_ewo and ewo.state in {
        "BEARISH_MOMENTUM",
        "BEARISH_ZERO_CROSS",
    }
    if not (negative or increasing_bear):
        return 0.0, []
    return 1.0 if increasing_bear else 0.7, ["EWO negative or bearish momentum increasing"]


def _rsi_component(direction: str, rsi: RsiResult) -> tuple[float, list[str], list[str]]:
    warnings: list[str] = []
    if direction == "LONG" and rsi.rsi > 85:
        warnings.append(f"RSI {rsi.rsi:.1f} extreme overbought")
        return 0.0, [], warnings
    if direction == "SHORT" and rsi.rsi < 15:
        warnings.append(f"RSI {rsi.rsi:.1f} extreme oversold")
        return 0.0, [], warnings
    if direction == "LONG":
        score = 1.0 if rsi.rsi < 70 else max(0.2, (85 - rsi.rsi) / 15)
    else:
        score = 1.0 if rsi.rsi > 30 else max(0.2, (rsi.rsi - 15) / 15)
    return score, [f"RSI {rsi.rsi:.1f} ({rsi.rsi_state})"], warnings


def _sr_component(direction: str, close: float, swings: SwingResult) -> tuple[float, list[str]]:
    if direction == "LONG":
        room = percent_distance(close, swings.major_resistance) if swings.major_resistance > close else 0.0
        near_support = percent_distance(close, swings.recent_swing_low) <= 3.5
        score = min(1.0, room / 4.0) * (1.0 if near_support or close > swings.recent_swing_low else 0.4)
        return score, ["Price structure supports continuation"] if score >= 0.4 else []
    room = percent_distance(close, swings.major_support) if swings.major_support < close else 0.0
    near_res = percent_distance(close, swings.recent_swing_high) <= 3.5
    score = min(1.0, room / 4.0) * (1.0 if near_res or close < swings.recent_swing_high else 0.4)
    return score, ["Price structure supports continuation"] if score >= 0.4 else []
