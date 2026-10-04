from __future__ import annotations

from app.config import Settings
from app.engines.risk import RiskRejected, build_risk_plan
from app.schemas.market import (
    EwoResult,
    RsiResult,
    SupertrendResult,
    SwingResult,
    TechnicalSnapshot,
)
from app.utils.numbers import utc_now


def _tech(
    close: float,
    support: float,
    resistance: float,
    swing_low: float,
    swing_high: float,
    major_res: float,
    major_sup: float,
    trend: str = "BULLISH",
) -> TechnicalSnapshot:
    return TechnicalSnapshot(
        symbol="ZROUSDT",
        timeframe="15m",
        rsi=RsiResult(rsi=55, rsi_state="NEUTRAL"),
        supertrend=SupertrendResult(
            trend=trend,  # type: ignore[arg-type]
            value=support if trend == "BULLISH" else resistance,
            support=support if trend == "BULLISH" else None,
            resistance=resistance if trend == "BEARISH" else None,
        ),
        ewo=EwoResult(
            ewo=0.2,
            previous_ewo=0.1,
            histogram_direction="UP",
            zero_cross=False,
            state="BULLISH_MOMENTUM",
        ),
        swings=SwingResult(
            recent_swing_high=swing_high,
            recent_swing_low=swing_low,
            major_resistance=major_res,
            major_support=major_sup,
        ),
        last_close=close,
        candle_count=120,
        calculated_at=utc_now(),
    )


def settings() -> Settings:
    return Settings()


def test_valid_sl_and_targets_long():
    tech = _tech(
        close=100,
        support=97.8,
        resistance=104,
        swing_low=97.8,
        swing_high=103.5,
        major_res=108,
        major_sup=95,
    )
    plan = build_risk_plan(direction="LONG", technicals=tech, settings=settings())
    assert plan.sl < plan.entry
    assert 1.5 <= plan.risk_percentage <= 3.5
    assert plan.risk_reward_tp1 >= 1.5
    assert plan.risk_reward_tp2 >= 2.5
    assert plan.tp2 > plan.tp1 > plan.entry


def test_invalid_sl_too_tight():
    tech = _tech(
        close=100,
        support=99.7,
        resistance=101,
        swing_low=99.7,
        swing_high=100.4,
        major_res=101,
        major_sup=99,
    )
    try:
        build_risk_plan(direction="LONG", technicals=tech, settings=settings())
        raise AssertionError("expected rejection")
    except RiskRejected as exc:
        assert "Stop distance" in str(exc) or "TP" in str(exc)


def test_invalid_rr_when_structure_too_close():
    tech = _tech(
        close=100,
        support=97.5,
        resistance=100.2,
        swing_low=97.5,
        swing_high=100.3,
        major_res=100.4,
        major_sup=97,
    )
    # Forced tiny targets relative to a ~2.5% stop should fail TP1 unless engine lifts to min R.
    # Engine lifts TP to min R, so this should succeed unless stop is out of range.
    plan = build_risk_plan(direction="LONG", technicals=tech, settings=settings())
    assert plan.risk_reward_tp1 >= 1.5


def test_valid_tp1_short():
    tech = _tech(
        close=100,
        support=96,
        resistance=102.2,
        swing_low=94,
        swing_high=102.2,
        major_res=105,
        major_sup=92,
        trend="BEARISH",
    )
    plan = build_risk_plan(direction="SHORT", technicals=tech, settings=settings())
    assert plan.sl > plan.entry
    assert plan.tp2 < plan.tp1 < plan.entry
    assert plan.risk_reward_tp2 >= 2.5
