from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from app.config import Settings
from app.engines.confluence import score_confluence
from app.engines.risk import RiskRejected, build_risk_plan
from app.schemas.market import (
    GeneratedSignal,
    MarketRow,
    NewsCard,
    SignalDecision,
    TechnicalSnapshot,
)
from app.utils.numbers import display_symbol, utc_now


def signal_fingerprint(symbol: str, direction: str, timeframe: str, setup_type: str, entry_zone: str) -> str:
    return "|".join([symbol.upper(), direction, timeframe, setup_type, entry_zone])


def evaluate_signal(
    *,
    settings: Settings,
    market: MarketRow,
    technicals: TechnicalSnapshot,
    news: NewsCard | None,
    unlock_risk: str = "UNKNOWN",
    existing_fingerprints: set[str] | None = None,
) -> SignalDecision:
    if unlock_risk == "EXCLUDE":
        return SignalDecision(signal=None, reason="Token unlock exceeds 10% within 24h")

    if news and news.sentiment == "BEARISH":
        order = ("SHORT", "LONG")
    else:
        order = ("LONG", "SHORT")

    decisions: list[SignalDecision] = []
    for direction in order:
        dec = _try_direction(direction, settings, market, technicals, news, unlock_risk, existing_fingerprints)
        if dec.signal:
            return dec
        decisions.append(dec)

    return decisions[0]


def _try_direction(
    direction: str,
    settings: Settings,
    market: MarketRow,
    technicals: TechnicalSnapshot,
    news: NewsCard | None,
    unlock_risk: str,
    existing_fingerprints: set[str] | None,
) -> SignalDecision:
    hard = _hard_filters(direction, settings, market, technicals, news)
    if hard:
        return SignalDecision(signal=None, reason=hard)

    confluence = score_confluence(
        settings=settings,
        direction=direction,
        market=market,
        technicals=technicals,
        news=news,
    )
    if confluence.total < 60:
        return SignalDecision(signal=None, reason="Insufficient confluence")

    prefer_pullback = technicals.rsi.rsi_state in {"OVERBOUGHT", "OVERSOLD"}
    try:
        plan = build_risk_plan(
            direction=direction,
            technicals=technicals,
            settings=settings,
            prefer_pullback=prefer_pullback,
        )
    except RiskRejected as exc:
        return SignalDecision(signal=None, reason=str(exc))

    entry_zone = f"{plan.entry:.6f}"
    fingerprint = signal_fingerprint(market.symbol, direction, technicals.timeframe, plan.setup_type, entry_zone)
    if existing_fingerprints and fingerprint in existing_fingerprints:
        return SignalDecision(signal=None, reason="Duplicate signal within cooldown window")

    warnings = list(confluence.warnings)
    if unlock_risk == "UNKNOWN":
        warnings.append("Unlock risk is UNKNOWN — absence of unlock data is not proof of safety")

    now = utc_now()
    signal = GeneratedSignal(
        signal_id=str(uuid4()),
        coin=display_symbol(market.symbol),
        symbol=market.symbol,
        timeframe=technicals.timeframe,
        type=direction,  # type: ignore[arg-type]
        entry=plan.entry,
        sl=plan.sl,
        tp1=plan.tp1,
        tp2=plan.tp2,
        risk_percentage=round(plan.risk_percentage, 4),
        risk_reward_tp1=round(plan.risk_reward_tp1, 4),
        risk_reward_tp2=round(plan.risk_reward_tp2, 4),
        confidence_score=int(round(confluence.total)),
        confidence_level=confluence.level,
        confluence_reasons=confluence.reasons,
        warnings=warnings,
        timestamp=now,
        fingerprint=fingerprint,
        unlock_risk=unlock_risk,  # type: ignore[arg-type]
        expires_at=now + timedelta(minutes=settings.signal_expiration_minutes),
    )
    return SignalDecision(signal=signal, reason="ok")


def _hard_filters(
    direction: str,
    settings: Settings,
    market: MarketRow,
    technicals: TechnicalSnapshot,
    news: NewsCard | None,
) -> str | None:
    if news is None:
        return "Insufficient confluence"
    if news.sentiment_score < 0.70:
        return "News sentiment score below 0.70"
    if direction == "LONG" and news.sentiment != "BULLISH":
        return "LONG requires bullish news"
    if direction == "SHORT" and news.sentiment != "BEARISH":
        return "SHORT requires bearish news"

    change_15 = market.price_change_15m or 0.0
    change_1h = market.price_change_1h or 0.0
    if direction == "LONG" and not (change_15 > 0.50 or change_1h > 0.50):
        return "Insufficient positive momentum"
    if direction == "SHORT" and not (change_15 < -0.50 or change_1h < -0.50):
        return "Insufficient negative momentum"

    if market.volume_ratio is None or market.volume_ratio < 1.5:
        return "Volume ratio below 1.5x"

    if direction == "LONG" and technicals.supertrend.trend != "BULLISH":
        return "15m Supertrend is not bullish"
    if direction == "SHORT" and technicals.supertrend.trend != "BEARISH":
        return "15m Supertrend is not bearish"

    ewo = technicals.ewo
    if direction == "LONG" and not (ewo.ewo > 0 or ewo.ewo > ewo.previous_ewo):
        return "EWO is not supportive for LONG"
    if direction == "SHORT" and not (ewo.ewo < 0 or ewo.ewo < ewo.previous_ewo):
        return "EWO is not supportive for SHORT"

    if not settings.aggressive_mode:
        if direction == "LONG" and technicals.rsi.rsi > 85:
            return "RSI > 85 rejected"
        if direction == "SHORT" and technicals.rsi.rsi < 15:
            return "RSI < 15 rejected"
    return None
