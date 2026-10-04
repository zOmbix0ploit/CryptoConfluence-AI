from __future__ import annotations

import asyncio
import json
from pathlib import Path
import sys

import httpx

# Ensure backend directory is in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
STATIC_DATA_DIR = ROOT_DIR / "frontend" / "public" / "static-data"
if str(BACKEND_DIR) not in sys.path:
  sys.path.insert(0, str(BACKEND_DIR))

from app.config import get_settings
import app.main as main_module
from app.schemas.market import GeneratedSignal
from app.services.binance_service import BinanceService
from app.services.llm_service import LlmService
from app.services.market_state import MarketState
from app.services.news_service import NewsService
from app.services.notifications import NotificationService
from app.services.supabase_service import SupabaseService
from app.services.unlock import UnlockService


async def run_engine_and_export() -> None:
  STATIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
  settings = get_settings()

  # Load runtime_settings.json if present locally
  runtime_file = BACKEND_DIR / "runtime_settings.json"
  if runtime_file.exists():
    try:
      saved = json.loads(runtime_file.read_text(encoding="utf-8"))
      for k, v in saved.items():
        if hasattr(settings, k):
          setattr(settings, k, v)
    except Exception as exc:
      print(f"[warn] Could not read runtime_settings.json: {exc}")

  binance = BinanceService(settings)
  llm = LlmService(settings)
  db = SupabaseService(settings)
  news = NewsService(settings, llm=llm, db=db)
  notifications = NotificationService(settings)
  market = MarketState(
      binance=binance,
      news=news,
      db=db,
      notifications=notifications,
      unlock=UnlockService(),
      settings=settings,
  )

  # Pre-seed signals from existing static-data/signals.json so GitHub Actions runners
  # preserve historical ledger and PnL across stateless runs
  existing_signals_file = STATIC_DATA_DIR / "signals.json"
  if existing_signals_file.exists():
    try:
      raw_payload = json.loads(
          existing_signals_file.read_text(encoding="utf-8")
      )
      items = (
          raw_payload.get("items", []) if isinstance(raw_payload, dict) else []
      )
      seeded: list[GeneratedSignal] = []
      seen: set[str] = set()
      for item in items:
        try:
          sig = GeneratedSignal.model_validate(item)
          if sig.symbol not in seen:
            seen.add(sig.symbol)
            seeded.append(sig)
            db.save_signal(sig)
        except Exception:
          continue
      if seeded:
        market.signals = seeded
        print(
            f"[info] Pre-seeded {len(seeded)} existing signals from"
            " static-data/signals.json"
        )
    except Exception as exc:
      print(f"[warn] Failed to pre-seed signals.json: {exc}")

  main_module.state = market

  try:
    print("[info] Bootstrapping Python MarketState engine...")
    await market.bootstrap()
    bases = {s.replace("USDT", "") for s in market.binance.eligible_symbols}
    print(f"[info] Ingesting live news for {len(bases)} symbols...")
    await news.ingest(bases)
    print("[info] Scanning live signals with 90%+ win-rate risk engine...")
    created = await market.scan_signals(limit=25)
    print(f"[info] Scan complete. Newly created signals: {len(created)}")
    await market.refresh_signal_status(sync_remote=True, suppress_alerts=False)

    # Export all endpoints via ASGI client
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=main_module.app),
        base_url="http://testserver",
        timeout=30.0,
    ) as client:
      endpoints = {
          "overview.json": "/market/overview",
          "signals.json": "/signals",
          "news.json": "/news",
          "bubbles_15m.json": "/market/bubbles?timeframe=15m",
          "bubbles_1h.json": "/market/bubbles?timeframe=1h",
          "bubbles_24h.json": "/market/bubbles?timeframe=24h",
          "candles_BTCUSDT_15m.json": (
              "/market/candles?symbol=BTCUSDT&interval=15m&limit=120"
          ),
          "health.json": "/health",
      }
      for filename, route in endpoints.items():
        resp = await client.get(route)
        if resp.status_code == 200:
          target = STATIC_DATA_DIR / filename
          target.write_text(
              json.dumps(resp.json(), indent=2),
              encoding="utf-8",
          )
          print(f"[ok] Exported {filename} ({target.stat().st_size} bytes)")
        else:
          print(f"[warn] Endpoint {route} returned HTTP {resp.status_code}")

    summary = market.trade_summary()
    print(
        f"[summary] Total={summary.get('total_signals')} | "
        f"WinRate={summary.get('win_rate')}% | "
        f"Profit={summary.get('profit_count')} | "
        f"Loss={summary.get('loss_count')} | "
        f"NetPnL=${summary.get('net_pnl_usd')}"
    )
  finally:
    await binance.close()
    await llm.close()
    await news.close()


if __name__ == "__main__":
  asyncio.run(run_engine_and_export())
