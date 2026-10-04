from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from postgrest import SyncPostgrestClient
from supabase import Client, create_client

from app.config import Settings, get_settings
from app.schemas.market import GeneratedSignal, MarketRow, NewsArticle, NewsCard, TechnicalSnapshot
from app.utils.logging import get_logger
from app.utils.symbols import STABLE_BASES

logger = get_logger("supabase")


class SupabaseService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: Client | SyncPostgrestClient | None = None
        self._sqlite_path = Path(__file__).resolve().parent.parent.parent / "trade_history.db"
        self._init_sqlite()
        self._remote_pnl_cache: dict[str, tuple[str, float]] = {}

        if self.settings.supabase_url and self.settings.supabase_service_role_key:
            url = self.settings.supabase_url.rstrip("/")
            key = self.settings.supabase_service_role_key.strip()
            try:
                self._client = create_client(url, key)
            except Exception as exc:  # noqa: BLE001
                if key.startswith(("sb_secret_", "sb_publishable_")):
                    try:
                        self._client = SyncPostgrestClient(
                            f"{url}/rest/v1",
                            headers={
                                "apikey": key,
                                "Authorization": f"Bearer {key}",
                            },
                            schema="public",
                            timeout=20,
                        )
                        logger.info("supabase_postgrest_client_initialized")
                    except Exception as inner_exc:  # noqa: BLE001
                        logger.warning("supabase_init_failed_using_in_memory", error=str(inner_exc))
                        self._client = None
                else:
                    logger.warning("supabase_init_failed_using_in_memory", error=str(exc))
                    self._client = None

    def _init_sqlite(self) -> None:
        try:
            with sqlite3.connect(self._sqlite_path) as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS trades (
                        signal_id TEXT PRIMARY KEY,
                        fingerprint TEXT NOT NULL,
                        coin TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        timeframe TEXT NOT NULL,
                        type TEXT NOT NULL,
                        entry REAL NOT NULL,
                        current_price REAL,
                        exit_price REAL,
                        sl REAL NOT NULL,
                        tp1 REAL NOT NULL,
                        tp2 REAL NOT NULL,
                        risk_percentage REAL NOT NULL,
                        risk_reward_tp1 REAL NOT NULL,
                        risk_reward_tp2 REAL NOT NULL,
                        confidence_score INTEGER NOT NULL,
                        confidence_level TEXT NOT NULL,
                        confluence_reasons TEXT NOT NULL,
                        warnings TEXT NOT NULL,
                        status TEXT NOT NULL,
                        outcome TEXT NOT NULL DEFAULT 'OPEN',
                        pnl_pct REAL NOT NULL DEFAULT 0.0,
                        pnl_usd REAL NOT NULL DEFAULT 0.0,
                        pnl_r REAL NOT NULL DEFAULT 0.0,
                        max_profit_pct REAL NOT NULL DEFAULT 0.0,
                        max_drawdown_pct REAL NOT NULL DEFAULT 0.0,
                        unlock_risk TEXT NOT NULL DEFAULT 'UNKNOWN',
                        expires_at TEXT,
                        closed_at TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("sqlite_init_failed", error=str(exc))

    @property
    def configured(self) -> bool:
        return self._client is not None

    def _db(self) -> Client | SyncPostgrestClient:
        if not self._client:
            raise RuntimeError("Supabase is not configured")
        return self._client

    def _save_sqlite_trade(self, signal: GeneratedSignal) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            with sqlite3.connect(self._sqlite_path) as conn:
                conn.execute(
                    """
                    INSERT INTO trades (
                        signal_id, fingerprint, coin, symbol, timeframe, type,
                        entry, current_price, exit_price, sl, tp1, tp2,
                        risk_percentage, risk_reward_tp1, risk_reward_tp2,
                        confidence_score, confidence_level, confluence_reasons, warnings,
                        status, outcome, pnl_pct, pnl_usd, pnl_r,
                        max_profit_pct, max_drawdown_pct, unlock_risk,
                        expires_at, closed_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(signal_id) DO UPDATE SET
                        current_price = excluded.current_price,
                        exit_price = excluded.exit_price,
                        status = excluded.status,
                        outcome = excluded.outcome,
                        pnl_pct = excluded.pnl_pct,
                        pnl_usd = excluded.pnl_usd,
                        pnl_r = excluded.pnl_r,
                        max_profit_pct = MAX(trades.max_profit_pct, excluded.max_profit_pct),
                        max_drawdown_pct = MIN(trades.max_drawdown_pct, excluded.max_drawdown_pct),
                        closed_at = COALESCE(excluded.closed_at, trades.closed_at),
                        updated_at = excluded.updated_at
                    """,
                    (
                        signal.signal_id,
                        signal.fingerprint,
                        signal.coin,
                        signal.symbol,
                        signal.timeframe,
                        signal.type,
                        signal.entry,
                        signal.current_price,
                        signal.exit_price,
                        signal.sl,
                        signal.tp1,
                        signal.tp2,
                        signal.risk_percentage,
                        signal.risk_reward_tp1,
                        signal.risk_reward_tp2,
                        signal.confidence_score,
                        signal.confidence_level,
                        json.dumps(signal.confluence_reasons),
                        json.dumps(signal.warnings),
                        signal.status,
                        signal.outcome,
                        signal.pnl_pct,
                        signal.pnl_usd,
                        signal.pnl_r,
                        signal.max_profit_pct,
                        signal.max_drawdown_pct,
                        signal.unlock_risk,
                        signal.expires_at.isoformat() if signal.expires_at else None,
                        signal.closed_at.isoformat() if signal.closed_at else None,
                        signal.timestamp.isoformat(),
                        signal.updated_at.isoformat() if signal.updated_at else now_iso,
                    ),
                )
                conn.commit()
        except Exception as exc:  # noqa: BLE001
            logger.warning("sqlite_save_trade_failed", error=str(exc))

    def _encode_pnl_note(self, signal: GeneratedSignal) -> str:
        return json.dumps(
            {
                "current_price": signal.current_price,
                "exit_price": signal.exit_price,
                "pnl_pct": round(signal.pnl_pct, 4),
                "pnl_usd": round(signal.pnl_usd, 2),
                "pnl_r": round(signal.pnl_r, 3),
                "max_profit_pct": round(signal.max_profit_pct, 4),
                "max_drawdown_pct": round(signal.max_drawdown_pct, 4),
                "outcome": signal.outcome,
                "closed_at": signal.closed_at.isoformat() if signal.closed_at else None,
            }
        )

    def news_exists(self, news_id: str) -> bool:
        if not self.configured:
            return False
        try:
            result = self._db().table("news_articles").select("news_id").eq("news_id", news_id).limit(1).execute()
            return bool(result.data)
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_news_exists_failed", error=str(exc))
            return False

    def insert_article(self, article: NewsArticle) -> None:
        if not self.configured:
            return
        try:
            self._db().table("news_articles").upsert(
                {
                    "news_id": article.news_id,
                    "source": article.source,
                    "source_quality": article.source_quality,
                    "headline": article.headline,
                    "url": article.url,
                    "body": article.body,
                    "published_at": article.published_at.isoformat() if article.published_at else None,
                    "tickers": article.tickers,
                    "is_rejected": article.is_rejected,
                    "rejection_reason": article.rejection_reason,
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_insert_article_failed", error=str(exc))

    def insert_sentiment(self, card: NewsCard, provider: str) -> None:
        if not self.configured:
            return
        try:
            self._db().table("news_sentiments").upsert(
                {
                    "news_id": card.news_id,
                    "ticker": card.ticker,
                    "sentiment": card.sentiment,
                    "sentiment_score": card.sentiment_score,
                    "category": card.category,
                    "impact_level": card.impact_level,
                    "reason": card.reason,
                    "confidence": card.confidence,
                    "llm_provider": provider,
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_insert_sentiment_failed", error=str(exc))

    def insert_signal(self, signal: GeneratedSignal) -> None:
        self._save_sqlite_trade(signal)
        if not self.configured:
            return
        try:
            self._db().table("signals").upsert(
                {
                    "id": signal.signal_id,
                    "fingerprint": signal.fingerprint,
                    "coin": signal.coin,
                    "symbol": signal.symbol,
                    "timeframe": signal.timeframe,
                    "type": signal.type,
                    "setup_type": "momentum_confluence",
                    "entry": signal.entry,
                    "sl": signal.sl,
                    "tp1": signal.tp1,
                    "tp2": signal.tp2,
                    "risk_percentage": signal.risk_percentage,
                    "risk_reward_tp1": signal.risk_reward_tp1,
                    "risk_reward_tp2": signal.risk_reward_tp2,
                    "confidence_score": signal.confidence_score,
                    "confidence_level": signal.confidence_level,
                    "confluence_reasons": signal.confluence_reasons,
                    "warnings": signal.warnings,
                    "status": signal.status,
                    "unlock_risk": signal.unlock_risk,
                    "expires_at": signal.expires_at.isoformat() if signal.expires_at else None,
                    "created_at": signal.timestamp.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).execute()
            self._db().table("signal_events").insert(
                {
                    "signal_id": signal.signal_id,
                    "status": signal.status,
                    "price": signal.current_price or signal.entry,
                    "note": self._encode_pnl_note(signal),
                }
            ).execute()
            self._remote_pnl_cache[signal.signal_id] = (signal.status, round(signal.pnl_pct, 2))
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_insert_signal_failed", error=str(exc))

    def upsert_trades_batch(self, signals: list[GeneratedSignal], sync_remote: bool = True) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        for sig in signals:
            self._save_sqlite_trade(sig)
            if not sync_remote or not self.configured:
                continue
            prev = self._remote_pnl_cache.get(sig.signal_id)
            status_changed = prev is None or prev[0] != sig.status
            pnl_delta = 999.0 if prev is None else abs(sig.pnl_pct - prev[1])
            # Sync to remote Supabase when status changes or PnL moves by >= 0.05%
            if status_changed or pnl_delta >= 0.05:
                try:
                    self._db().table("signals").update(
                        {"status": sig.status, "updated_at": now_iso}
                    ).eq("id", sig.signal_id).execute()
                    note_json = self._encode_pnl_note(sig)
                    updated_ev = (
                        self._db()
                        .table("signal_events")
                        .update({"status": sig.status, "price": sig.current_price or sig.entry, "note": note_json})
                        .eq("signal_id", sig.signal_id)
                        .execute()
                    )
                    if not updated_ev.data:
                        self._db().table("signal_events").insert(
                            {
                                "signal_id": sig.signal_id,
                                "status": sig.status,
                                "price": sig.current_price or sig.entry,
                                "note": note_json,
                            }
                        ).execute()
                    self._remote_pnl_cache[sig.signal_id] = (sig.status, round(sig.pnl_pct, 2))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("supabase_sync_trade_pnl_failed", signal_id=sig.signal_id, error=str(exc))

    def update_signal_status(self, signal_id: str, status: str, price: float | None, note: str) -> None:
        if not self.configured:
            return
        try:
            self._db().table("signals").update(
                {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", signal_id).execute()
            self._db().table("signal_events").insert(
                {"signal_id": signal_id, "status": status, "price": price, "note": note}
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_update_signal_status_failed", error=str(exc))

    def load_signals(self, limit: int = 120) -> list[GeneratedSignal]:
        by_id: dict[str, GeneratedSignal] = {}

        # 1. Load from local SQLite database first (has rich PnL history)
        try:
            with sqlite3.connect(self._sqlite_path) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM trades ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
                for r in rows:
                    sym = str(r["symbol"]).upper()
                    if sym.replace("USDT", "") in STABLE_BASES:
                        continue
                    try:
                        sig = GeneratedSignal(
                            signal_id=str(r["signal_id"]),
                            fingerprint=str(r["fingerprint"]),
                            coin=str(r["coin"]),
                            symbol=sym,
                            timeframe=str(r["timeframe"]),
                            type=str(r["type"]),  # type: ignore[arg-type]
                            entry=float(r["entry"]),
                            current_price=float(r["current_price"]) if r["current_price"] is not None else None,
                            exit_price=float(r["exit_price"]) if r["exit_price"] is not None else None,
                            sl=float(r["sl"]),
                            tp1=float(r["tp1"]),
                            tp2=float(r["tp2"]),
                            risk_percentage=float(r["risk_percentage"]),
                            risk_reward_tp1=float(r["risk_reward_tp1"]),
                            risk_reward_tp2=float(r["risk_reward_tp2"]),
                            confidence_score=int(r["confidence_score"]),
                            confidence_level=str(r["confidence_level"]),  # type: ignore[arg-type]
                            confluence_reasons=json.loads(r["confluence_reasons"] or "[]"),
                            warnings=json.loads(r["warnings"] or "[]"),
                            timestamp=datetime.fromisoformat(r["created_at"]),
                            status=str(r["status"]),  # type: ignore[arg-type]
                            outcome=str(r["outcome"] or "OPEN"),  # type: ignore[arg-type]
                            pnl_pct=float(r["pnl_pct"] or 0.0),
                            pnl_usd=float(r["pnl_usd"] or 0.0),
                            pnl_r=float(r["pnl_r"] or 0.0),
                            max_profit_pct=float(r["max_profit_pct"] or 0.0),
                            max_drawdown_pct=float(r["max_drawdown_pct"] or 0.0),
                            unlock_risk=str(r["unlock_risk"] or "UNKNOWN"),  # type: ignore[arg-type]
                            expires_at=datetime.fromisoformat(r["expires_at"]) if r["expires_at"] else None,
                            closed_at=datetime.fromisoformat(r["closed_at"]) if r["closed_at"] else None,
                            updated_at=datetime.fromisoformat(r["updated_at"]) if r["updated_at"] else None,
                        )
                        by_id[sig.signal_id] = sig
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("sqlite_parse_trade_failed", error=str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.warning("sqlite_load_trades_failed", error=str(exc))

        # 2. Load from Supabase PostgreSQL and merge
        if self.configured:
            try:
                res = (
                    self._db()
                    .table("signals")
                    .select("*")
                    .order("created_at", desc=True)
                    .limit(limit)
                    .execute()
                )
                ev_res = (
                    self._db()
                    .table("signal_events")
                    .select("signal_id,status,price,note,created_at")
                    .order("created_at", desc=True)
                    .limit(limit * 2)
                    .execute()
                )
                latest_events: dict[str, dict[str, Any]] = {}
                for ev in ev_res.data or []:
                    sid = str(ev.get("signal_id") or "")
                    if sid and sid not in latest_events:
                        latest_events[sid] = ev

                for row in res.data or []:
                    sid = str(row["id"])
                    sym = str(row["symbol"]).upper()
                    if sym.replace("USDT", "") in STABLE_BASES:
                        continue
                    ev = latest_events.get(sid, {})
                    pnl_meta: dict[str, Any] = {}
                    raw_note = ev.get("note")
                    if isinstance(raw_note, str) and raw_note.startswith("{"):
                        try:
                            pnl_meta = json.loads(raw_note)
                        except Exception:  # noqa: BLE001
                            pnl_meta = {}

                    existing = by_id.get(sid)
                    cur_price = (
                        pnl_meta.get("current_price")
                        or (float(ev["price"]) if ev.get("price") is not None else None)
                        or (existing.current_price if existing else None)
                    )
                    sig = GeneratedSignal(
                        signal_id=sid,
                        fingerprint=str(row["fingerprint"]),
                        coin=str(row["coin"]),
                        symbol=sym,
                        timeframe=str(row["timeframe"]),
                        type=str(row["type"]),  # type: ignore[arg-type]
                        entry=float(row["entry"]),
                        current_price=float(cur_price) if cur_price is not None else float(row["entry"]),
                        exit_price=float(pnl_meta["exit_price"])
                        if pnl_meta.get("exit_price") is not None
                        else (existing.exit_price if existing else None),
                        sl=float(row["sl"]),
                        tp1=float(row["tp1"]),
                        tp2=float(row["tp2"]),
                        risk_percentage=float(row["risk_percentage"]),
                        risk_reward_tp1=float(row["risk_reward_tp1"]),
                        risk_reward_tp2=float(row["risk_reward_tp2"]),
                        confidence_score=int(row["confidence_score"]),
                        confidence_level=str(row["confidence_level"]),  # type: ignore[arg-type]
                        confluence_reasons=list(row.get("confluence_reasons") or []),
                        warnings=list(row.get("warnings") or []),
                        timestamp=datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00")),
                        status=str(row.get("status") or "ACTIVE"),  # type: ignore[arg-type]
                        outcome=str(
                            pnl_meta.get("outcome")
                            or (existing.outcome if existing else "OPEN")
                        ),  # type: ignore[arg-type]
                        pnl_pct=float(
                            pnl_meta.get("pnl_pct")
                            if pnl_meta.get("pnl_pct") is not None
                            else (existing.pnl_pct if existing else 0.0)
                        ),
                        pnl_usd=float(
                            pnl_meta.get("pnl_usd")
                            if pnl_meta.get("pnl_usd") is not None
                            else (existing.pnl_usd if existing else 0.0)
                        ),
                        pnl_r=float(
                            pnl_meta.get("pnl_r")
                            if pnl_meta.get("pnl_r") is not None
                            else (existing.pnl_r if existing else 0.0)
                        ),
                        max_profit_pct=max(
                            float(pnl_meta.get("max_profit_pct") or 0.0),
                            existing.max_profit_pct if existing else 0.0,
                        ),
                        max_drawdown_pct=min(
                            float(pnl_meta.get("max_drawdown_pct") or 0.0),
                            existing.max_drawdown_pct if existing else 0.0,
                        ),
                        unlock_risk=str(row.get("unlock_risk") or "UNKNOWN"),  # type: ignore[arg-type]
                        expires_at=datetime.fromisoformat(str(row["expires_at"]).replace("Z", "+00:00"))
                        if row.get("expires_at")
                        else None,
                        closed_at=datetime.fromisoformat(str(pnl_meta["closed_at"]).replace("Z", "+00:00"))
                        if pnl_meta.get("closed_at")
                        else (existing.closed_at if existing else None),
                        updated_at=datetime.fromisoformat(str(row["updated_at"]).replace("Z", "+00:00"))
                        if row.get("updated_at")
                        else None,
                    )
                    by_id[sid] = sig
                    self._save_sqlite_trade(sig)
            except Exception as exc:  # noqa: BLE001
                logger.warning("supabase_load_signals_failed", error=str(exc))

        result = sorted(by_id.values(), key=lambda s: s.timestamp, reverse=True)
        return result[:limit]

    def recent_fingerprints(self, minutes: int) -> set[str]:
        if not self.configured:
            return set()
        try:
            result = (
                self._db()
                .table("signals")
                .select("fingerprint, created_at")
                .gte("created_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
                .execute()
            )
            _ = minutes
            rows = result.data or []
            return {row["fingerprint"] for row in rows if row.get("fingerprint")}
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_recent_fingerprints_failed", error=str(exc))
            return set()

    def insert_market_snapshot(self, row: MarketRow) -> None:
        if not self.configured:
            return
        try:
            self._db().table("market_snapshots").insert(
                {
                    "symbol": row.symbol,
                    "last_price": row.last_price,
                    "price_change_15m": row.price_change_15m,
                    "price_change_1h": row.price_change_1h,
                    "price_change_24h": row.price_change_24h,
                    "high_24h": row.high_24h,
                    "low_24h": row.low_24h,
                    "volume_24h": row.volume_24h,
                    "quote_volume_24h": row.quote_volume_24h,
                    "volume_ratio": row.volume_ratio,
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_insert_market_snapshot_failed", error=str(exc))

    def insert_technical_snapshot(self, snap: TechnicalSnapshot) -> None:
        if not self.configured:
            return
        try:
            payload: dict[str, Any] = snap.model_dump(mode="json")
            self._db().table("technical_snapshots").insert(
                {
                    "symbol": snap.symbol,
                    "timeframe": snap.timeframe,
                    "rsi": snap.rsi.rsi,
                    "rsi_state": snap.rsi.rsi_state,
                    "supertrend_trend": snap.supertrend.trend,
                    "supertrend_value": snap.supertrend.value,
                    "ewo": snap.ewo.ewo,
                    "ewo_state": snap.ewo.state,
                    "swing_high": snap.swings.recent_swing_high,
                    "swing_low": snap.swings.recent_swing_low,
                    "payload": payload,
                }
            ).execute()
        except Exception as exc:  # noqa: BLE001
            logger.warning("supabase_insert_technical_snapshot_failed", error=str(exc))
