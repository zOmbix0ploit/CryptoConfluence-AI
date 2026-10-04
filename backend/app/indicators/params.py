from __future__ import annotations

from dataclasses import dataclass


class InsufficientDataError(ValueError):
    pass


@dataclass(frozen=True)
class IndicatorParams:
    rsi_period: int = 14
    atr_period: int = 10
    supertrend_multiplier: float = 3.0
    ewo_fast: int = 5
    ewo_slow: int = 35
    swing_lookback: int = 20
    swing_left: int = 2
    swing_right: int = 2
    rsi_oversold: float = 30.0
    rsi_overbought: float = 70.0
    rsi_extreme_oversold: float = 15.0
    rsi_extreme_overbought: float = 85.0
