from __future__ import annotations

import json
import time
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.schemas.market import LlmSentiment
from app.utils.logging import get_logger

logger = get_logger("llm")

SYSTEM_PROMPT = """You are a crypto news analyst. Return ONLY valid JSON matching this schema:
{
  "news_id": "string",
  "headline": "string",
  "ticker": "BTC",
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "sentiment_score": 0.0-1.0,
  "category": "REGULATION"|"EXPLOIT"|"UNLOCK"|"ADOPTION"|"MACRO"|"ETF"|"LISTING"|"DELISTING"|"PARTNERSHIP"|"TECHNOLOGY"|"SECURITY"|"OTHER",
  "impact_level": "HIGH"|"MEDIUM"|"LOW",
  "reason": "Short explanation"
}
Do not invent facts that are not in the article. If unclear, use NEUTRAL and a lower score.
Ticker must be a base asset symbol without /USDT.
"""


class LlmUnavailable(RuntimeError):
    pass


class LlmService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client = httpx.AsyncClient(timeout=20.0)
        self._provider_cooldown_until: dict[str, float] = {}

    @property
    def available_providers(self) -> list[str]:
        candidates = [
            ("openai", bool(self.settings.openai_api_key)),
            ("google", bool(self.settings.google_ai_api_key)),
            ("anthropic", bool(self.settings.anthropic_api_key)),
        ]
        preferred = self.settings.llm_provider
        ordered = sorted(candidates, key=lambda item: 0 if item[0] == preferred else 1)
        return [name for name, has_key in ordered if has_key]

    @property
    def active_provider(self) -> str | None:
        providers = self.available_providers
        return providers[0] if providers else None

    @property
    def configured(self) -> bool:
        return bool(self.available_providers)

    async def close(self) -> None:
        await self._client.aclose()

    async def analyze(self, news_id: str, headline: str, body: str | None, ticker: str) -> LlmSentiment:
        if not self.configured:
            return _heuristic_sentiment(news_id, headline, body, ticker)
        user = (
            f"news_id={news_id}\nheadline={headline}\nbody={body or ''}\n"
            f"Focus ticker if present: {ticker}"
        )
        now = time.monotonic()
        for provider in self.available_providers:
            if self._provider_cooldown_until.get(provider, 0.0) > now:
                continue
            try:
                raw = await self._complete_with(provider, user)
                data = _extract_json(raw)
                data["news_id"] = news_id
                data["headline"] = headline
                if ticker and not data.get("ticker"):
                    data["ticker"] = ticker
                return LlmSentiment.model_validate(data)
            except Exception as exc:  # noqa: BLE001
                self._provider_cooldown_until[provider] = time.monotonic() + 300.0
                logger.warning("llm_provider_failed", provider=provider, news_id=news_id, error=str(exc))
        return _heuristic_sentiment(news_id, headline, body, ticker)

    async def _complete_with(self, provider: str, user: str) -> str:
        if provider == "openai":
            return await self._openai(user)
        if provider == "anthropic":
            return await self._anthropic(user)
        return await self._google(user)

    async def _openai(self, user: str) -> str:
        response = await self._client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.settings.openai_api_key}"},
            json={
                "model": self.settings.openai_model,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user},
                ],
            },
        )
        response.raise_for_status()
        payload = response.json()
        return payload["choices"][0]["message"]["content"]

    async def _anthropic(self, user: str) -> str:
        response = await self._client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": "claude-3-5-haiku-latest",
                "max_tokens": 400,
                "system": SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user}],
            },
        )
        response.raise_for_status()
        payload = response.json()
        return payload["content"][0]["text"]

    async def _google(self, user: str) -> str:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.5-flash:generateContent?key={self.settings.google_ai_api_key}"
        )
        response = await self._client.post(
            url,
            json={
                "contents": [{"parts": [{"text": SYSTEM_PROMPT + "\n\n" + user}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
            },
        )
        response.raise_for_status()
        payload = response.json()
        return payload["candidates"][0]["content"]["parts"][0]["text"]


def _extract_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM did not return JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("LLM JSON must be an object")
    return data


_BULL_WORDS = {
    "surge", "surges", "rally", "rallies", "soar", "soars", "bullish", "breakout",
    "adoption", "approval", "approved", "etf", "inflow", "inflows", "partnership",
    "launch", "launches", "upgrade", "institutional", "record", "gain", "gains",
    "jump", "jumps", "climb", "climbs", "accumulation", "buy", "listing", "listed",
}
_BEAR_WORDS = {
    "crash", "crashes", "plunge", "plunges", "drop", "drops", "bearish", "hack",
    "hacked", "exploit", "exploited", "drain", "drained", "lawsuit", "sec", "ban",
    "banned", "outflow", "outflows", "delist", "delisting", "liquidation", "dump",
    "selloff", "slump", "fall", "falls", "unlock", "investigation", "fine",
}


def _heuristic_sentiment(news_id: str, headline: str, body: str | None, ticker: str) -> LlmSentiment:
    text = f"{headline} {body or ''}".lower()
    bull_hits = sum(1 for w in _BULL_WORDS if w in text)
    bear_hits = sum(1 for w in _BEAR_WORDS if w in text)

    if "etf" in text:
        category = "ETF"
    elif any(k in text for k in ("hack", "exploit", "breach", "drain")):
        category = "EXPLOIT"
    elif any(k in text for k in ("sec", "regulation", "regulator", "lawsuit", "court")):
        category = "REGULATION"
    elif "unlock" in text:
        category = "UNLOCK"
    elif any(k in text for k in ("list", "listing")):
        category = "LISTING"
    elif "delist" in text:
        category = "DELISTING"
    elif any(k in text for k in ("partner", "partnership", "integration")):
        category = "PARTNERSHIP"
    elif any(k in text for k in ("adopt", "institutional", "treasury")):
        category = "ADOPTION"
    elif any(k in text for k in ("fed", "cpi", "inflation", "macro", "rate")):
        category = "MACRO"
    elif any(k in text for k in ("upgrade", "mainnet", "protocol", "network")):
        category = "TECHNOLOGY"
    else:
        category = "OTHER"

    if bull_hits > bear_hits:
        sentiment = "BULLISH"
        score = min(0.92, 0.72 + 0.06 * (bull_hits - bear_hits))
        reason = "Heuristic engine detected positive market/catalyst keywords in headline."
    elif bear_hits > bull_hits:
        sentiment = "BEARISH"
        score = min(0.92, 0.72 + 0.06 * (bear_hits - bull_hits))
        reason = "Heuristic engine detected downside risk or negative catalyst keywords."
    else:
        sentiment = "NEUTRAL"
        score = 0.55
        reason = "Balanced or informational coverage without strong directional bias."

    impact = "HIGH" if (bull_hits + bear_hits) >= 2 or category in {"ETF", "EXPLOIT", "REGULATION"} else "MEDIUM"

    return LlmSentiment(
        news_id=news_id,
        headline=headline,
        ticker=ticker or "BTC",
        sentiment=sentiment,
        sentiment_score=round(score, 2),
        category=category,
        impact_level=impact,
        reason=reason,
    )

