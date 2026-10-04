from __future__ import annotations

from app.indicators.params import InsufficientDataError
from app.indicators.supertrend import supertrend


def _ohlc_trend(direction: str, n: int = 80) -> tuple[list[float], list[float], list[float]]:
    highs, lows, closes = [], [], []
    price = 100.0
    step = 0.8 if direction == "up" else -0.8
    for i in range(n):
        price += step
        high = price + 0.4
        low = price - 0.4
        close = price + (0.15 if direction == "up" else -0.15)
        highs.append(high)
        lows.append(low)
        closes.append(close)
    return highs, lows, closes


def test_supertrend_bullish():
    h, l, c = _ohlc_trend("up")
    result = supertrend(h, l, c)
    assert result.trend == "BULLISH"
    assert result.support is not None
    assert result.resistance is None
    assert result.value > 0


def test_supertrend_bearish():
    h, l, c = _ohlc_trend("down")
    result = supertrend(h, l, c)
    assert result.trend == "BEARISH"
    assert result.resistance is not None
    assert result.support is None


def test_supertrend_reversal():
    h1, l1, c1 = _ohlc_trend("up", 50)
    h2, l2, c2 = _ohlc_trend("down", 50)
    # continue from last price
    shift = c1[-1] - 100
    h2 = [x + shift for x in h2]
    l2 = [x + shift for x in l2]
    c2 = [x + shift for x in c2]
    result = supertrend(h1 + h2, l1 + l2, c1 + c2)
    assert result.trend == "BEARISH"


def test_supertrend_insufficient():
    try:
        supertrend([1, 2], [1, 2], [1, 2])
        raise AssertionError("expected failure")
    except InsufficientDataError:
        pass
