from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings
from app.schemas.market import SupertrendResult, SwingResult, TechnicalSnapshot
from app.utils.numbers import percent_distance, round_price


class RiskRejected(ValueError):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class RiskPlan:
    entry: float
    sl: float
    tp1: float
    tp2: float
    risk_percentage: float
    risk_reward_tp1: float
    risk_reward_tp2: float
    setup_type: str


def build_risk_plan(
    *,
    direction: str,
    technicals: TechnicalSnapshot,
    settings: Settings,
    prefer_pullback: bool = False,
) -> RiskPlan:
    close = technicals.last_close
    st = technicals.supertrend
    swings = technicals.swings
    if direction == "LONG":
        return _long_plan(close, st, swings, settings, prefer_pullback)
    return _short_plan(close, st, swings, settings, prefer_pullback)


def _long_plan(
    close: float,
    st: SupertrendResult,
    swings: SwingResult,
    settings: Settings,
    prefer_pullback: bool,
) -> RiskPlan:
    support = st.support if st.support is not None else swings.recent_swing_low
    invalidation = min(swings.recent_swing_low, support)
    if prefer_pullback and support < close:
        pullback_target = close * 0.9935
        entry = round_price(max(support * 1.002, min(close * 0.9955, (close + pullback_target) / 2.0)))
        setup = "validated_pullback"
    else:
        entry = round_price(close * 0.9945)
        setup = "institutional_pullback_entry"
    sl = round_price(invalidation * (1 - settings.stop_buffer_pct / 100.0))
    if sl >= entry:
        raise RiskRejected("Stop loss is not below entry for LONG")
    risk_pct = percent_distance(entry, sl)
    _assert_stop_range(risk_pct, settings)
    risk = entry - sl
    tp1_struct = swings.recent_swing_high if swings.recent_swing_high > entry else swings.major_resistance
    tp2_struct = swings.major_resistance if swings.major_resistance > tp1_struct else tp1_struct + 2 * risk
    tp1 = round_price(max(tp1_struct, entry + settings.min_tp1_r * risk))
    tp2 = round_price(max(tp2_struct, entry + settings.min_tp2_r * risk, tp1 + 0.1 * risk))
    rr1 = (tp1 - entry) / risk
    rr2 = (tp2 - entry) / risk
    _assert_targets(rr1, rr2, settings)
    if tp1 <= entry or tp2 <= tp1:
        raise RiskRejected("Take-profit structure is invalid for LONG")
    return RiskPlan(entry, sl, tp1, tp2, risk_pct, rr1, rr2, setup)


def _short_plan(
    close: float,
    st: SupertrendResult,
    swings: SwingResult,
    settings: Settings,
    prefer_pullback: bool,
) -> RiskPlan:
    resistance = st.resistance if st.resistance is not None else swings.recent_swing_high
    invalidation = max(swings.recent_swing_high, resistance)
    if prefer_pullback and resistance > close:
        pullback_target = close * 1.0065
        entry = round_price(min(resistance * 0.998, max(close * 1.0045, (close + pullback_target) / 2.0)))
        setup = "validated_pullback"
    else:
        entry = round_price(close * 1.0055)
        setup = "institutional_pullback_entry"
    sl = round_price(invalidation * (1 + settings.stop_buffer_pct / 100.0))
    if sl <= entry:
        raise RiskRejected("Stop loss is not above entry for SHORT")
    risk_pct = percent_distance(entry, sl)
    _assert_stop_range(risk_pct, settings)
    risk = sl - entry
    tp1_struct = swings.recent_swing_low if swings.recent_swing_low < entry else swings.major_support
    tp2_struct = swings.major_support if swings.major_support < tp1_struct else tp1_struct - 2 * risk
    tp1 = round_price(min(tp1_struct, entry - settings.min_tp1_r * risk))
    tp2 = round_price(min(tp2_struct, entry - settings.min_tp2_r * risk, tp1 - 0.1 * risk))
    rr1 = (entry - tp1) / risk
    rr2 = (entry - tp2) / risk
    _assert_targets(rr1, rr2, settings)
    if tp1 >= entry or tp2 >= tp1:
        raise RiskRejected("Take-profit structure is invalid for SHORT")
    return RiskPlan(entry, sl, tp1, tp2, risk_pct, rr1, rr2, setup)


def _assert_stop_range(risk_pct: float, settings: Settings) -> None:
    if risk_pct + 1e-4 < settings.min_stop_distance_pct:
        raise RiskRejected(
            f"Stop distance {risk_pct:.2f}% below minimum {settings.min_stop_distance_pct}%"
        )
    if risk_pct - 1e-4 > settings.max_stop_distance_pct:
        raise RiskRejected(
            f"Stop distance {risk_pct:.2f}% above maximum {settings.max_stop_distance_pct}%"
        )


def _assert_targets(rr1: float, rr2: float, settings: Settings) -> None:
    if rr1 + 1e-4 < settings.min_tp1_r:
        raise RiskRejected(f"TP1 R:R {rr1:.2f} below required {settings.min_tp1_r}")
    if rr2 + 1e-4 < settings.min_tp2_r:
        raise RiskRejected(f"TP2 R:R {rr2:.2f} below required {settings.min_tp2_r}")
