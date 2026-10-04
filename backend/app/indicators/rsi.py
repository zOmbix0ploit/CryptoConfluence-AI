from __future__ import annotations

from app.indicators.params import InsufficientDataError, IndicatorParams
from app.schemas.market import RsiResult, RsiState


def wilder_rsi(closes: list[float], params: IndicatorParams | None = None) -> RsiResult:
    cfg = params or IndicatorParams()
    period = cfg.rsi_period
    if len(closes) < period + 1:
        raise InsufficientDataError(f"RSI requires at least {period + 1} closes, got {len(closes)}")

    gains: list[float] = []
    losses: list[float] = []
    for i in range(1, period + 1):
        change = closes[i] - closes[i - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    for i in range(period + 1, len(closes)):
        change = closes[i] - closes[i - 1]
        gain = max(change, 0.0)
        loss = max(-change, 0.0)
        avg_gain = ((avg_gain * (period - 1)) + gain) / period
        avg_loss = ((avg_loss * (period - 1)) + loss) / period

    if avg_loss == 0:
        rsi = 100.0 if avg_gain > 0 else 50.0
    else:
        rs = avg_gain / avg_loss
        rsi = 100.0 - (100.0 / (1.0 + rs))

    return RsiResult(rsi=rsi, rsi_state=_rsi_state(rsi, cfg))


def _rsi_state(rsi: float, cfg: IndicatorParams) -> RsiState:
    if rsi <= cfg.rsi_extreme_oversold:
        return "EXTREME_OVERSOLD"
    if rsi <= cfg.rsi_oversold:
        return "OVERSOLD"
    if rsi >= cfg.rsi_extreme_overbought:
        return "EXTREME_OVERBOUGHT"
    if rsi >= cfg.rsi_overbought:
        return "OVERBOUGHT"
    return "NEUTRAL"
