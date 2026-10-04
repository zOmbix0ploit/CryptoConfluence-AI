from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import get_settings
from app.routes.api import router
from app.services.binance_service import BinanceService
from app.services.llm_service import LlmService
from app.services.market_state import MarketState
from app.services.news_service import NewsService
from app.services.notifications import NotificationService
from app.services.supabase_service import SupabaseService
from app.services.unlock import UnlockService
from app.utils.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("main")
state: MarketState | None = None
_tasks: list[asyncio.Task] = []


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_per_minute: int = 120):
        super().__init__(app)
        self.max_per_minute = max_per_minute
        self._hits: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/ws":
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        now = asyncio.get_event_loop().time()
        window = self._hits.setdefault(ip, [])
        window[:] = [t for t in window if now - t < 60]
        if len(window) >= self.max_per_minute:
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
        window.append(now)
        return await call_next(request)


async def _loop(name: str, interval: float, coro_factory):
    await asyncio.sleep(2)
    while True:
        try:
            await coro_factory()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.error("background_loop_error", loop=name, error=str(exc))
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global state, _tasks
    import json
    from pathlib import Path

    settings = get_settings()
    runtime_file = Path(__file__).resolve().parent.parent / "runtime_settings.json"
    if runtime_file.exists():
        try:
            saved = json.loads(runtime_file.read_text(encoding="utf-8"))
            for k, v in saved.items():
                if hasattr(settings, k):
                    setattr(settings, k, v)
        except Exception as exc:  # noqa: BLE001
            logger.warning("runtime_settings_load_failed", error=str(exc))

    binance = BinanceService(settings)
    llm = LlmService(settings)
    db = SupabaseService(settings)
    news = NewsService(settings, llm=llm, db=db)
    market = MarketState(
        binance=binance,
        news=news,
        db=db,
        notifications=NotificationService(settings),
        unlock=UnlockService(),
        settings=settings,
    )
    state = market
    try:
        await market.bootstrap()
    except Exception as exc:  # noqa: BLE001
        logger.error("bootstrap_failed", error=str(exc))

    async def refresh():
        await market.refresh_tickers()

    async def ingest_news():
        bases = {s.replace("USDT", "") for s in market.binance.eligible_symbols}
        await news.ingest(bases)
        if len(market.signals) < 5:
            await market.scan_signals(limit=15)

    async def scan():
        await market.scan_signals(limit=20)

    async def statuses():
        await market.refresh_signal_status()

    _tasks = [
        asyncio.create_task(_loop("tickers", 20, refresh), name="tickers"),
        asyncio.create_task(_loop("news", settings.news_ingest_interval_seconds, ingest_news), name="news"),
        asyncio.create_task(_loop("signals", 90, scan), name="signals"),
        asyncio.create_task(_loop("status", 12, statuses), name="status"),
    ]
    logger.info("backend_started")
    yield
    for task in _tasks:
        task.cancel()
    await binance.close()
    await llm.close()
    await news.close()
    state = None


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title="CryptoConfluence AI",
        description="Market intelligence and signal analysis. Not financial advice. Does not execute trades.",
        version="1.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    application.add_middleware(RateLimitMiddleware)
    application.include_router(router)
    application.include_router(router, prefix="/api")
    return application


app = create_app()
