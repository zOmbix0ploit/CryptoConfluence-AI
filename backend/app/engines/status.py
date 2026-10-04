from __future__ import annotations

from datetime import datetime

from app.schemas.market import GeneratedSignal, SignalStatus
from app.utils.numbers import utc_now


def next_status(
    signal: GeneratedSignal,
    last_price: float,
    technically_invalid: bool = False,
    now: datetime | None = None,
) -> SignalStatus:
    current = now or utc_now()
    if signal.status in {"TP2_HIT", "STOPPED_OUT", "EXPIRED", "INVALIDATED"}:
        return signal.status

    if signal.status == "PENDING" and technically_invalid:
        return "INVALIDATED"

    if signal.expires_at and current >= signal.expires_at and signal.status in {"PENDING", "ACTIVE"}:
        return "EXPIRED"

    if signal.type == "LONG":
        if last_price <= signal.sl:
            return "STOPPED_OUT"
        if last_price >= signal.tp2:
            return "TP2_HIT"
        if last_price >= signal.tp1:
            return "TP1_HIT"
        if last_price >= signal.entry and signal.status == "PENDING":
            return "ACTIVE"
        return signal.status

    if last_price >= signal.sl:
        return "STOPPED_OUT"
    if last_price <= signal.tp2:
        return "TP2_HIT"
    if last_price <= signal.tp1:
        return "TP1_HIT"
    if last_price <= signal.entry and signal.status == "PENDING":
        return "ACTIVE"
    return signal.status
