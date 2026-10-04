from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings
from app.schemas.market import GeneratedSignal
from app.utils.logging import get_logger

logger = get_logger("notifications")


class NotificationProvider(Protocol):
    name: str

    async def send(self, title: str, body: str, payload: dict) -> None: ...


class LogNotificationProvider:
    name = "log"

    async def send(self, title: str, body: str, payload: dict) -> None:
        logger.info("notification", title=title, body=body, payload=payload)


class NotificationService:
    """Delivers signal & trade Profit/Loss (PnL) alerts to Log, Discord Webhook, and Telegram Bot channels."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._providers: list[NotificationProvider] = [LogNotificationProvider()]

    def register(self, provider: NotificationProvider) -> None:
        self._providers.append(provider)

    def get_signal_webhook(self) -> str:
        return self.settings.discord_webhook_url.strip() or self.settings.discord_pnl_webhook_url.strip()

    def get_pnl_webhook(self) -> str:
        return self.settings.discord_pnl_webhook_url.strip() or self.settings.discord_webhook_url.strip()

    @staticmethod
    def _validate_discord_webhook(url: str) -> str:
        clean = url.strip()
        valid_prefixes = (
            "https://discord.com/api/webhooks/",
            "https://discordapp.com/api/webhooks/",
            "https://ptb.discord.com/api/webhooks/",
            "https://canary.discord.com/api/webhooks/",
        )
        if not clean.startswith(valid_prefixes):
            raise ValueError(
                "Invalid Discord Webhook URL. It must start with https://discord.com/api/webhooks/..."
            )
        return clean

    async def signal_created(self, signal: GeneratedSignal) -> None:
        title = f"{signal.type} {signal.coin} ({signal.timeframe})"
        body = (
            f"Entry: ${signal.entry:.4f} | SL: ${signal.sl:.4f} | "
            f"TP1: ${signal.tp1:.4f} ({signal.risk_reward_tp1}R) | "
            f"TP2: ${signal.tp2:.4f} ({signal.risk_reward_tp2}R) | "
            f"Confidence: {signal.confidence_score}/100 ({signal.confidence_level})"
        )
        payload = signal.model_dump(mode="json")
        tasks = [provider.send(title, body, payload) for provider in self._providers]

        webhook_url = self.get_signal_webhook()
        if (self.settings.notify_discord or self.settings.notify_discord_pnl) and webhook_url:
            tasks.append(self._send_discord_signal(webhook_url, signal))

        if (
            self.settings.notify_telegram
            and self.settings.telegram_bot_token.strip()
            and self.settings.telegram_chat_id.strip()
        ):
            tasks.append(
                self._send_telegram_signal(
                    self.settings.telegram_bot_token.strip(),
                    self.settings.telegram_chat_id.strip(),
                    signal,
                )
            )

        await asyncio.gather(*tasks, return_exceptions=True)

    async def trade_pnl_alert(
        self,
        signal: GeneratedSignal,
        event_type: str,
        summary: dict[str, Any] | None = None,
    ) -> None:
        """Sends a real-time Trade Profit / Loss alert to Discord & Telegram when TP/SL or PnL thresholds hit."""
        is_profit = signal.pnl_pct >= 0
        outcome_label = "PROFIT" if is_profit else "LOSS"
        title = f"{outcome_label} ALERT ({event_type}) — {signal.coin} {signal.type} ({signal.pnl_pct:+.2f}%)"
        body = (
            f"{signal.coin} ({signal.type} {signal.timeframe}) | Status: {signal.status} | "
            f"PnL: {signal.pnl_pct:+.2f}% (${signal.pnl_usd:+.2f} / {signal.pnl_r:+.2f}R) | "
            f"Entry: ${signal.entry:.4f} -> Price: ${(signal.exit_price or signal.current_price or signal.entry):.4f}"
        )
        payload = {
            "event_type": event_type,
            "outcome": outcome_label,
            "signal": signal.model_dump(mode="json"),
        }
        tasks = [provider.send(title, body, payload) for provider in self._providers]

        pnl_webhook = self.get_pnl_webhook()
        if self.settings.notify_discord_pnl and pnl_webhook:
            tasks.append(self._send_discord_pnl_embed(pnl_webhook, signal, event_type, summary))

        if (
            self.settings.notify_telegram
            and self.settings.telegram_bot_token.strip()
            and self.settings.telegram_chat_id.strip()
        ):
            tasks.append(
                self._send_telegram_pnl(
                    self.settings.telegram_bot_token.strip(),
                    self.settings.telegram_chat_id.strip(),
                    signal,
                    event_type,
                )
            )

        await asyncio.gather(*tasks, return_exceptions=True)

    async def _send_discord_pnl_embed(
        self,
        webhook_url: str,
        signal: GeneratedSignal,
        event_type: str,
        summary: dict[str, Any] | None = None,
    ) -> None:
        is_profit = signal.pnl_pct >= 0
        color = 0x10B981 if is_profit else 0xF43F5E

        if event_type == "TP2_HIT":
            badge = "🚀 TAKE PROFIT 2 HIT (PROFIT)"
        elif event_type == "TP1_HIT":
            badge = "💰 TAKE PROFIT 1 HIT (PROFIT)"
        elif event_type == "STOPPED_OUT":
            badge = "🛑 STOP LOSS HIT (LOSS)"
        elif is_profit:
            badge = "📈 LIVE TRADE PROFIT ALERT"
        else:
            badge = "⚠️ LIVE TRADE LOSS ALERT"

        ref_price = signal.exit_price or signal.current_price or signal.entry
        pnl_sign_usd = f"+${signal.pnl_usd:.2f}" if signal.pnl_usd >= 0 else f"-${abs(signal.pnl_usd):.2f}"
        fields = [
            {
                "name": "Trade Outcome",
                "value": f"**{'🟢 PROFIT' if is_profit else '🔴 LOSS'}** (`{signal.status}`)",
                "inline": True,
            },
            {
                "name": "Profit / Loss (%)",
                "value": f"**`{signal.pnl_pct:+.2f}%`** (`{signal.pnl_r:+.2f}R`)",
                "inline": True,
            },
            {
                "name": "Profit / Loss ($1k Size)",
                "value": f"**`{pnl_sign_usd}`**",
                "inline": True,
            },
            {
                "name": "Entry → Mark/Exit",
                "value": f"`${signal.entry}` → **`${ref_price}`**",
                "inline": True,
            },
            {
                "name": "Targets & Stop Loss",
                "value": f"TP1: `${signal.tp1}` | TP2: `${signal.tp2}` | SL: `${signal.sl}`",
                "inline": True,
            },
            {
                "name": "Excursion (Peak / DD)",
                "value": f"Peak: `{signal.max_profit_pct:+.2f}%` | DD: `{signal.max_drawdown_pct:+.2f}%`",
                "inline": True,
            },
        ]

        if summary and summary.get("total_trades", 0) > 0:
            net_usd = float(summary.get("total_pnl_usd", 0.0))
            prof_usd = float(summary.get("total_profit_usd", 0.0))
            loss_usd = float(summary.get("total_loss_usd", 0.0))
            fields.append(
                {
                    "name": "📊 Portfolio Database Ledger (All Signals)",
                    "value": (
                        f"**Win Rate:** `{summary.get('win_rate', 0)}%` "
                        f"(`{summary.get('winning_trades', 0)}W` / `{summary.get('losing_trades', 0)}L`) • "
                        f"**Gross Profit:** `+${prof_usd:.2f}` • "
                        f"**Gross Loss:** `-${abs(loss_usd):.2f}` • "
                        f"**Net PnL:** `{summary.get('total_pnl_pct', 0):+.2f}%` (`{'+$' if net_usd >= 0 else '-$'}{abs(net_usd):.2f}`)"
                    ),
                    "inline": False,
                }
            )

        embed = {
            "title": f"{badge} — {signal.coin} ({signal.type} • {signal.timeframe})",
            "description": (
                f"Real-time trade performance update recorded to **Supabase & SQLite Trade Ledger**.\n"
                f"**Confluence Confidence:** `{signal.confidence_score}/100` (**{signal.confidence_level}**)"
            ),
            "color": color,
            "fields": fields,
            "footer": {"text": "CryptoConfluence AI • Live Profit & Loss Alert Engine"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    webhook_url,
                    json={
                        "username": "CryptoConfluence AI • PnL Tracker",
                        "embeds": [embed],
                    },
                )
                resp.raise_for_status()
                logger.info("discord_pnl_alert_sent", symbol=signal.symbol, event_type=event_type, pnl_pct=signal.pnl_pct)
        except Exception as exc:  # noqa: BLE001
            logger.warning("discord_pnl_alert_failed", error=str(exc))

    async def _send_telegram_pnl(
        self,
        bot_token: str,
        chat_id: str,
        signal: GeneratedSignal,
        event_type: str,
    ) -> None:
        is_profit = signal.pnl_pct >= 0
        icon = "🟢💰 PROFIT" if is_profit else "🔴🛑 LOSS"
        ref_price = signal.exit_price or signal.current_price or signal.entry
        pnl_sign_usd = f"+${signal.pnl_usd:.2f}" if signal.pnl_usd >= 0 else f"-${abs(signal.pnl_usd):.2f}"
        text = (
            f"*{icon} ({event_type}) — {signal.coin} ({signal.type} {signal.timeframe})*\n\n"
            f"📊 *PnL:* `{signal.pnl_pct:+.2f}%` (`{pnl_sign_usd}` | `{signal.pnl_r:+.2f}R`)\n"
            f"🎯 *Entry:* `${signal.entry}` → *Current/Exit:* `${ref_price}`\n"
            f"✅ *TP1:* `${signal.tp1}` | 🚀 *TP2:* `${signal.tp2}` | 🛡 *SL:* `${signal.sl}`\n"
            f"📌 *Status:* `{signal.status}`"
        )
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    url,
                    json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
                )
                resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.warning("telegram_pnl_failed", error=str(exc))

    async def _send_discord_signal(self, webhook_url: str, signal: GeneratedSignal) -> None:
        color = 0x10B981 if signal.type == "LONG" else 0xF43F5E
        direction_emoji = "🟢 LONG" if signal.type == "LONG" else "🔴 SHORT"
        reasons_text = "\n".join(f"• {r}" for r in signal.confluence_reasons[:6]) or "• Multi-factor alignment"
        embed = {
            "title": f"{direction_emoji} SIGNAL — {signal.coin} ({signal.timeframe})",
            "description": f"**Confluence Score:** `{signal.confidence_score}/100` (**{signal.confidence_level}**)",
            "color": color,
            "fields": [
                {"name": "Entry Price", "value": f"`${signal.entry}`", "inline": True},
                {"name": "Stop Loss (SL)", "value": f"`${signal.sl}` (`-{signal.risk_percentage:.2f}%`)", "inline": True},
                {"name": "Unlock Risk", "value": f"`{signal.unlock_risk}`", "inline": True},
                {"name": "Target 1 (TP1)", "value": f"`${signal.tp1}` (`{signal.risk_reward_tp1}R`)", "inline": True},
                {"name": "Target 2 (TP2)", "value": f"`${signal.tp2}` (`{signal.risk_reward_tp2}R`)", "inline": True},
                {"name": "Confluence Factors", "value": reasons_text, "inline": False},
            ],
            "footer": {"text": "CryptoConfluence AI • Quantitative Trading Terminal (Not Financial Advice)"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    webhook_url,
                    json={
                        "username": "CryptoConfluence AI",
                        "embeds": [embed],
                    },
                )
                resp.raise_for_status()
                logger.info("discord_signal_sent", symbol=signal.symbol)
        except Exception as exc:  # noqa: BLE001
            logger.warning("discord_signal_failed", error=str(exc))

    async def _send_telegram_signal(self, bot_token: str, chat_id: str, signal: GeneratedSignal) -> None:
        direction_emoji = "🟢 LONG" if signal.type == "LONG" else "🔴 SHORT"
        reasons_text = "\n".join(f"• {r}" for r in signal.confluence_reasons[:5])
        text = (
            f"*{direction_emoji} — {signal.coin} ({signal.timeframe})*\n"
            f"Confidence: `{signal.confidence_score}/100 ({signal.confidence_level})`\n\n"
            f"🎯 *Entry:* `${signal.entry}`\n"
            f"🛡 *Stop Loss:* `${signal.sl}` (`-{signal.risk_percentage:.2f}%`)\n"
            f"✅ *TP1:* `${signal.tp1}` (`{signal.risk_reward_tp1}R`)\n"
            f"🚀 *TP2:* `${signal.tp2}` (`{signal.risk_reward_tp2}R`)\n\n"
            f"*Confluence:*\n{reasons_text}"
        )
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    url,
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": "Markdown",
                    },
                )
                resp.raise_for_status()
                logger.info("telegram_signal_sent", symbol=signal.symbol)
        except Exception as exc:  # noqa: BLE001
            logger.warning("telegram_signal_failed", error=str(exc))

    async def send_test_discord(self, webhook_url: str) -> dict[str, Any]:
        clean = self._validate_discord_webhook(webhook_url)
        embed = {
            "title": "🔔 CryptoConfluence AI — Discord Signal Webhook Connected!",
            "description": (
                "Your Discord channel is now linked to the **CryptoConfluence AI Trading Terminal**.\n\n"
                "High-confluence `LONG` and `SHORT` setups passing CoinMarketCap Pro, volume, Supertrend, EWO, RSI, and news sentiment filters will be delivered here in real time."
            ),
            "color": 0x4F46E5,
            "fields": [
                {"name": "Risk Engine", "value": "`Active (SL & R:R Enforced)`", "inline": True},
                {"name": "Profit/Loss Alerts", "value": "`Enabled (TP1, TP2, SL & Live PnL)`", "inline": True},
                {"name": "Data Stream", "value": "`Binance + CoinMarketCap Pro`", "inline": True},
            ],
            "footer": {"text": "CryptoConfluence AI • Test Notification"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                clean,
                json={
                    "username": "CryptoConfluence AI",
                    "embeds": [embed],
                },
            )
            if resp.status_code >= 400:
                raise ValueError(f"Discord returned HTTP {resp.status_code}: {resp.text[:160]}")
        return {"ok": True, "message": "Test signal alert successfully delivered to your Discord channel!"}

    async def send_test_discord_pnl(
        self,
        webhook_url: str,
        summary: dict[str, Any] | None = None,
        sample_signal: GeneratedSignal | None = None,
    ) -> dict[str, Any]:
        clean = self._validate_discord_webhook(webhook_url)

        net_pct = float((summary or {}).get("total_pnl_pct", 8.36))
        net_usd = float((summary or {}).get("total_pnl_usd", 83.60))
        prof_pct = float((summary or {}).get("total_profit_pct", 9.65))
        prof_usd = float((summary or {}).get("total_profit_usd", 96.50))
        loss_pct = float((summary or {}).get("total_loss_pct", -1.29))
        loss_usd = float((summary or {}).get("total_loss_usd", -12.90))
        win_rate = float((summary or {}).get("win_rate", 91.7))
        wins = int((summary or {}).get("winning_trades", 11))
        losses = int((summary or {}).get("losing_trades", 1))
        total_trades = int((summary or {}).get("total_trades", 36))

        if sample_signal:
            coin_label = f"{sample_signal.coin} ({sample_signal.type} • {sample_signal.timeframe})"
            sample_pnl_pct = sample_signal.pnl_pct
            sample_pnl_usd = sample_signal.pnl_usd
            sample_entry = sample_signal.entry
            sample_curr = sample_signal.exit_price or sample_signal.current_price or sample_signal.entry
            sample_tp1 = sample_signal.tp1
            sample_sl = sample_signal.sl
        else:
            coin_label = "SUI/USDT (LONG • 15m)"
            sample_pnl_pct = 1.45
            sample_pnl_usd = 14.50
            sample_entry = 0.9234
            sample_curr = 0.9368
            sample_tp1 = 0.9535
            sample_sl = 0.9033

        is_profit = sample_pnl_pct >= 0
        embeds = [
            {
                "title": f"💰 LIVE PROFIT / LOSS ALERT CONNECTED — {coin_label}",
                "description": (
                    "Your Discord **Trade Profit & Loss (PnL) Webhook** is active!\n"
                    "Whenever a trade hits **Take Profit (TP1/TP2)**, **Stop Loss (SL)**, or crosses your **Profit/Loss % threshold**, an instant PnL card like this is dispatched."
                ),
                "color": 0x10B981 if is_profit else 0xF43F5E,
                "fields": [
                    {
                        "name": "Sample Trade Outcome",
                        "value": f"**{'🟢 PROFIT' if is_profit else '🔴 LOSS'}** (`{sample_pnl_pct:+.2f}%` / `{sample_pnl_usd:+.2f} USD`)",
                        "inline": True,
                    },
                    {
                        "name": "Entry → Mark Price",
                        "value": f"`${sample_entry}` → **`${sample_curr}`**",
                        "inline": True,
                    },
                    {
                        "name": "Targets & Stop",
                        "value": f"TP1: `${sample_tp1}` | SL: `${sample_sl}`",
                        "inline": True,
                    },
                    {
                        "name": f"📊 Database Ledger Summary ({total_trades} Tracked Trades)",
                        "value": (
                            f"• **Win Rate:** `{win_rate:.1f}%` (`{wins}` Profit / `{losses}` Loss)\n"
                            f"• **Total Gross Profit:** `+{prof_pct:.2f}%` (`+${prof_usd:.2f}`)\n"
                            f"• **Total Gross Loss:** `{loss_pct:.2f}%` (`-${abs(loss_usd):.2f}`)\n"
                            f"• **Net Cumulative PnL:** **`{net_pct:+.2f}%`** (**`{'+$' if net_usd >= 0 else '-$'}{abs(net_usd):.2f}`**)"
                        ),
                        "inline": False,
                    },
                ],
                "footer": {"text": "CryptoConfluence AI • Profit & Loss Discord Webhook Test"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ]

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                clean,
                json={
                    "username": "CryptoConfluence AI • PnL Tracker",
                    "embeds": embeds,
                },
            )
            if resp.status_code >= 400:
                raise ValueError(f"Discord returned HTTP {resp.status_code}: {resp.text[:160]}")
        return {
            "ok": True,
            "message": "Profit & Loss test alert + live portfolio summary delivered to your Discord channel!",
        }

    async def send_portfolio_pnl_report(
        self,
        webhook_url: str,
        summary: dict[str, Any],
        signals: list[GeneratedSignal],
    ) -> dict[str, Any]:
        clean = self._validate_discord_webhook(webhook_url)

        net_pct = float(summary.get("total_pnl_pct", 0.0))
        net_usd = float(summary.get("total_pnl_usd", 0.0))
        prof_pct = float(summary.get("total_profit_pct", 0.0))
        prof_usd = float(summary.get("total_profit_usd", 0.0))
        loss_pct = float(summary.get("total_loss_pct", 0.0))
        loss_usd = float(summary.get("total_loss_usd", 0.0))
        win_rate = float(summary.get("win_rate", 0.0))
        wins = int(summary.get("winning_trades", 0))
        losses = int(summary.get("losing_trades", 0))
        total_trades = int(summary.get("total_trades", 0))

        winners = sorted([s for s in signals if s.pnl_pct > 0.01], key=lambda x: x.pnl_pct, reverse=True)[:5]
        losers = sorted([s for s in signals if s.pnl_pct < -0.01], key=lambda x: x.pnl_pct)[:5]

        winners_text = (
            "\n".join(
                f"🟢 **{s.coin}** ({s.type}) • **`{s.pnl_pct:+.2f}%`** (`+${s.pnl_usd:.2f}` | `{s.pnl_r:+.2f}R`) — Entry `${s.entry}` → `${s.exit_price or s.current_price or s.entry}`"
                for s in winners
            )
            or "• No open profitable trades yet"
        )
        losers_text = (
            "\n".join(
                f"🔴 **{s.coin}** ({s.type}) • **`{s.pnl_pct:+.2f}%`** (`-${abs(s.pnl_usd):.2f}` | `{s.pnl_r:+.2f}R`) — Entry `${s.entry}` → `${s.exit_price or s.current_price or s.entry}`"
                for s in losers
            )
            or "• No losing trades currently recorded"
        )

        embed = {
            "title": f"📊 LIVE PORTFOLIO PROFIT & LOSS REPORT ({total_trades} Trades)",
            "description": (
                f"Full database PnL ledger snapshot from **CryptoConfluence AI** (calculated on `$1,000` standard position size)."
            ),
            "color": 0x10B981 if net_pct >= 0 else 0xF43F5E,
            "fields": [
                {
                    "name": "Net Cumulative PnL",
                    "value": f"**`{net_pct:+.2f}%`** (`{'+$' if net_usd >= 0 else '-$'}{abs(net_usd):.2f}`)",
                    "inline": True,
                },
                {
                    "name": "Win Rate & Outcomes",
                    "value": f"**`{win_rate:.1f}%`** (`{wins} Profit` / `{losses} Loss`)",
                    "inline": True,
                },
                {
                    "name": "Gross Profit vs Loss",
                    "value": f"🟢 `+{prof_pct:.2f}%` (`+${prof_usd:.2f}`) | 🔴 `{loss_pct:.2f}%` (`-${abs(loss_usd):.2f}`)",
                    "inline": True,
                },
                {
                    "name": "🟢 Top Profitable Trades",
                    "value": winners_text,
                    "inline": False,
                },
                {
                    "name": "🔴 Top Losing / Drawdown Trades",
                    "value": losers_text,
                    "inline": False,
                },
            ],
            "footer": {"text": "CryptoConfluence AI • Database Trade Profit/Loss Ledger"},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                clean,
                json={
                    "username": "CryptoConfluence AI • PnL Tracker",
                    "embeds": [embed],
                },
            )
            if resp.status_code >= 400:
                raise ValueError(f"Discord returned HTTP {resp.status_code}: {resp.text[:160]}")
        return {
            "ok": True,
            "message": f"Live Profit & Loss Report ({wins} Profit, {losses} Loss, Net {net_pct:+.2f}%) sent to Discord!",
        }

    async def send_test_telegram(self, bot_token: str, chat_id: str) -> dict[str, Any]:
        token = bot_token.strip()
        chat = chat_id.strip()
        if not token or not chat:
            raise ValueError("Both Telegram Bot Token and Chat ID are required.")
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        text = (
            "🔔 *CryptoConfluence AI — Telegram Alert Connected!*\n\n"
            "Your Telegram channel/chat is now linked to the quantitative signal & Profit/Loss engine.\n"
            "• *Stream:* Binance Spot USDT + CoinMarketCap Pro\n"
            "• *Alerts:* New Signals + Take Profit / Stop Loss PnL Updates"
        )
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                url,
                json={"chat_id": chat, "text": text, "parse_mode": "Markdown"},
            )
            if resp.status_code >= 400:
                raise ValueError(f"Telegram API returned HTTP {resp.status_code}: {resp.text[:160]}")
        return {"ok": True, "message": "Test alert successfully delivered to your Telegram chat!"}
