from __future__ import annotations

from app.schemas.market import UnlockRisk


class UnlockService:
    """
    Token unlock data is not invented.
    Without a licensed unlock provider, risk is always UNKNOWN — never SAFE.
    """

    def risk_for_symbol(self, symbol: str) -> UnlockRisk:
        _ = symbol
        return "UNKNOWN"
