from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.indicators.params import InsufficientDataError
from app.services.market_state import MarketState

router = APIRouter()


def get_state() -> MarketState:
    from app.main import state

    if state is None:
        raise HTTPException(status_code=503, detail="Market data temporarily unavailable. Retrying connection...")
    return state


@router.get("/health")
async def health():
    from app.main import state as app_state
    from app.config import get_settings

    settings = get_settings()
    st = app_state
    binance_ws = st.binance.ws_status if st else "DISCONNECTED"
    status = "ok" if st and st.last_error is None else "degraded"
    return {
        "status": status,
        "utc_now": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "binance_ws": binance_ws,
        "supabase_configured": bool(settings.supabase_url and settings.supabase_service_role_key),
        "llm_configured": bool(settings.openai_api_key or settings.anthropic_api_key or settings.google_ai_api_key),
        "news_configured": bool(settings.rss_url_list or settings.cryptopanic_auth_token or settings.crypto_news_api_key),
        "last_market_update": st.last_market_update.isoformat() if st and st.last_market_update else None,
        "details": {
            "last_error": st.last_error if st else "not_started",
            "news_error": st.news.last_error if st else None,
            "symbols": len(st.rows) if st else 0,
        },
    }


@router.get("/market/overview")
async def market_overview():
    st = get_state()
    if st.rows:
        rows = list(st.rows.values())
    else:
        try:
            rows = await st.refresh_tickers()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Market data temporarily unavailable. {exc}") from exc
    return {
        "data_freshness": "live" if rows else "cached",
        "updated_at": st.last_market_update.isoformat() if st.last_market_update else None,
        "connection": "CONNECTED" if rows else st.binance.ws_status,
        "benchmarks": st.btc_eth(),
        "rows": [row.model_dump(mode="json") for row in rows],
    }


@router.get("/market/bubbles")
async def market_bubbles(timeframe: str = Query("24h", pattern="^(15m|1h|24h)$")):
    st = get_state()
    if st.rows:
        rows = list(st.rows.values())
    else:
        try:
            rows = await st.refresh_tickers()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Market data temporarily unavailable. {exc}") from exc
    bubbles = []
    for row in rows:
        change = {
            "15m": row.price_change_15m,
            "1h": row.price_change_1h,
            "24h": row.price_change_24h,
        }[timeframe]
        if change is None:
            continue
        bubbles.append(
            {
                "symbol": row.symbol,
                "display_symbol": row.display_symbol,
                "price": row.last_price,
                "change": change,
                "volume": row.quote_volume_24h,
                "volume_ratio": row.volume_ratio,
                "momentum_score": row.momentum_score,
            }
        )
    return {"timeframe": timeframe, "bubbles": bubbles, "updated_at": st.last_market_update}


@router.get("/market/candles")
async def market_candles(
    symbol: str = Query(..., min_length=5, max_length=20),
    interval: str = Query("15m", pattern="^(15m|1h|4h|1d)$"),
    limit: int = Query(120, ge=50, le=500),
):
    st = get_state()
    symbol = symbol.upper()
    try:
        candles = await st.get_candles(symbol, interval, limit)
        technicals = None
        try:
            technicals = await st.get_technicals(symbol, "15m" if interval == "1d" else interval if interval in {"15m", "1h"} else "15m")
        except InsufficientDataError:
            technicals = None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Candle data unavailable: {exc}") from exc

    signal = next((s for s in st.signals if s.symbol == symbol), None)
    return {
        "symbol": symbol,
        "interval": interval,
        "candles": [c.model_dump(mode="json") for c in candles],
        "technicals": technicals.model_dump(mode="json") if technicals else None,
        "signal": signal.model_dump(mode="json") if signal else None,
    }


@router.get("/news")
async def news(symbol: str | None = None):
    st = get_state()
    seen_ids: set[str] = set()
    unique_cards = []
    for c in st.news.cards:
        if c.news_id not in seen_ids:
            seen_ids.add(c.news_id)
            unique_cards.append(c)
    if symbol:
        base = symbol.upper().replace("USDT", "").replace("/", "")
        unique_cards = [c for c in unique_cards if c.ticker.upper() == base]
    return {
        "items": [c.model_dump(mode="json") for c in unique_cards[:80]],
        "error": st.news.last_error,
        "count": len(unique_cards),
    }


