from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser
import httpx

from app.config import Settings, get_settings
from app.engines.news_quality import news_confidence, reject_reason, source_quality
from app.schemas.market import NewsArticle, NewsCard
from app.services.llm_service import LlmService, LlmUnavailable
from app.services.supabase_service import SupabaseService
from app.utils.logging import get_logger
from app.utils.symbols import STABLE_BASES, extract_tickers, stable_news_id

logger = get_logger("news")


class NewsService:
    def __init__(
        self,
        settings: Settings | None = None,
        llm: LlmService | None = None,
        db: SupabaseService | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.llm = llm or LlmService(self.settings)
        self.db = db or SupabaseService(self.settings)
        self._client = httpx.AsyncClient(timeout=20.0, follow_redirects=True)
        self.articles: dict[str, NewsArticle] = {}
        self.cards: list[NewsCard] = []
        self.cmc_quotes: dict[str, dict[str, Any]] = {}
        self.cmc_global: dict[str, Any] = {}
        self.last_error: str | None = None

    @property
    def configured(self) -> bool:
        return bool(
            self.settings.coinmarketcap_api_key
            or self.settings.cryptopanic_auth_token
            or self.settings.rss_url_list
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def refresh_coinmarketcap(self, known_bases: set[str]) -> list[NewsCard]:
        cmc_articles, cmc_cards = await self._from_coinmarketcap(known_bases)
        for article, card in zip(cmc_articles, cmc_cards):
            self.articles[article.news_id] = article
            self.cards = [c for c in self.cards if c.news_id != card.news_id]
            self.cards.insert(0, card)
        self.cards.sort(
            key=lambda c: (
                1 if "coinmarketcap" in c.source.lower() else 0,
                c.published_at or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )
        self.cards = self.cards[:200]

        async def _persist_cmc() -> None:
            for article, card in zip(cmc_articles[:12], cmc_cards[:12]):
                try:
                    exists = await asyncio.to_thread(self.db.news_exists, article.news_id)
                    if not exists:
                        await asyncio.to_thread(self.db.insert_article, article)
                        await asyncio.to_thread(self.db.insert_sentiment, card, "coinmarketcap_ai")
                except Exception:  # noqa: BLE001
                    pass

        if cmc_articles:
            asyncio.create_task(_persist_cmc())
        return cmc_cards

    async def ingest(self, known_bases: set[str]) -> list[NewsCard]:
        fetched: list[NewsArticle] = []
        new_cards: list[NewsCard] = []
        try:
            # 1. Fetch & analyze live CoinMarketCap Pro market intelligence + news cards first (<1.5s)
            cmc_cards = await self.refresh_coinmarketcap(known_bases)
            new_cards.extend(cmc_cards)

            # 2. Fetch RSS, CryptoCompare, and CryptoPanic feeds
            fetched.extend(await self._from_rss())
            fetched.extend(await self._from_cryptocompare_public())
            fetched.extend(await self._from_cryptopanic())
            self.last_error = None
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            logger.error("news_ingest_failed", error=str(exc))
            raise

        llm_analyzed = 0
        for article in fetched:
            if article.news_id in self.articles:
                continue
            if llm_analyzed >= 8:
                break
            exists = await asyncio.to_thread(self.db.news_exists, article.news_id)
            article.tickers = extract_tickers(f"{article.headline} {article.body or ''}", known_bases)
            reason = reject_reason(article.headline, article.body, article.source)
            if reason:
                article.is_rejected = True
                article.rejection_reason = reason
                self.articles[article.news_id] = article
                if not exists:
                    await asyncio.to_thread(self.db.insert_article, article)
                continue
            self.articles[article.news_id] = article
            if not exists:
                await asyncio.to_thread(self.db.insert_article, article)
            primary_ticker = (article.tickers or ["BTC"])[0]
            card = await self._sentiment_card(article, primary_ticker)
            llm_analyzed += 1
            if card:
                new_cards.append(card)
                self.cards = [c for c in self.cards if c.news_id != card.news_id]
                self.cards.append(card)
                if not exists:
                    await asyncio.to_thread(self.db.insert_sentiment, card, self.settings.llm_provider)

        # Keep CoinMarketCap Pro intelligence cards at the top, followed by newest media headlines
        self.cards.sort(
            key=lambda c: (
                1 if "coinmarketcap" in c.source.lower() else 0,
                c.published_at or datetime.min.replace(tzinfo=timezone.utc),
            ),
            reverse=True,
        )
        self.cards = self.cards[:200]
        return new_cards

    async def _from_coinmarketcap(self, known_bases: set[str]) -> tuple[list[NewsArticle], list[NewsCard]]:
        api_key = (self.settings.coinmarketcap_api_key or self.settings.crypto_news_api_key or "").strip()
        if not api_key:
            return [], []

        headers = {
            "X-CMC_PRO_API_KEY": api_key,
            "Accept": "application/json",
        }
        now = datetime.now(timezone.utc)
        hour_bucket = now.strftime("%Y-%m-%dT%H")
        articles: list[NewsArticle] = []
        cards: list[NewsCard] = []

        # A. Fetch CMC Fear & Greed Index
        fg_val = 55
        fg_class = "Neutral"
        try:
            fg_resp = await self._client.get(
                "https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest",
                headers=headers,
            )
            if fg_resp.status_code == 200:
                fg_data = (fg_resp.json() or {}).get("data") or {}
                fg_val = int(fg_data.get("value") or 55)
                fg_class = str(fg_data.get("value_classification") or "Neutral")
        except Exception as exc:  # noqa: BLE001
            logger.warning("cmc_fear_greed_failed", error=str(exc))

        # B. Fetch CMC Global Macro Metrics
        btc_dom = 56.0
        mcap_chg_24h = 0.0
        vol_chg_24h = 0.0
        try:
            gm_resp = await self._client.get(
                "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest",
                headers=headers,
            )
            if gm_resp.status_code == 200:
                gm_data = (gm_resp.json() or {}).get("data") or {}
                btc_dom = float(gm_data.get("btc_dominance") or 56.0)
                usd_q = ((gm_data.get("quote") or {}).get("USD")) or {}
                mcap_chg_24h = float(usd_q.get("total_market_cap_yesterday_percentage_change") or 0.0)
                vol_chg_24h = float(usd_q.get("total_volume_24h_yesterday_percentage_change") or 0.0)
        except Exception as exc:  # noqa: BLE001
            logger.warning("cmc_global_metrics_failed", error=str(exc))

        self.cmc_global = {
            "fear_greed_value": fg_val,
            "fear_greed_classification": fg_class,
            "btc_dominance": round(btc_dom, 2),
            "market_cap_change_24h": round(mcap_chg_24h, 2),
            "volume_change_24h": round(vol_chg_24h, 2),
            "updated_at": now.isoformat(),
        }

        # Create Global Macro Intelligence Card from CoinMarketCap
        macro_sent = "BULLISH" if (fg_val >= 52 or mcap_chg_24h >= 0) else "BEARISH"
        macro_score = round(min(0.94, max(0.76, abs(fg_val - 50) / 50.0 * 0.25 + 0.76)), 3)
        macro_id = stable_news_id("CoinMarketCap Pro", None, f"cmc-global-{hour_bucket}", hour_bucket)
        macro_headline = (
            f"CoinMarketCap Macro Intelligence: Fear & Greed Index at {fg_val}/100 ({fg_class}) "
            f"| Global Market Cap {mcap_chg_24h:+.2f}% | BTC Dominance {btc_dom:.1f}%"
        )
        macro_reason = (
            f"CoinMarketCap Pro global telemetry signals {macro_sent} macro conditions: "
            f"Fear & Greed={fg_val} ({fg_class}), 24h Global Volume Δ={vol_chg_24h:+.2f}%, BTC.D={btc_dom:.1f}%."
        )
        articles.append(
            NewsArticle(
                news_id=macro_id,
                source="CoinMarketCap Pro",
                source_quality=0.92,
                headline=macro_headline,
                url="https://coinmarketcap.com/charts/",
                body=macro_reason,
                published_at=now,
                tickers=["BTC", "ETH"],
            )
        )
        cards.append(
            NewsCard(
                news_id=macro_id,
                ticker="BTC",
                headline=macro_headline,
                sentiment=macro_sent,  # type: ignore[arg-type]
                sentiment_score=macro_score,
                impact_level="HIGH",
                category="MACRO",
                source="CoinMarketCap Pro",
                published_at=now,
                confidence=0.90,
                reason=macro_reason,
            )
        )

        # C. Fetch CMC Top 100 Cryptocurrency Listings & Analyze Each Coin
        try:
            list_resp = await self._client.get(
                "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest",
                params={"limit": 100, "convert": "USD"},
                headers=headers,
            )
            if list_resp.status_code == 200:
                items = (list_resp.json() or {}).get("data") or []
                scored_movers: list[tuple[float, dict[str, Any]]] = []

                for item in items:
                    sym = str(item.get("symbol") or "").upper().strip()
                    if not sym or sym in STABLE_BASES:
                        continue
                    if known_bases and sym not in known_bases:
                        continue
                    usd = ((item.get("quote") or {}).get("USD")) or {}
                    price = float(usd.get("price") or 0.0)
                    chg_1h = float(usd.get("percent_change_1h") or 0.0)
                    chg_24h = float(usd.get("percent_change_24h") or 0.0)
                    chg_7d = float(usd.get("percent_change_7d") or 0.0)
                    vol_24h = float(usd.get("volume_24h") or 0.0)
                    vol_chg = float(usd.get("volume_change_24h") or 0.0)
                    mcap = float(usd.get("market_cap") or 0.0)
                    dom = float(usd.get("market_cap_dominance") or 0.0)
                    rank = int(item.get("cmc_rank") or 999)
                    name = str(item.get("name") or sym)

                    # Determine directional sentiment & score from CMC multi-horizon momentum + volume
                    composite = chg_1h * 1.8 + chg_24h * 0.7 + (chg_7d * 0.15)
                    sentiment = "BULLISH" if composite >= 0 else "BEARISH"
                    intensity = min(0.18, (abs(chg_1h) * 0.025) + (abs(chg_24h) * 0.01) + (max(0.0, vol_chg) * 0.001))
                    sent_score = round(min(0.95, max(0.76, 0.76 + intensity)), 3)
                    impact = "HIGH" if (abs(chg_24h) >= 2.5 or abs(chg_1h) >= 0.8 or abs(vol_chg) >= 20 or rank <= 15) else "MEDIUM"
                    category = "ADOPTION" if sentiment == "BULLISH" else "MACRO"

                    reason = (
                        f"CoinMarketCap Pro #{rank} {name} ({sym}) analysis: "
                        f"1h {chg_1h:+.2f}%, 24h {chg_24h:+.2f}%, 7d {chg_7d:+.2f}% | "
                        f"24h Volume Δ {vol_chg:+.1f}% | Fear & Greed: {fg_val} ({fg_class})."
                    )
                    headline = (
                        f"CoinMarketCap #{rank} {name} ({sym}): "
                        f"24h {chg_24h:+.2f}% (1h {chg_1h:+.2f}%) · Vol Δ {vol_chg:+.1f}% "
                        f"— {sentiment.title()} Orderflow Catalyst"
                    )

                    meta = {
                        "symbol": sym,
                        "name": name,
                        "cmc_rank": rank,
                        "price": price,
                        "percent_change_1h": round(chg_1h, 3),
                        "percent_change_24h": round(chg_24h, 3),
                        "percent_change_7d": round(chg_7d, 3),
                        "volume_24h": vol_24h,
                        "volume_change_24h": round(vol_chg, 2),
                        "market_cap": mcap,
                        "market_cap_dominance": round(dom, 3),
                        "sentiment": sentiment,
                        "sentiment_score": sent_score,
                        "impact_level": impact,
                        "category": category,
                        "headline": headline,
                        "reason": reason,
                        "fear_greed_value": fg_val,
                        "fear_greed_classification": fg_class,
                    }
                    self.cmc_quotes[sym] = meta
                    activity_score = abs(chg_1h) * 2.5 + abs(chg_24h) + max(0.0, vol_chg) * 0.08 + (20.0 / max(1, rank))
                    scored_movers.append((activity_score, meta))

                scored_movers.sort(key=lambda x: x[0], reverse=True)
                for _, meta in scored_movers[:28]:
                    sym = meta["symbol"]
                    nid = stable_news_id("CoinMarketCap Pro", None, f"cmc-{sym}-{hour_bucket}", hour_bucket)
                    slug = str(meta["name"]).lower().replace(" ", "-")
                    articles.append(
                        NewsArticle(
                            news_id=nid,
                            source="CoinMarketCap Pro",
                            source_quality=0.92,
                            headline=meta["headline"],
                            url=f"https://coinmarketcap.com/currencies/{slug}/",
                            body=meta["reason"],
                            published_at=now,
                            tickers=[sym],
                        )
                    )
                    cards.append(
                        NewsCard(
                            news_id=nid,
                            ticker=sym,
                            headline=meta["headline"],
                            sentiment=meta["sentiment"],
                            sentiment_score=meta["sentiment_score"],
                            impact_level=meta["impact_level"],
                            category=meta["category"],
                            source="CoinMarketCap Pro",
                            published_at=now,
                            confidence=round(min(0.95, max(0.82, meta["sentiment_score"])), 3),
                            reason=meta["reason"],
                        )
                    )
                logger.info("coinmarketcap_intelligence_loaded", coins=len(self.cmc_quotes), cards=len(cards))
        except Exception as exc:  # noqa: BLE001
            logger.error("cmc_listings_fetch_failed", error=str(exc))

        return articles, cards

    async def _sentiment_card(self, article: NewsArticle, ticker: str) -> NewsCard | None:
        try:
            llm = await self.llm.analyze(article.news_id, article.headline, article.body, ticker)
        except LlmUnavailable:
            logger.warning("llm_unavailable_skip_sentiment", news_id=article.news_id)
            return None
        except Exception as exc:  # noqa: BLE001
            logger.error("llm_sentiment_failed", news_id=article.news_id, error=str(exc))
            return None

        age_minutes = 0.0
        if article.published_at:
            age_minutes = max(0.0, (datetime.now(timezone.utc) - article.published_at).total_seconds() / 60)
        confidence = news_confidence(
            sentiment_score=llm.sentiment_score,
            source=article.source,
            impact_level=llm.impact_level,
            age_minutes=age_minutes,
            ticker_in_headline=ticker.upper() in article.headline.upper(),
        )
        return NewsCard(
            news_id=article.news_id,
            ticker=llm.ticker or ticker,
            headline=article.headline,
            sentiment=llm.sentiment,
            sentiment_score=llm.sentiment_score,
            impact_level=llm.impact_level,
            category=llm.category,
            source=article.source,
            published_at=article.published_at,
            confidence=confidence,
            reason=llm.reason,
        )

    async def _from_rss(self) -> list[NewsArticle]:
        articles: list[NewsArticle] = []
        for url in self.settings.rss_url_list:
            try:
                response = await self._client.get(url)
                response.raise_for_status()
                parsed = feedparser.parse(response.text)
                source = parsed.feed.get("title", url)
                for entry in parsed.entries[:20]:
                    headline = entry.get("title") or ""
                    link = entry.get("link")
                    published = _parse_date(entry.get("published") or entry.get("updated"))
                    news_id = stable_news_id(source, link, headline, published.isoformat() if published else None)
                    articles.append(
                        NewsArticle(
                            news_id=news_id,
                            source=str(source),
                            source_quality=source_quality(str(source)),
                            headline=headline,
                            url=link,
                            body=entry.get("summary"),
                            published_at=published,
                        )
                    )
            except Exception as exc:  # noqa: BLE001
                logger.error("rss_fetch_failed", url=url, error=str(exc))
        return articles

    async def _from_cryptocompare_public(self) -> list[NewsArticle]:
        try:
            response = await self._client.get(
                "https://min-api.cryptocompare.com/data/v2/news/",
                params={"lang": "EN"},
            )
            if response.status_code >= 400:
                return []
            payload: dict[str, Any] = response.json()
            data = payload.get("Data", [])
            if not isinstance(data, list):
                return []
            articles: list[NewsArticle] = []
            for item in data[:20]:
                headline = item.get("title") or ""
                url = item.get("url")
                source = str((item.get("source_info") or {}).get("name") or item.get("source") or "cryptocompare")
                pub_ts = item.get("published_on")
                published = (
                    datetime.fromtimestamp(int(pub_ts), tz=timezone.utc)
                    if isinstance(pub_ts, (int, float))
                    else None
                )
                news_id = stable_news_id(source, url, headline, published.isoformat() if published else str(item.get("id")))
                articles.append(
                    NewsArticle(
                        news_id=news_id,
                        source=source,
                        source_quality=source_quality(source),
                        headline=headline,
                        url=url if isinstance(url, str) else None,
                        body=item.get("body"),
                        published_at=published,
                    )
                )
            return articles
        except Exception as exc:  # noqa: BLE001
            logger.warning("cryptocompare_public_fetch_failed", error=str(exc))
            return []

    async def _from_cryptopanic(self) -> list[NewsArticle]:
        token = (self.settings.cryptopanic_auth_token or "").strip()
        if not token:
            return []
        for endpoint in (
            "https://cryptopanic.com/api/developer/v2/posts/",
            "https://cryptopanic.com/api/free/v1/posts/",
        ):
            try:
                response = await self._client.get(
                    endpoint,
                    params={"auth_token": token, "kind": "news", "public": "true"},
                )
                if response.status_code < 400:
                    payload: dict[str, Any] = response.json()
                    results = payload.get("results", [])
                    articles: list[NewsArticle] = []
                    for item in results:
                        headline = item.get("title") or ""
                        url = (
                            (item.get("url") or item.get("source", {}) or {}).get("url")
                            if isinstance(item.get("source"), dict)
                            else item.get("url")
                        )
                        published = _parse_date(item.get("published_at") or item.get("created_at"))
                        source = "cryptopanic"
                        news_id = stable_news_id(
                            source, url, headline, published.isoformat() if published else str(item.get("id"))
                        )
                        articles.append(
                            NewsArticle(
                                news_id=news_id,
                                source=source,
                                source_quality=source_quality(source),
                                headline=headline,
                                url=url if isinstance(url, str) else None,
                                published_at=published,
                            )
                        )
                    return articles
            except Exception as exc:  # noqa: BLE001
                logger.warning("cryptopanic_endpoint_failed", endpoint=endpoint, error=str(exc))
        return []


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        except Exception:
            return None
