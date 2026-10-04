"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import type { OverviewResponse, HealthResponse, WsStatus } from "@/types";
import { apiGet, apiPost } from "@/lib/api";
import { LOGO_DATA_URI } from "@/lib/logo";
import {
  Sliders,
  Shield,
  Bell,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Save,
  SlidersHorizontal,
  Send,
  RotateCcw,
  RefreshCw,
  Sparkles,
  MessageSquare,
  Globe,
} from "lucide-react";

const DEFAULT_WEIGHTS = {
  news: 25,
  momentum: 20,
  volume: 15,
  supertrend: 15,
  ewo: 10,
  rsi: 5,
  sr: 10,
};

export default function SettingsPage() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Risk & Timeframe Settings
  const [defaultTimeframe, setDefaultTimeframe] = useState("15m");
  const [aggressiveMode, setAggressiveMode] = useState(false);
  const [minStopPct, setMinStopPct] = useState(1.5);
  const [maxStopPct, setMaxStopPct] = useState(3.5);
  const [minTp1R, setMinTp1R] = useState(1.5);
  const [minTp2R, setMinTp2R] = useState(2.5);

  // Notification Channels & Credentials
  const [notifyBrowser, setNotifyBrowser] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<string>("default");

  const [notifyDiscord, setNotifyDiscord] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Dedicated Discord Trade Profit & Loss (PnL) Webhook & Alert Rules
  const [notifyDiscordPnl, setNotifyDiscordPnl] = useState(true);
  const [discordPnlWebhookUrl, setDiscordPnlWebhookUrl] = useState("");
  const [pnlAlertOnTp, setPnlAlertOnTp] = useState(true);
  const [pnlAlertOnSl, setPnlAlertOnSl] = useState(true);
  const [pnlAlertOnMilestone, setPnlAlertOnMilestone] = useState(true);
  const [pnlProfitThresholdPct, setPnlProfitThresholdPct] = useState(1.0);
  const [pnlLossThresholdPct, setPnlLossThresholdPct] = useState(1.0);
  const [testingDiscordPnl, setTestingDiscordPnl] = useState(false);
  const [sendingPnlReport, setSendingPnlReport] = useState(false);
  const [discordPnlStatus, setDiscordPnlStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [notifyTelegram, setNotifyTelegram] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [browserStatus, setBrowserStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // Scan state
  const [scanningSignals, setScanningSignals] = useState(false);
  const [scanResultText, setScanResultText] = useState<string | null>(null);

  // Confluence Weights (sum to 100%)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }

    // 1. Load local storage cache first for instant paint
    try {
      const stored = localStorage.getItem("cryptoconfluence_settings");
      if (stored) {
        applySettingsObject(JSON.parse(stored));
      }
    } catch {
      // ignore localstorage errors
    }

    // 2. Load authoritative runtime settings from backend
    apiGet<any>("/api/settings")
      .then((serverSettings) => {
        applySettingsObject(serverSettings);
        try {
          localStorage.setItem(
            "cryptoconfluence_settings",
            JSON.stringify(serverSettings)
          );
        } catch {
          // ignore
        }
      })
      .catch((err) => console.warn("Could not load backend settings:", err));

    apiGet<OverviewResponse>("/api/market/overview")
      .then(setOverview)
      .catch((err) => console.warn(err));

    apiGet<HealthResponse>("/api/health")
      .then(setHealth)
      .catch((err) => console.warn(err));
  }, []);

  function applySettingsObject(parsed: any) {
    if (!parsed || typeof parsed !== "object") return;
    if (parsed.defaultTimeframe) setDefaultTimeframe(parsed.defaultTimeframe);
    if (parsed.aggressiveMode !== undefined)
      setAggressiveMode(Boolean(parsed.aggressiveMode));
    if (parsed.minStopPct !== undefined)
      setMinStopPct(Number(parsed.minStopPct));
    if (parsed.maxStopPct !== undefined)
      setMaxStopPct(Number(parsed.maxStopPct));
    if (parsed.minTp1R !== undefined) setMinTp1R(Number(parsed.minTp1R));
    if (parsed.minTp2R !== undefined) setMinTp2R(Number(parsed.minTp2R));
    if (parsed.notifyBrowser !== undefined)
      setNotifyBrowser(Boolean(parsed.notifyBrowser));
    if (parsed.notifyDiscord !== undefined)
      setNotifyDiscord(Boolean(parsed.notifyDiscord));
    if (parsed.discordWebhookUrl !== undefined)
      setDiscordWebhookUrl(String(parsed.discordWebhookUrl));
    if (parsed.notifyDiscordPnl !== undefined)
      setNotifyDiscordPnl(Boolean(parsed.notifyDiscordPnl));
    if (parsed.discordPnlWebhookUrl !== undefined)
      setDiscordPnlWebhookUrl(String(parsed.discordPnlWebhookUrl));
    if (parsed.pnlAlertOnTp !== undefined)
      setPnlAlertOnTp(Boolean(parsed.pnlAlertOnTp));
    if (parsed.pnlAlertOnSl !== undefined)
      setPnlAlertOnSl(Boolean(parsed.pnlAlertOnSl));
    if (parsed.pnlAlertOnMilestone !== undefined)
      setPnlAlertOnMilestone(Boolean(parsed.pnlAlertOnMilestone));
    if (parsed.pnlProfitThresholdPct !== undefined)
      setPnlProfitThresholdPct(Number(parsed.pnlProfitThresholdPct));
    if (parsed.pnlLossThresholdPct !== undefined)
      setPnlLossThresholdPct(Number(parsed.pnlLossThresholdPct));
    if (parsed.notifyTelegram !== undefined)
      setNotifyTelegram(Boolean(parsed.notifyTelegram));
    if (parsed.telegramBotToken !== undefined)
      setTelegramBotToken(String(parsed.telegramBotToken));
    if (parsed.telegramChatId !== undefined)
      setTelegramChatId(String(parsed.telegramChatId));
    if (parsed.weights && typeof parsed.weights === "object") {
      setWeights({
        news: Number(parsed.weights.news ?? 25),
        momentum: Number(parsed.weights.momentum ?? 20),
        volume: Number(parsed.weights.volume ?? 15),
        supertrend: Number(parsed.weights.supertrend ?? 15),
        ewo: Number(parsed.weights.ewo ?? 10),
        rsi: Number(parsed.weights.rsi ?? 5),
        sr: Number(parsed.weights.sr ?? 10),
      });
    }
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const handleAutoBalanceWeights = () => {
    if (totalWeight <= 0) {
      setWeights(DEFAULT_WEIGHTS);
      return;
    }
    const entries = Object.entries(weights);
    const scaled: Record<string, number> = {};
    let running = 0;
    entries.forEach(([k, v], idx) => {
      if (idx === entries.length - 1) {
        scaled[k] = Math.max(0, 100 - running);
      } else {
        const rounded = Math.round((v / totalWeight) * 100);
        scaled[k] = rounded;
        running += rounded;
      }
    });
    setWeights(scaled as typeof DEFAULT_WEIGHTS);
  };

  const handleResetRiskDefaults = () => {
    setDefaultTimeframe("15m");
    setAggressiveMode(false);
    setMinStopPct(1.5);
    setMaxStopPct(3.5);
    setMinTp1R(1.5);
    setMinTp2R(2.5);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    const payload = {
      defaultTimeframe,
      aggressiveMode,
      minStopPct: Number(minStopPct) || 1.5,
      maxStopPct: Number(maxStopPct) || 3.5,
      minTp1R: Number(minTp1R) || 1.5,
      minTp2R: Number(minTp2R) || 2.5,
      notifyBrowser,
      notifyDiscord,
      discordWebhookUrl: discordWebhookUrl.trim(),
      notifyDiscordPnl,
      discordPnlWebhookUrl: discordPnlWebhookUrl.trim(),
      pnlAlertOnTp,
      pnlAlertOnSl,
      pnlAlertOnMilestone,
      pnlProfitThresholdPct: Number(pnlProfitThresholdPct) || 1.0,
      pnlLossThresholdPct: Number(pnlLossThresholdPct) || 1.0,
      notifyTelegram,
      telegramBotToken: telegramBotToken.trim(),
      telegramChatId: telegramChatId.trim(),
      weights,
    };

    try {
      localStorage.setItem(
        "cryptoconfluence_settings",
        JSON.stringify(payload)
      );
      const res = await apiPost<{ ok: boolean; settings: any }>(
        "/api/settings",
        payload
      );
      if (res?.settings) {
        applySettingsObject(res.settings);
        localStorage.setItem(
          "cryptoconfluence_settings",
          JSON.stringify(res.settings)
        );
      }
      setSaved(true);
      setSaveMessage(
        "All settings & Discord Profit/Loss webhooks saved to live FastAPI engine!"
      );
      setTimeout(() => {
        setSaved(false);
        setSaveMessage(null);
      }, 4000);
    } catch (err: any) {
      setSaveMessage(
        `Saved locally, but backend sync failed: ${err?.message || "Unknown error"}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestBrowserAlert = async () => {
    setBrowserStatus(null);
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserStatus({
        ok: false,
        text: "This browser does not support desktop notifications.",
      });
      return;
    }
    try {
      let perm = Notification.permission;
      if (perm !== "granted") {
        perm = await Notification.requestPermission();
        setBrowserPermission(perm);
      }
      if (perm === "granted") {
        new Notification("CryptoConfluence AI — Live Signal Alert", {
          body: "🟢 LONG BTC/USDT (15m) • Confidence: 84/100 • Desktop notifications are working!",
          icon: LOGO_DATA_URI,
        });
        setNotifyBrowser(true);
        setBrowserStatus({
          ok: true,
          text: "Desktop notification sent! Check your system notification tray.",
        });
      } else {
        setBrowserStatus({
          ok: false,
          text: "Notification permission was denied by the browser. Please allow notifications in your browser URL bar.",
        });
      }
    } catch (err: any) {
      setBrowserStatus({
        ok: false,
        text: err?.message || "Could not trigger browser notification.",
      });
    }
  };

  const handleTestDiscord = async () => {
    const targetUrl = discordWebhookUrl.trim() || discordPnlWebhookUrl.trim();
    if (!targetUrl) {
      setDiscordStatus({
        ok: false,
        text: "Please paste your Discord Webhook URL first.",
      });
      return;
    }
    setTestingDiscord(true);
    setDiscordStatus(null);
    try {
      await apiPost("/api/settings", {
        notifyDiscord: true,
        discordWebhookUrl: targetUrl,
      });
      setNotifyDiscord(true);
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/api/settings/test",
        {
          channel: "discord",
          discordWebhookUrl: targetUrl,
        }
      );
      setDiscordStatus({
        ok: true,
        text:
          res.message ||
          "Test signal alert delivered to your Discord channel!",
      });
    } catch (err: any) {
      setDiscordStatus({
        ok: false,
        text: err?.message || "Failed to send Discord webhook test alert.",
      });
    } finally {
      setTestingDiscord(false);
    }
  };

  const handleTestDiscordPnl = async () => {
    const targetUrl = discordPnlWebhookUrl.trim() || discordWebhookUrl.trim();
    if (!targetUrl) {
      setDiscordPnlStatus({
        ok: false,
        text: "Please paste your Discord Profit/Loss Webhook URL first.",
      });
      return;
    }
    setTestingDiscordPnl(true);
    setDiscordPnlStatus(null);
    try {
      await apiPost("/api/settings", {
        notifyDiscordPnl: true,
        discordPnlWebhookUrl: targetUrl,
        pnlAlertOnTp,
        pnlAlertOnSl,
        pnlAlertOnMilestone,
        pnlProfitThresholdPct: Number(pnlProfitThresholdPct) || 1.0,
        pnlLossThresholdPct: Number(pnlLossThresholdPct) || 1.0,
      });
      setNotifyDiscordPnl(true);
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/api/settings/test",
        {
          channel: "discord_pnl",
          discordPnlWebhookUrl: targetUrl,
        }
      );
      setDiscordPnlStatus({
        ok: true,
        text:
          res.message ||
          "Test Profit & Loss alert delivered to your Discord channel!",
      });
    } catch (err: any) {
      setDiscordPnlStatus({
        ok: false,
        text: err?.message || "Failed to send Discord Profit/Loss test alert.",
      });
    } finally {
      setTestingDiscordPnl(false);
    }
  };

  const handleSendLivePnlReport = async () => {
    const targetUrl = discordPnlWebhookUrl.trim() || discordWebhookUrl.trim();
    if (!targetUrl) {
      setDiscordPnlStatus({
        ok: false,
        text: "Please paste your Discord Profit/Loss Webhook URL first.",
      });
      return;
    }
    setSendingPnlReport(true);
    setDiscordPnlStatus(null);
    try {
      await apiPost("/api/settings", {
        notifyDiscordPnl: true,
        discordPnlWebhookUrl: targetUrl,
      });
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/api/signals/discord-pnl-report",
        {
          discordPnlWebhookUrl: targetUrl,
        }
      );
      setDiscordPnlStatus({
        ok: true,
        text:
          res.message ||
          "Live Portfolio Profit & Loss report sent to your Discord channel!",
      });
    } catch (err: any) {
      setDiscordPnlStatus({
        ok: false,
        text: err?.message || "Failed to send live Profit/Loss report to Discord.",
      });
    } finally {
      setSendingPnlReport(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!telegramBotToken.trim() || !telegramChatId.trim()) {
      setTelegramStatus({
        ok: false,
        text: "Please enter both your Telegram Bot Token and Chat ID first.",
      });
      return;
    }
    setTestingTelegram(true);
    setTelegramStatus(null);
    try {
      await apiPost("/api/settings", {
        notifyTelegram: true,
        telegramBotToken: telegramBotToken.trim(),
        telegramChatId: telegramChatId.trim(),
      });
      setNotifyTelegram(true);
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/api/settings/test",
        {
          channel: "telegram",
          telegramBotToken: telegramBotToken.trim(),
          telegramChatId: telegramChatId.trim(),
        }
      );
      setTelegramStatus({
        ok: true,
        text:
          res.message || "Test alert delivered to your Telegram chat!",
      });
    } catch (err: any) {
      setTelegramStatus({
        ok: false,
        text: err?.message || "Failed to send Telegram test alert.",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleScanSignalsNow = async () => {
    setScanningSignals(true);
    setScanResultText(null);
    try {
      await handleSave();
      const res = await apiPost<{ created_count: number; items: any[] }>(
        "/api/signals/scan"
      );
      setScanResultText(
        `Scan complete! ${res.created_count} new signal(s) generated (${res.items?.length ?? 0} total active signals).`
      );
    } catch (err: any) {
      setScanResultText(
        `Signal scan error: ${err?.message || "Could not scan signals"}`
      );
    } finally {
      setScanningSignals(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen text-slate-900 p-2.5 sm:p-3 md:p-5 pb-20 md:pb-5 gap-3.5 sm:gap-4">
      {/* Header */}
      <Header
        btc={overview?.benchmarks?.btc || null}
        eth={overview?.benchmarks?.eth || null}
        connection={(overview?.connection as WsStatus) || "CONNECTED"}
        lastUpdate={overview?.updated_at || null}
        freshness={overview?.data_freshness || "cached"}
      />

      <div className="max-w-4xl mx-auto w-full space-y-4">
        {/* Title & Save Action Bar */}
        <div className="terminal-panel p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg md:text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Terminal Settings, Webhooks &amp; Risk Engine</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 font-mono">
              Configure real-time Discord/Telegram webhooks, risk boundaries, and confluence scoring weights.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleScanSignalsNow}
              disabled={scanningSignals}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200/90 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-indigo-600 shrink-0 ${
                  scanningSignals ? "animate-spin" : ""
                }`}
              />
              <span>{scanningSignals ? "Scanning..." : "Scan Signals"}</span>
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-sm ${
                saved
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-900 hover:bg-indigo-600 text-white shadow-slate-900/15"
              }`}
            >
              {saved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Save className="w-4 h-4 shrink-0" />
              )}
              <span>
                {saving
                  ? "Saving..."
                  : saved
                  ? "Settings Saved!"
                  : "Save Changes"}
              </span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <div className="glass-subcard px-4 py-2.5 border-emerald-200 bg-emerald-50/90 text-emerald-800 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveMessage}</span>
          </div>
        )}

        {scanResultText && (
          <div className="glass-subcard px-4 py-2.5 border-indigo-200 bg-indigo-50/90 text-indigo-800 text-xs font-mono flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{scanResultText}</span>
          </div>
        )}

        {/* Section 1: Signal Alert Channels (Discord Webhook, Telegram Bot, Browser) */}
        <div className="terminal-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Signal Alert Channels &amp; Webhooks
              </h2>
            </div>
            <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 border border-indigo-200/70 px-2.5 py-0.5 rounded-full font-semibold">
              Real-Time Dispatch
            </span>
          </div>

          <div className="space-y-3.5 text-xs font-mono">
            {/* 1. Browser In-App & Desktop Notifications */}
            <div className="glass-subcard p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={notifyBrowser}
                    onChange={(e) => setNotifyBrowser(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <div>
                    <div className="text-slate-900 font-bold flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Browser In-App &amp; Desktop Notifications</span>
                      <span
                        className={`text-[10px] px-2 py-0.2 rounded-md border ${
                          browserPermission === "granted"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {browserPermission === "granted"
                          ? "Permission Granted"
                          : "Permission: " + browserPermission}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Triggers instant desktop popup alerts when a new LONG or SHORT signal is discovered while the terminal is open.
                    </div>
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleTestBrowserAlert}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200/80 font-semibold text-[11px] flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Test Browser Alert</span>
                </button>
              </div>

              {browserStatus && (
                <div
                  className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                    browserStatus.ok
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-rose-50 text-rose-800 border-rose-200"
                  }`}
                >
                  {browserStatus.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  )}
                  <span>{browserStatus.text}</span>
                </div>
              )}
            </div>

            {/* 2. Discord Webhook Signals */}
            <div className="glass-subcard p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={notifyDiscord}
                    onChange={(e) => setNotifyDiscord(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <div>
                    <div className="text-slate-900 font-bold flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Discord Webhook Signals</span>
                      {notifyDiscord && discordWebhookUrl.trim() && (
                        <span className="text-[10px] px-2 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Webhook Configured
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Sends rich embedded trade cards (Entry, SL, TP1, TP2, R:R &amp; Confluence Score) directly to your Discord channel.
                    </div>
                  </div>
                </label>
              </div>

              {/* Discord Webhook URL Input + Test Button */}
              <div className="pl-7 space-y-2">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Discord Webhook URL:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={discordWebhookUrl}
                    onChange={(e) => {
                      setDiscordWebhookUrl(e.target.value);
                      if (e.target.value.trim()) setNotifyDiscord(true);
                    }}
                    placeholder="https://discord.com/api/webhooks/1234567890/abcdef..."
                    className="flex-1 bg-white border border-slate-200/95 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={handleTestDiscord}
                    disabled={testingDiscord}
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {testingDiscord
                        ? "Sending..."
                        : "Send Test Discord Alert"}
                    </span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-400">
                  How to get: Open Discord Server → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.
                </div>

                {discordStatus && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                      discordStatus.ok
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    {discordStatus.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span>{discordStatus.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2B. Discord Trade Profit & Loss (PnL) Alerts & Webhook */}
            <div className="glass-subcard p-4 space-y-3 border-emerald-200/80 bg-gradient-to-br from-emerald-50/40 via-white to-rose-50/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={notifyDiscordPnl}
                    onChange={(e) => setNotifyDiscordPnl(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <div className="text-slate-900 font-bold flex flex-wrap items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Discord Trade Profit &amp; Loss (PnL) Alerts &amp; Webhook</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                        🟢 Profit / 🔴 Loss Live Tracker
                      </span>
                      {notifyDiscordPnl &&
                        (discordPnlWebhookUrl.trim() || discordWebhookUrl.trim()) && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            PnL Webhook Ready
                          </span>
                        )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Automatically sends Discord alerts when any signal hits Take Profit (TP1/TP2), Stop Loss (SL), or crosses your live Profit/Loss % threshold.
                    </div>
                  </div>
                </label>

                {discordWebhookUrl.trim() &&
                  discordPnlWebhookUrl.trim() !== discordWebhookUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setDiscordPnlWebhookUrl(discordWebhookUrl.trim());
                        setNotifyDiscordPnl(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[10px] font-semibold cursor-pointer shadow-2xs"
                    >
                      Use Signal Webhook URL
                    </button>
                  )}
              </div>

              <div className="pl-7 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-800 mb-1">
                    Profit &amp; Loss Discord Webhook URL (or leave blank to use Signal Webhook above):
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={discordPnlWebhookUrl}
                      onChange={(e) => {
                        setDiscordPnlWebhookUrl(e.target.value);
                        if (e.target.value.trim()) setNotifyDiscordPnl(true);
                      }}
                      placeholder={
                        discordWebhookUrl.trim()
                          ? `Using Signal Webhook (${discordWebhookUrl.trim().slice(0, 42)}...) or paste separate PnL channel webhook`
                          : "https://discord.com/api/webhooks/1234567890/profit-loss-webhook..."
                      }
                      className="flex-1 bg-white border border-slate-200/95 rounded-xl px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 shadow-2xs"
                    />
                    <button
                      type="button"
                      onClick={handleTestDiscordPnl}
                      disabled={testingDiscordPnl}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>
                        {testingDiscordPnl
                          ? "Sending..."
                          : "Test Profit/Loss Alert"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendLivePnlReport}
                      disabled={sendingPnlReport}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>
                        {sendingPnlReport
                          ? "Sending Report..."
                          : "Send Live PnL Report Now"}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Profit / Loss Trigger Checkboxes & Thresholds */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/90 border border-emerald-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pnlAlertOnTp}
                      onChange={(e) => setPnlAlertOnTp(e.target.checked)}
                      className="w-3.5 h-3.5 accent-emerald-600 cursor-pointer"
                    />
                    <div>
                      <div className="text-[11px] font-bold text-emerald-800">
                        🟢 Take Profit Hits (TP1 / TP2)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Alert when TP1 or TP2 target is hit
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/90 border border-rose-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pnlAlertOnSl}
                      onChange={(e) => setPnlAlertOnSl(e.target.checked)}
                      className="w-3.5 h-3.5 accent-rose-600 cursor-pointer"
                    />
                    <div>
                      <div className="text-[11px] font-bold text-rose-800">
                        🔴 Stop Loss Hits (SL)
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Alert when Stop Loss is triggered
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/90 border border-indigo-200/80 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pnlAlertOnMilestone}
                      onChange={(e) => setPnlAlertOnMilestone(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                    />
                    <div>
                      <div className="text-[11px] font-bold text-indigo-900">
                        📊 Live Profit / Loss % Alert
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Alert when live PnL crosses % below
                      </div>
                    </div>
                  </label>
                </div>

                {pnlAlertOnMilestone && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-emerald-900">
                          Live Profit Alert Trigger (+%)
                        </div>
                        <div className="text-[10px] text-emerald-700">
                          Sends Discord Profit alert when trade gains at least this %
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-emerald-700">+</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="50"
                          value={pnlProfitThresholdPct}
                          onChange={(e) =>
                            setPnlProfitThresholdPct(parseFloat(e.target.value) || 1.0)
                          }
                          className="w-20 bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs font-bold text-emerald-800 text-right focus:outline-none"
                        />
                        <span className="text-xs font-bold text-emerald-700">%</span>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-200/80 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-rose-900">
                          Live Loss Alert Trigger (-%)
                        </div>
                        <div className="text-[10px] text-rose-700">
                          Sends Discord Loss alert when trade drops by at least this %
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-rose-700">-</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="50"
                          value={pnlLossThresholdPct}
                          onChange={(e) =>
                            setPnlLossThresholdPct(parseFloat(e.target.value) || 1.0)
                          }
                          className="w-20 bg-white border border-rose-300 rounded-lg px-2 py-1 text-xs font-bold text-rose-800 text-right focus:outline-none"
                        />
                        <span className="text-xs font-bold text-rose-700">%</span>
                      </div>
                    </div>
                  </div>
                )}

                {discordPnlStatus && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                      discordPnlStatus.ok
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    {discordPnlStatus.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span>{discordPnlStatus.text}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Telegram Bot Channel Alerts */}
            <div className="glass-subcard p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={notifyTelegram}
                    onChange={(e) => setNotifyTelegram(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  <div>
                    <div className="text-slate-900 font-bold flex items-center gap-2">
                      <Send className="w-3.5 h-3.5 text-sky-600" />
                      <span>Telegram Bot Channel Alerts</span>
                      {notifyTelegram &&
                        telegramBotToken.trim() &&
                        telegramChatId.trim() && (
                          <span className="text-[10px] px-2 py-0.2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Bot Configured
                          </span>
                        )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Delivers instant Markdown signal alerts to your Telegram group, channel, or personal chat via Bot API.
                    </div>
                  </div>
                </label>
              </div>

              <div className="pl-7 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Telegram Bot Token (@BotFather):
                    </label>
                    <input
                      type="text"
                      value={telegramBotToken}
                      onChange={(e) => {
                        setTelegramBotToken(e.target.value);
                        if (e.target.value.trim()) setNotifyTelegram(true);
                      }}
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className="w-full bg-white border border-slate-200/95 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Telegram Chat ID / Channel ID:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={telegramChatId}
                        onChange={(e) => {
                          setTelegramChatId(e.target.value);
                          if (e.target.value.trim()) setNotifyTelegram(true);
                        }}
                        placeholder="-1001234567890 or @my_channel"
                        className="flex-1 bg-white border border-slate-200/95 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={handleTestTelegram}
                        disabled={testingTelegram}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-[11px] flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{testingTelegram ? "Sending..." : "Test Bot"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {telegramStatus && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] flex items-center gap-2 ${
                      telegramStatus.ok
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-rose-50 text-rose-800 border-rose-200"
                    }`}
                  >
                    {telegramStatus.ok ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span>{telegramStatus.text}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Risk & Trade Target Parameters */}
        <div className="terminal-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Algorithmic Risk Engine Rules
              </h2>
            </div>

            <button
              type="button"
              onClick={handleResetRiskDefaults}
              className="text-[11px] font-mono text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            {/* Default Chart Timeframe */}
            <div className="space-y-1.5 md:col-span-3">
              <label className="text-slate-700 font-semibold block">
                Default Terminal Chart Timeframe:
              </label>
              <div className="flex items-center gap-2">
                {(["15m", "1h", "4h", "1d"] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setDefaultTimeframe(tf)}
                    className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer border ${
                      defaultTimeframe === tf
                        ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                        : "bg-white/80 text-slate-600 border-slate-200/90 hover:text-slate-900"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Min / Max Stop Distance */}
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold">
                Min Stop Loss Distance (%):
              </label>
              <input
                type="number"
                step="0.1"
                min="0.3"
                max="5.0"
                value={minStopPct}
                onChange={(e) => setMinStopPct(parseFloat(e.target.value) || 0.5)}
                className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-slate-900 shadow-2xs focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block">
                Default: 1.5%. Tighter stops are rejected.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold">
                Max Stop Loss Distance (%):
              </label>
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="15.0"
                value={maxStopPct}
                onChange={(e) => setMaxStopPct(parseFloat(e.target.value) || 3.5)}
                className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-slate-900 shadow-2xs focus:outline-none focus:border-indigo-500"
              />
              <span className="text-[10px] text-slate-500 block">
                Default: 3.5%. Wider stops are filtered out.
              </span>
            </div>

            {/* Min R:R Targets */}
            <div className="space-y-1.5">
              <label className="text-slate-700 font-semibold">
                Min TP1 / TP2 Risk-Reward (R):
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    step="0.1"
                    min="0.8"
                    max="5.0"
                    value={minTp1R}
                    onChange={(e) =>
                      setMinTp1R(parseFloat(e.target.value) || 1.5)
                    }
                    className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-slate-900 shadow-2xs focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">TP1 (1.5R)</span>
                </div>
                <div>
                  <input
                    type="number"
                    step="0.1"
                    min="1.2"
                    max="10.0"
                    value={minTp2R}
                    onChange={(e) =>
                      setMinTp2R(parseFloat(e.target.value) || 2.5)
                    }
                    className="w-full bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-slate-900 shadow-2xs focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">TP2 (2.5R)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Aggressive Mode Switch */}
          <label className="flex items-center justify-between p-4 rounded-xl glass-subcard cursor-pointer mt-2">
            <div>
              <div className="font-mono text-xs font-bold text-slate-900">
                Aggressive Mode (Relax Extreme RSI &amp; Momentum Thresholds)
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                When enabled, signals are NOT rejected even if RSI &gt; 85 for LONG or RSI &lt; 15 for SHORT.
              </div>
            </div>
            <input
              type="checkbox"
              checked={aggressiveMode}
              onChange={(e) => setAggressiveMode(e.target.checked)}
              className="w-5 h-5 accent-indigo-600 cursor-pointer"
            />
          </label>
        </div>

        {/* Section 3: Confluence Scoring Weights */}
        <div className="terminal-panel p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
                Confluence Scoring Model Weights
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {totalWeight !== 100 && (
                <button
                  type="button"
                  onClick={handleAutoBalanceWeights}
                  className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer transition-all"
                >
                  Auto-Balance to 100%
                </button>
              )}
              <button
                type="button"
                onClick={() => setWeights(DEFAULT_WEIGHTS)}
                className="text-[11px] font-mono text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Default</span>
              </button>
              <span
                className={`font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  totalWeight === 100
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                Total: {totalWeight}%{" "}
                {totalWeight === 100 ? "(Balanced)" : "(Auto-normalized on save)"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            {Object.entries(weights).map(([key, val]) => (
              <div key={key} className="glass-subcard p-3.5">
                <div className="flex justify-between text-slate-700 uppercase text-[11px] mb-2">
                  <span className="font-bold">{key}</span>
                  <span className="font-extrabold text-indigo-600">{val}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={val}
                  onChange={(e) =>
                    setWeights((prev) => ({
                      ...prev,
                      [key]: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: System Infrastructure Status */}
        <div className="terminal-panel p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-200/70 pb-3">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider font-mono">
              System Infrastructure &amp; Live Connectivity
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-xl glass-subcard">
              <div className="text-slate-500 text-[10px] uppercase font-semibold">
                FastAPI Backend
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Operational</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl glass-subcard">
              <div className="text-slate-500 text-[10px] uppercase font-semibold">
                Binance Stream
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{health?.binance_ws || "CONNECTED"}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl glass-subcard">
              <div className="text-slate-500 text-[10px] uppercase font-semibold">
                Supabase Database
              </div>
              <div
                className={`flex items-center gap-1.5 mt-1 font-bold ${
                  health?.supabase_configured
                    ? "text-emerald-600"
                    : "text-amber-600"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {health?.supabase_configured
                    ? "Connected & Active"
                    : "In-Memory Mode"}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl glass-subcard">
              <div className="text-slate-500 text-[10px] uppercase font-semibold">
                Sentiment Engine
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-bold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {health?.llm_configured ? "AI + Heuristic" : "Heuristic Active"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
