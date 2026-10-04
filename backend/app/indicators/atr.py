from __future__ import annotations

from app.indicators.params import InsufficientDataError


def true_range(high: float, low: float, prev_close: float) -> float:
    return max(high - low, abs(high - prev_close), abs(low - prev_close))


def wilder_atr(highs: list[float], lows: list[float], closes: list[float], period: int = 10) -> list[float | None]:
    n = len(closes)
    if n < period + 1:
        raise InsufficientDataError(f"ATR requires at least {period + 1} candles, got {n}")
    if not (len(highs) == len(lows) == n):
        raise ValueError("OHLC series length mismatch")

    trs: list[float] = [0.0]
    for i in range(1, n):
        trs.append(true_range(highs[i], lows[i], closes[i - 1]))

    atr: list[float | None] = [None] * n
    seed = sum(trs[1 : period + 1]) / period
    atr[period] = seed
    prev = seed
    for i in range(period + 1, n):
        prev = ((prev * (period - 1)) + trs[i]) / period
        atr[i] = prev
    return atr
