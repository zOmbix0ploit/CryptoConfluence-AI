from __future__ import annotations

from app.indicators.ewo import elliott_wave_oscillator
from app.indicators.params import InsufficientDataError


def _hl(start: float, deltas: list[float]) -> tuple[list[float], list[float]]:
    highs, lows = [], []
    price = start
    for delta in deltas:
        price += delta
        highs.append(price + 0.2)
        lows.append(price - 0.2)
    return highs, lows


def test_ewo_positive():
    highs, lows = _hl(10, [0.3] * 50)
    result = elliott_wave_oscillator(highs, lows)
    assert result.ewo > 0
    assert result.state in {"BULLISH_MOMENTUM", "BULLISH_ZERO_CROSS", "NEUTRAL"}


def test_ewo_negative():
    highs, lows = _hl(50, [-0.3] * 50)
    result = elliott_wave_oscillator(highs, lows)
    assert result.ewo < 0
    assert result.state in {"BEARISH_MOMENTUM", "BEARISH_ZERO_CROSS", "NEUTRAL"}


def test_ewo_zero_crossover():
    down = [-0.4] * 40
    up = [0.9] * 20
    highs, lows = _hl(40, down + up)
    result = elliott_wave_oscillator(highs, lows)
    assert result.ewo > result.previous_ewo


def test_ewo_insufficient():
    try:
        elliott_wave_oscillator([1] * 10, [1] * 10)
        raise AssertionError("expected failure")
    except InsufficientDataError:
        pass
