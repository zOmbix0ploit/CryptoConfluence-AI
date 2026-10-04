from __future__ import annotations

import math
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_decimal(value: float | int | str | Decimal) -> Decimal:
    return Decimal(str(value))


def round_price(value: float, digits: int = 8) -> float:
    quantized = to_decimal(value).quantize(Decimal(10) ** -digits, rounding=ROUND_HALF_UP)
    return float(quantized)


def pct_change(current: float, previous: float) -> float | None:
    if previous == 0 or not math.isfinite(previous) or not math.isfinite(current):
        return None
    return ((current - previous) / previous) * 100.0


def percent_distance(from_price: float, to_price: float) -> float:
    if from_price == 0:
        raise ValueError("from_price cannot be zero")
    return abs((to_price - from_price) / from_price) * 100.0


def display_symbol(symbol: str) -> str:
    if symbol.endswith("USDT"):
        return f"{symbol[:-4]}/USDT"
    return symbol
