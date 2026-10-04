from __future__ import annotations

from app.indicators.params import IndicatorParams, InsufficientDataError
from app.schemas.market import SwingResult


def swing_levels(
    highs: list[float],
    lows: list[float],
    params: IndicatorParams | None = None,
) -> SwingResult:
    cfg = params or IndicatorParams()
    lookback = cfg.swing_lookback
    left = cfg.swing_left
    right = cfg.swing_right
    if len(highs) < lookback or len(lows) < lookback:
        raise InsufficientDataError(f"Swing structure requires at least {lookback} candles")

    window_highs = highs[-lookback:]
    window_lows = lows[-lookback:]
    fractal_highs: list[float] = []
    fractal_lows: list[float] = []

    for i in range(left, lookback - right):
        high = window_highs[i]
        low = window_lows[i]
        if all(high >= window_highs[i - j] for j in range(1, left + 1)) and all(
            high >= window_highs[i + j] for j in range(1, right + 1)
        ):
            fractal_highs.append(high)
        if all(low <= window_lows[i - j] for j in range(1, left + 1)) and all(
            low <= window_lows[i + j] for j in range(1, right + 1)
        ):
            fractal_lows.append(low)

    recent_high = max(window_highs) if not fractal_highs else fractal_highs[-1]
    recent_low = min(window_lows) if not fractal_lows else fractal_lows[-1]
    major_res = max(fractal_highs) if fractal_highs else max(window_highs)
    major_sup = min(fractal_lows) if fractal_lows else min(window_lows)
    return SwingResult(
        recent_swing_high=recent_high,
        recent_swing_low=recent_low,
        major_resistance=major_res,
        major_support=major_sup,
    )
