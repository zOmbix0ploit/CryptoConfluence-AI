from __future__ import annotations

import hashlib
import re
import time
from typing import Any, TypeVar

T = TypeVar("T")

LEVERAGED_TOKEN_RE = re.compile(r"(UP|DOWN|BULL|BEAR)USDT$")
STABLE_BASES = {"USDC", "BUSD", "TUSD", "FDUSD", "DAI", "USDP", "EUR", "TRY", "USD1", "USDE", "PYUSD", "RLUSD", "U"}


def is_eligible_usdt_spot(symbol: str, status: str, is_spot_trading_allowed: bool) -> bool:
    if status != "TRADING" or not is_spot_trading_allowed:
        return False
    if not symbol.endswith("USDT"):
        return False
    if LEVERAGED_TOKEN_RE.search(symbol):
        return False
    base = symbol[:-4]
    if base in STABLE_BASES:
        return False
    return True


def stable_news_id(source: str, url: str | None, headline: str, published: str | None) -> str:
    raw = "|".join([source.strip().lower(), (url or "").strip().lower(), headline.strip().lower(), published or ""])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


AMBIGUOUS_ENGLISH_TICKERS = {
    "A", "S", "U", "I", "M", "G", "W", "T", "THE", "AT", "IN", "ON", "TO",
    "FOR", "OF", "BY", "OR", "AS", "IS", "IT", "BE", "ARE", "WAS", "NOT",
    "ONE", "ALL", "NEW", "NOW", "OUT", "UP", "MAY", "CAN", "WIN", "HOT",
    "KEY", "TOP", "LOW", "HIGH", "OPEN", "NEXT", "MORE", "OVER", "INTO",
    "TIME", "GAS", "FUN", "SUN", "AMP", "ACT", "HARD", "WING", "DATA",
    "MOVE", "ME", "US", "UK", "EU", "AI", "BANK", "PEOPLE", "RARE", "SUPER",
    "MAGIC", "FLOW", "ROSE", "SAFE", "CASH", " HOOK", "REAL", "HIGH",
}

COIN_ALIASES = {
    "BITCOIN": "BTC",
    "ETHEREUM": "ETH",
    "SOLANA": "SOL",
    "RIPPLE": "XRP",
    "DOGECOIN": "DOGE",
    "CARDANO": "ADA",
    "AVALANCHE": "AVAX",
    "CHAINLINK": "LINK",
    "ARBITRUM": "ARB",
    "POLKADOT": "DOT",
    "LITECOIN": "LTC",
    "ZCASH": "ZEC",
    "UNISWAP": "UNI",
    "BINANCE": "BNB",
    "SUI": "SUI",
    "HYPERLIQUID": "HYPE",
}


def extract_tickers(text: str, known_bases: set[str]) -> list[str]:
    found: set[str] = set()
    upper = text.upper()
    for base in known_bases:
        if len(base) <= 1 or base in AMBIGUOUS_ENGLISH_TICKERS:
            if re.search(rf"\${re.escape(base)}(?![A-Z0-9])", upper):
                found.add(base)
            continue
        pattern = rf"(?<![A-Z0-9]){re.escape(base)}(?![A-Z0-9])"
        if re.search(pattern, upper):
            found.add(base)
    for alias, ticker in COIN_ALIASES.items():
        if alias in upper and (not known_bases or ticker in known_bases or ticker in {"BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "ARB", "ZEC"}):
            found.add(ticker)
    return sorted(found)


def ttl_cache_get(store: dict[str, tuple[float, T]], key: str, ttl: float) -> T | None:
    item = store.get(key)
    if not item:
        return None
    expires_at, value = item
    if time.time() > expires_at:
        store.pop(key, None)
        return None
    return value


def ttl_cache_set(store: dict[str, tuple[float, T]], key: str, value: T, ttl: float) -> T:
    store[key] = (time.time() + ttl, value)
    return value


def require_fields(payload: dict[str, Any], fields: list[str]) -> None:
    missing = [field for field in fields if field not in payload]
    if missing:
        raise ValueError(f"Malformed API response, missing fields: {missing}")
