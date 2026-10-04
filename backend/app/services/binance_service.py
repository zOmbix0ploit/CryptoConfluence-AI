from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx
import websockets
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import Settings, get_settings
from app.schemas.market import Candle, Ticker24h
from app.utils.logging import get_logger
from app.utils.symbols import is_eligible_usdt_spot, require_fields

logger = get_logger("binance")

TickerHandler = Callable[[dict[str, Any]], Awaitable[None]]


class BinanceService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client = httpx.AsyncClient(
            base_url=self.settings.binance_base_url,
            timeout=httpx.Timeout(15.0, connect=8.0),
            headers={"User-Agent": "CryptoConfluenceAI/1.0"},
        )
        self._eligible_symbols: set[str] = set()
        self._ws_task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self.ws_status: str = "DISCONNECTED"
        self.last_message_at: datetime | None = None

    async def close(self) -> None:
        self._stop.set()
        if self._ws_task:
            self._ws_task.cancel()
        await self._client.aclose()

    @retry(
        retry=retry_if_exception_type((httpx.HTTPError, TimeoutError)),
        wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
        stop=stop_after_attempt(4),
        reraise=True,
    )
    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = await self._client.get(path, params=params)
        if response.status_code in (451, 403):
            fallback_url = "https://data-api.binance.vision"
            logger.info("binance_switching_to_vision_endpoint", status=response.status_code, fallback=fallback_url)
            await self._client.aclose()
            self._client = httpx.AsyncClient(
                base_url=fallback_url,
                timeout=httpx.Timeout(15.0, connect=8.0),
                headers={"User-Agent": "CryptoConfluenceAI/1.0"},
            )
            response = await self._client.get(path, params=params)
        if response.status_code == 429:
            retry_after = float(response.headers.get("Retry-After", "2"))
            logger.warning("binance_rate_limited", retry_after=retry_after)
            await asyncio.sleep(retry_after)
            response = await self._client.get(path, params=params)
        response.raise_for_status()
        payload = response.json()
        if payload is None:
            raise ValueError("Empty Binance response")
        return payload

    async def load_eligible_symbols(self) -> set[str]:
        payload = await self._get("/api/v3/exchangeInfo")
        require_fields(payload, ["symbols"])
        eligible: set[str] = set()
        for item in payload["symbols"]:
            try:
                symbol = item["symbol"]
                status = item.get("status", "")
                spot = bool(item.get("isSpotTradingAllowed", False))
                quote = item.get("quoteAsset")
                if quote != "USDT":
                    continue
                if is_eligible_usdt_spot(symbol, status, spot):
                    eligible.add(symbol)
            except (KeyError, TypeError) as exc:
                logger.error("invalid_exchange_info_row", error=str(exc))
        self._eligible_symbols = eligible
        logger.info("eligible_symbols_loaded", count=len(eligible))
        return eligible

    @property
    def eligible_symbols(self) -> set[str]:
        return self._eligible_symbols

    async def ticker_24h(self) -> list[Ticker24h]:
        payload = await self._get("/api/v3/ticker/24hr")
        if not isinstance(payload, list):
            raise ValueError("Unexpected 24hr ticker payload")
        rows: list[Ticker24h] = []
        for item in payload:
            symbol = item.get("symbol")
            if symbol not in self._eligible_symbols:
                continue
            try:
                require_fields(item, ["lastPrice", "priceChangePercent", "highPrice", "lowPrice", "volume", "quoteVolume"])
                quote_volume = float(item["quoteVolume"])
                if quote_volume < self.settings.min_quote_volume_usdt:
                    continue
                rows.append(
                    Ticker24h(
                        symbol=symbol,
                        last_price=float(item["lastPrice"]),
                        price_change_percent=float(item["priceChangePercent"]),
                        high_price=float(item["highPrice"]),
                        low_price=float(item["lowPrice"]),
                        volume=float(item["volume"]),
                        quote_volume=quote_volume,
                    )
                )
            except (ValueError, TypeError, KeyError) as exc:
                logger.warning("skip_malformed_ticker", symbol=symbol, error=str(exc))
        rows.sort(key=lambda row: row.quote_volume, reverse=True)
        return rows[: self.settings.screener_limit]

    async def klines(self, symbol: str, interval: str, limit: int | None = None) -> list[Candle]:
        if self._eligible_symbols and symbol not in self._eligible_symbols:
            raise ValueError(f"Invalid or unsupported symbol: {symbol}")
        size = limit or self.settings.kline_limit
        payload = await self._get(
            "/api/v3/klines",
            params={"symbol": symbol, "interval": interval, "limit": size},
        )
        if not isinstance(payload, list) or not payload:
            raise ValueError(f"No candle data for {symbol} {interval}")
        candles: list[Candle] = []
        for row in payload:
            if not isinstance(row, list) or len(row) < 8:
                raise ValueError("Malformed kline row")
            candles.append(
                Candle(
                    open_time=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
                    open=float(row[1]),
                    high=float(row[2]),
                    low=float(row[3]),
                    close=float(row[4]),
                    volume=float(row[5]),
                    close_time=datetime.fromtimestamp(row[6] / 1000, tz=timezone.utc),
                    quote_volume=float(row[7]),
                )
            )
        return candles

    def start_mini_ticker_stream(self, handler: TickerHandler) -> None:
        if self._ws_task and not self._ws_task.done():
            return
        self._stop.clear()
        self._ws_task = asyncio.create_task(self._run_ws(handler), name="binance-ws")

    async def _run_ws(self, handler: TickerHandler) -> None:
        backoff = 1.0
        url = self.settings.binance_ws_url.replace("/ws", "/stream?streams=!miniTicker@arr")
        while not self._stop.is_set():
            try:
                self.ws_status = "RECONNECTING"
                async with websockets.connect(url, ping_interval=20, ping_timeout=20, close_timeout=5) as ws:
                    self.ws_status = "CONNECTED"
                    backoff = 1.0
                    logger.info("binance_ws_connected")
                    async for raw in ws:
                        self.last_message_at = datetime.now(timezone.utc)
                        message = json.loads(raw)
                        data = message.get("data", message)
                        await handler(data)
            except asyncio.CancelledError:
                self.ws_status = "DISCONNECTED"
                raise
            except Exception as exc:  # noqa: BLE001 - reconnect loop must continue
                self.ws_status = "RECONNECTING"
                logger.error("binance_ws_error", error=str(exc), backoff=backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
        self.ws_status = "DISCONNECTED"
