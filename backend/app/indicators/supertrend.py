from __future__ import annotations

from app.indicators.atr import wilder_atr
from app.indicators.params import IndicatorParams, InsufficientDataError
from app.schemas.market import SupertrendResult


def supertrend(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    params: IndicatorParams | None = None,
) -> SupertrendResult:
    cfg = params or IndicatorParams()
    period = cfg.atr_period
    multiplier = cfg.supertrend_multiplier
    n = len(closes)
    if n < period + 2:
        raise InsufficientDataError(f"Supertrend requires at least {period + 2} candles, got {n}")

    atr = wilder_atr(highs, lows, closes, period=period)
    final_upper: list[float | None] = [None] * n
    final_lower: list[float | None] = [None] * n
    trend: list[int | None] = [None] * n
    st_values: list[float | None] = [None] * n

    start = next(i for i, value in enumerate(atr) if value is not None)
    for i in range(start, n):
        hl2 = (highs[i] + lows[i]) / 2.0
        atr_i = atr[i]
        assert atr_i is not None
        basic_upper = hl2 + multiplier * atr_i
        basic_lower = hl2 - multiplier * atr_i

        if i == start:
            final_upper[i] = basic_upper
            final_lower[i] = basic_lower
            trend[i] = 1 if closes[i] >= hl2 else -1
        else:
            prev_fu = final_upper[i - 1]
            prev_fl = final_lower[i - 1]
            assert prev_fu is not None and prev_fl is not None
            final_upper[i] = basic_upper if basic_upper < prev_fu or closes[i - 1] > prev_fu else prev_fu
            final_lower[i] = basic_lower if basic_lower > prev_fl or closes[i - 1] < prev_fl else prev_fl
            prev_trend = trend[i - 1] or 1
            if prev_trend == 1:
                trend[i] = -1 if closes[i] < final_lower[i] else 1
            else:
                trend[i] = 1 if closes[i] > final_upper[i] else -1

        st_values[i] = final_lower[i] if trend[i] == 1 else final_upper[i]

    last_trend = trend[-1]
    last_value = st_values[-1]
    if last_trend is None or last_value is None:
        raise InsufficientDataError("Supertrend could not be computed from the provided candles")

    direction = "BULLISH" if last_trend == 1 else "BEARISH"
    return SupertrendResult(
        trend=direction,
        value=last_value,
        support=last_value if direction == "BULLISH" else None,
        resistance=last_value if direction == "BEARISH" else None,
        series=st_values,
    )
