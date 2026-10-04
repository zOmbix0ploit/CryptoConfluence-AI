from __future__ import annotations

from app.indicators.params import InsufficientDataError
from app.indicators.rsi import wilder_rsi


def _series(start: float, deltas: list[float]) -> list[float]:
    values = [start]
    for delta in deltas:
        values.append(values[-1] + delta)
    return values


def test_rsi_overbought():
    closes = _series(100, [1.5] * 30)
    result = wilder_rsi(closes)
    assert result.rsi > 70
    assert result.rsi_state in {"OVERBOUGHT", "EXTREME_OVERBOUGHT"}


def test_rsi_oversold():
    closes = _series(100, [-1.5] * 30)
    result = wilder_rsi(closes)
    assert result.rsi < 30
    assert result.rsi_state in {"OVERSOLD", "EXTREME_OVERSOLD"}


def test_rsi_neutral():
    closes = []
    price = 100.0
    for i in range(40):
        price += 0.4 if i % 2 == 0 else -0.4
        closes.append(price)
    result = wilder_rsi(closes)
    assert 30 < result.rsi < 70
    assert result.rsi_state == "NEUTRAL"


def test_rsi_insufficient():
    try:
        wilder_rsi([1, 2, 3])
        raise AssertionError("expected failure")
    except InsufficientDataError:
        pass
