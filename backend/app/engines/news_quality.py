from __future__ import annotations

import hashlib
import re

SPAM_PATTERNS = [
    re.compile(r"sign up", re.I),
    re.compile(r"referral", re.I),
    re.compile(r"guaranteed profit", re.I),
    re.compile(r"100%\s*accurate", re.I),
    re.compile(r"risk[- ]free", re.I),
    re.compile(r"buy now", re.I),
    re.compile(r"price prediction", re.I),
    re.compile(r"to the moon", re.I),
    re.compile(r"airdrop", re.I),
    re.compile(r"giveaway", re.I),
]

SOURCE_QUALITY = {
    "coinmarketcap": 0.92,
    "coindesk": 0.90,
    "theblock": 0.88,
    "cryptocompare": 0.82,
    "decrypt": 0.80,
    "cointelegraph": 0.78,
    "binance": 0.70,
    "cryptopanic": 0.62,
    "unknown": 0.45,
}


def source_quality(source: str) -> float:
    key = source.strip().lower()
    for name, score in SOURCE_QUALITY.items():
        if name in key:
            return score
    return SOURCE_QUALITY["unknown"]


def reject_reason(headline: str, body: str | None, source: str) -> str | None:
    text = f"{headline} {body or ''}"
    for pattern in SPAM_PATTERNS:
        if pattern.search(text):
            return f"Rejected by quality filter: {pattern.pattern}"
    if len(headline.strip()) < 12:
        return "Headline too short / low quality"
    if source_quality(source) < 0.35:
        return "Source quality below threshold"
    return None


def news_confidence(
    *,
    sentiment_score: float,
    source: str,
    impact_level: str,
    age_minutes: float,
    ticker_in_headline: bool,
) -> float:
    impact = {"HIGH": 1.0, "MEDIUM": 0.7, "LOW": 0.4}.get(impact_level, 0.4)
    freshness = 1.0 if age_minutes <= 60 else max(0.2, 1.0 - (age_minutes - 60) / 1440)
    ticker = 1.0 if ticker_in_headline else 0.6
    value = (
        0.40 * sentiment_score
        + 0.25 * source_quality(source)
        + 0.15 * impact
        + 0.10 * freshness
        + 0.10 * ticker
    )
    return max(0.0, min(1.0, value))


def content_hash(headline: str) -> str:
    normalized = re.sub(r"\s+", " ", headline.strip().lower())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
