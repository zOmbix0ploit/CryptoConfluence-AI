from __future__ import annotations

from app.indicators.ewo import elliott_wave_oscillator
from app.indicators.params import IndicatorParams, InsufficientDataError
from app.indicators.rsi import wilder_rsi
from app.indicators.supertrend import supertrend
from app.indicators.swings import swing_levels
from app.schemas.market import Candle, TechnicalSnapshot
from app.utils.numbers import utc_now


def analyze_candles(
    symbol: str,
    timeframe: str,
    candles: list[Candle],
    params: IndicatorParams | None = None,
) -> TechnicalSnapshot:
    cfg = params or IndicatorParams()
    if len(candles) < 100:
        raise InsufficientDataError(f"Technical analysis requires at least 100 candles, got {len(candles)}")

    highs = [c.high for c in candles]
    lows = [c.low for c in candles]
    closes = [c.close for c in candles]
    return TechnicalSnapshot(
        symbol=symbol,
        timeframe=timeframe,
        rsi=wilder_rsi(closes, cfg),
        supertrend=supertrend(highs, lows, closes, cfg),
        ewo=elliott_wave_oscillator(highs, lows, cfg),
        swings=swing_levels(highs, lows, cfg),
        last_close=closes[-1],
        candle_count=len(candles),
        calculated_at=utc_now(),
    )