@router.get("/technicals")
async def technicals(symbol: str = Query(..., min_length=5), timeframe: str = Query("15m", pattern="^(15m|1h)$")):
    st = get_state()
    try:
        snap = await st.get_technicals(symbol.upper(), timeframe)
    except InsufficientDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return snap.model_dump(mode="json")


@router.get("/signals")
async def signals():
    from app.utils.symbols import STABLE_BASES

    st = get_state()
    summary = st.trade_summary()
    filtered = [s for s in st.signals if s.symbol.replace("USDT", "") not in STABLE_BASES]
    return {
        "items": [s.model_dump(mode="json") for s in filtered],
        "summary": summary,
    }


@router.post("/signals/scan")
async def scan_signals_now():
    import asyncio
    from app.utils.symbols import STABLE_BASES

    st = get_state()
    created = await st.scan_signals(limit=25)
    asyncio.create_task(st.refresh_signal_status(sync_remote=True))
    summary = st.trade_summary()
    filtered = [s for s in st.signals if s.symbol.replace("USDT", "") not in STABLE_BASES]
    return {
        "created_count": len(created),
        "items": [s.model_dump(mode="json") for s in filtered],
        "summary": summary,
    }


@router.get("/signals/{signal_id}")
async def signal_detail(signal_id: str):
    st = get_state()
    found = next((s for s in st.signals if s.signal_id == signal_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Signal not found")
    return found.model_dump(mode="json")


def _serialize_settings(s) -> dict:
    return {
        "defaultTimeframe": s.default_timeframe,
        "aggressiveMode": s.aggressive_mode,
        "minStopPct": s.min_stop_distance_pct,
        "maxStopPct": s.max_stop_distance_pct,
        "minTp1R": s.min_tp1_r,
        "minTp2R": s.min_tp2_r,
        "notifyBrowser": s.notify_browser,
        "notifyDiscord": s.notify_discord,
        "discordWebhookUrl": s.discord_webhook_url,
        "notifyDiscordPnl": s.notify_discord_pnl,
        "discordPnlWebhookUrl": s.discord_pnl_webhook_url,
        "pnlAlertOnTp": s.pnl_alert_on_tp,
        "pnlAlertOnSl": s.pnl_alert_on_sl,
        "pnlAlertOnMilestone": s.pnl_alert_on_milestone,
        "pnlProfitThresholdPct": s.pnl_profit_threshold_pct,
        "pnlLossThresholdPct": s.pnl_loss_threshold_pct,
        "notifyTelegram": s.notify_telegram,
        "telegramBotToken": s.telegram_bot_token,
        "telegramChatId": s.telegram_chat_id,
        "weights": {
            "news": int(round(s.weight_news * 100)),
            "momentum": int(round(s.weight_momentum * 100)),
            "volume": int(round(s.weight_volume * 100)),
            "supertrend": int(round(s.weight_supertrend * 100)),
            "ewo": int(round(s.weight_ewo * 100)),
            "rsi": int(round(s.weight_rsi * 100)),
            "sr": int(round(s.weight_sr * 100)),
        },
    }


@router.get("/settings")
async def get_runtime_settings():
    from app.config import get_settings
    from app.main import state as app_state

    s = app_state.settings if app_state else get_settings()
    return _serialize_settings(s)


@router.post("/settings")
async def update_runtime_settings(payload: dict):
    import asyncio
    import json
    from pathlib import Path
    from app.config import get_settings
    from app.main import state as app_state

    s = app_state.settings if app_state else get_settings()

    if "defaultTimeframe" in payload and payload["defaultTimeframe"] in {"15m", "1h", "4h", "1d"}:
        s.default_timeframe = str(payload["defaultTimeframe"])
    if "aggressiveMode" in payload:
        s.aggressive_mode = bool(payload["aggressiveMode"])
    if "minStopPct" in payload and payload["minStopPct"] is not None:
        s.min_stop_distance_pct = max(0.2, min(10.0, float(payload["minStopPct"])))
    if "maxStopPct" in payload and payload["maxStopPct"] is not None:
        s.max_stop_distance_pct = max(s.min_stop_distance_pct + 0.2, min(20.0, float(payload["maxStopPct"])))
    if "minTp1R" in payload and payload["minTp1R"] is not None:
        s.min_tp1_r = max(0.5, min(10.0, float(payload["minTp1R"])))
    if "minTp2R" in payload and payload["minTp2R"] is not None:
        s.min_tp2_r = max(s.min_tp1_r + 0.2, min(20.0, float(payload["minTp2R"])))

    if "notifyBrowser" in payload:
        s.notify_browser = bool(payload["notifyBrowser"])
    if "notifyDiscord" in payload:
        s.notify_discord = bool(payload["notifyDiscord"])
    if "discordWebhookUrl" in payload and payload["discordWebhookUrl"] is not None:
        s.discord_webhook_url = str(payload["discordWebhookUrl"]).strip()
    if "notifyDiscordPnl" in payload:
        s.notify_discord_pnl = bool(payload["notifyDiscordPnl"])
    if "discordPnlWebhookUrl" in payload and payload["discordPnlWebhookUrl"] is not None:
        s.discord_pnl_webhook_url = str(payload["discordPnlWebhookUrl"]).strip()
    if "pnlAlertOnTp" in payload:
        s.pnl_alert_on_tp = bool(payload["pnlAlertOnTp"])
    if "pnlAlertOnSl" in payload:
        s.pnl_alert_on_sl = bool(payload["pnlAlertOnSl"])
    if "pnlAlertOnMilestone" in payload:
        s.pnl_alert_on_milestone = bool(payload["pnlAlertOnMilestone"])
    if "pnlProfitThresholdPct" in payload and payload["pnlProfitThresholdPct"] is not None:
        s.pnl_profit_threshold_pct = max(0.1, min(50.0, float(payload["pnlProfitThresholdPct"])))
    if "pnlLossThresholdPct" in payload and payload["pnlLossThresholdPct"] is not None:
        s.pnl_loss_threshold_pct = max(0.1, min(50.0, abs(float(payload["pnlLossThresholdPct"]))))
    if "notifyTelegram" in payload:
        s.notify_telegram = bool(payload["notifyTelegram"])
    if "telegramBotToken" in payload and payload["telegramBotToken"] is not None:
        s.telegram_bot_token = str(payload["telegramBotToken"]).strip()
    if "telegramChatId" in payload and payload["telegramChatId"] is not None:
        s.telegram_chat_id = str(payload["telegramChatId"]).strip()

    weights = payload.get("weights")
    if isinstance(weights, dict):
        total = sum(max(0.0, float(weights.get(k, 0))) for k in ("news", "momentum", "volume", "supertrend", "ewo", "rsi", "sr"))
        if total > 0:
            s.weight_news = round(max(0.0, float(weights.get("news", 25))) / total, 4)
            s.weight_momentum = round(max(0.0, float(weights.get("momentum", 20))) / total, 4)
            s.weight_volume = round(max(0.0, float(weights.get("volume", 15))) / total, 4)
            s.weight_supertrend = round(max(0.0, float(weights.get("supertrend", 15))) / total, 4)
            s.weight_ewo = round(max(0.0, float(weights.get("ewo", 10))) / total, 4)
            s.weight_rsi = round(max(0.0, float(weights.get("rsi", 5))) / total, 4)
            s.weight_sr = round(max(0.0, float(weights.get("sr", 10))) / total, 4)

    runtime_file = Path(__file__).resolve().parent.parent.parent / "runtime_settings.json"
    try:
        runtime_file.write_text(
            json.dumps(
                {
                    "default_timeframe": s.default_timeframe,
                    "aggressive_mode": s.aggressive_mode,
                    "min_stop_distance_pct": s.min_stop_distance_pct,
                    "max_stop_distance_pct": s.max_stop_distance_pct,
                    "min_tp1_r": s.min_tp1_r,
                    "min_tp2_r": s.min_tp2_r,
                    "notify_browser": s.notify_browser,
                    "notify_discord": s.notify_discord,
                    "discord_webhook_url": s.discord_webhook_url,
                    "notify_discord_pnl": s.notify_discord_pnl,
                    "discord_pnl_webhook_url": s.discord_pnl_webhook_url,
                    "pnl_alert_on_tp": s.pnl_alert_on_tp,
                    "pnl_alert_on_sl": s.pnl_alert_on_sl,
                    "pnl_alert_on_milestone": s.pnl_alert_on_milestone,
                    "pnl_profit_threshold_pct": s.pnl_profit_threshold_pct,
                    "pnl_loss_threshold_pct": s.pnl_loss_threshold_pct,
                    "notify_telegram": s.notify_telegram,
                    "telegram_bot_token": s.telegram_bot_token,
                    "telegram_chat_id": s.telegram_chat_id,
                    "weight_news": s.weight_news,
                    "weight_momentum": s.weight_momentum,
                    "weight_volume": s.weight_volume,
                    "weight_supertrend": s.weight_supertrend,
                    "weight_ewo": s.weight_ewo,
                    "weight_rsi": s.weight_rsi,
                    "weight_sr": s.weight_sr,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    except Exception:  # noqa: BLE001
        pass

    if app_state:
        app_state.settings = s
        app_state.notifications.settings = s
        asyncio.create_task(app_state.scan_signals(limit=25))

    return {"ok": True, "settings": _serialize_settings(s)}


@router.post("/settings/test")
@router.post("/settings/test-notification")
async def test_notification(payload: dict):
    from app.config import get_settings
    from app.main import state as app_state
    from app.services.notifications import NotificationService

    s = app_state.settings if app_state else get_settings()
    notif = app_state.notifications if app_state else NotificationService(s)
    channel = str(payload.get("channel") or "discord").lower()

    try:
        if channel == "discord_pnl":
            webhook_url = str(
                payload.get("discordPnlWebhookUrl")
                or payload.get("discordWebhookUrl")
                or s.discord_pnl_webhook_url
                or s.discord_webhook_url
                or ""
            ).strip()
            summary = app_state.trade_summary() if app_state else None
            sample_sig = app_state.signals[0] if (app_state and app_state.signals) else None
            return await notif.send_test_discord_pnl(webhook_url, summary=summary, sample_signal=sample_sig)
        if channel == "discord":
            webhook_url = str(
                payload.get("discordWebhookUrl")
                or payload.get("discordPnlWebhookUrl")
                or s.discord_webhook_url
                or s.discord_pnl_webhook_url
                or ""
            ).strip()
            return await notif.send_test_discord(webhook_url)
        if channel == "telegram":
            bot_token = str(payload.get("telegramBotToken") or s.telegram_bot_token or "").strip()
            chat_id = str(payload.get("telegramChatId") or s.telegram_chat_id or "").strip()
            return await notif.send_test_telegram(bot_token, chat_id)
        raise ValueError(f"Unsupported notification channel: {channel}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send test alert: {exc}") from exc


@router.post("/signals/discord-pnl-report")
async def send_discord_pnl_report(payload: dict | None = None):
    from app.utils.symbols import STABLE_BASES

    st = get_state()
    payload = payload or {}
    webhook_url = str(
        payload.get("discordPnlWebhookUrl")
        or payload.get("discordWebhookUrl")
        or st.settings.discord_pnl_webhook_url
        or st.settings.discord_webhook_url
        or ""
    ).strip()
    if not webhook_url:
        raise HTTPException(
            status_code=400,
            detail="Discord Profit/Loss Webhook URL is not configured yet. Please add your Discord Webhook URL in Settings.",
        )
    summary = st.trade_summary()
    filtered = [s for s in st.signals if s.symbol.replace("USDT", "") not in STABLE_BASES]
    try:
        return await st.notifications.send_portfolio_pnl_report(webhook_url, summary, filtered)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send Profit/Loss report to Discord: {exc}") from exc


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    st = get_state()
    await st.register_client(ws)
    try:
        await ws.send_json(
            {
                "type": "hello",
                "connection": st.binance.ws_status,
                "last_market_update": st.last_market_update.isoformat() if st.last_market_update else None,
            }
        )
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        st.drop_client(ws)
    except Exception:
        st.drop_client(ws)
