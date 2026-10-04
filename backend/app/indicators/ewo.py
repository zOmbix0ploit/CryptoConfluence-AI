from __future__ import annotations

from app.indicators.params import IndicatorParams, InsufficientDataError
from app.schemas.market import EwoResult, EwoState


def sma(values: list[float], period: int) -> list[float | None]:
    if period <= 0:
        raise ValueError("SMA period must be positive")
    out: list[float | None] = [None] * len(values)
    running = 0.0
    for i, value in enumerate(values):
        running += value
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out[i] = running / period
    return out


def elliott_wave_oscillator(
    highs: list[float],
    lows: list[float],
    params: IndicatorParams | None = None,
) -> EwoResult:
    """Momentum oscillator: SMA(5) - SMA(35) of HL2. Not an Elliott Wave count."""
    cfg = params or IndicatorParams()
    if len(highs) != len(lows):
        raise ValueError("High/low length mismatch")
    if len(highs) < cfg.ewo_slow + 1:
        raise InsufficientDataError(f"EWO requires at least {cfg.ewo_slow + 1} candles, got {len(highs)}")

    midpoints = [(h + l) / 2.0 for h, l in zip(highs, lows)]
    fast = sma(midpoints, cfg.ewo_fast)
    slow = sma(midpoints, cfg.ewo_slow)
    series: list[float | None] = []
    for a, b in zip(fast, slow):
        series.append(None if a is None or b is None else a - b)

    current = series[-1]
    previous = series[-2]
    if current is None or previous is None:
        raise InsufficientDataError("EWO series is incomplete")

    if current > previous:
        hist = "UP"
    elif current < previous:
        hist = "DOWN"
    else:
        hist = "FLAT"

    zero_cross = (previous <= 0 < current) or (previous >= 0 > current)
    state = _ewo_state(current, previous, zero_cross)
    return EwoResult(
        ewo=current,
        previous_ewo=previous,
        histogram_direction=hist,
        zero_cross=zero_cross,
        state=state,
        series=series,
    )


def _ewo_state(current: float, previous: float, zero_cross: bool) -> EwoState:
    if zero_cross and current > 0:
        return "BULLISH_ZERO_CROSS"
    if zero_cross and current < 0:
        return "BEARISH_ZERO_CROSS"
    if current > 0 and current >= previous:
        return "BULLISH_MOMENTUM"
    if current < 0 and current <= previous:
        return "BEARISH_MOMENTUM"
    return "NEUTRAL"
