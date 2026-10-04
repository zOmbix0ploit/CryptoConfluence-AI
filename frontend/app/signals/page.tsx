"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { SignalCard } from "@/components/SignalCard";
import type {
  GeneratedSignal,
  OverviewResponse,
  TradePerformanceSummary,
  WsStatus,
} from "@/types";
import { apiGet, apiPost } from "@/lib/api";
import { formatPrice, timeAgo } from "@/lib/utils";
import {
  Radio,
  Search,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Target,
  ShieldAlert,
  RefreshCw,
  Database,
  DollarSign,
  Award,
  AlertOctagon,
  Table2,
  LayoutGrid,
  LineChart,
  Layers,
  Send,
} from "lucide-react";

export default function SignalsPage() {
  const [signals, setSignals] = useState<GeneratedSignal[]>([]);
  const [summary, setSummary] = useState<TradePerformanceSummary | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [discordToast, setDiscordToast] = useState<{ ok: boolean; text: string } | null>(null);

  // User-selectable Position Size ($ USD per trade)
  const [positionSize, setPositionSize] = useState<number>(1000);

  // Filters & View Mode
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [directionFilter, setDirectionFilter] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "date" | "profit_desc" | "loss_desc" | "confidence" | "rr"
  >("date");
  const [viewMode, setViewMode] = useState<"both" | "table" | "cards">("both");

  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet<{
        items: GeneratedSignal[];
        summary?: TradePerformanceSummary;
      }>("/api/signals");
      setSignals(res.items || []);
      if (res.summary) setSummary(res.summary);
    } catch (err) {
      console.warn("Failed to load signals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiGet<OverviewResponse>("/api/market/overview");
      setOverview(data);
    } catch (err) {
      console.warn("Overview error:", err);
    }
  }, []);

  const handleForceScan = async () => {
    setScanning(true);
    try {
      const res = await apiPost<{
        items: GeneratedSignal[];
        summary?: TradePerformanceSummary;
      }>("/api/signals/scan", {});
      if (res.items) setSignals(res.items);
      if (res.summary) setSummary(res.summary);
    } catch {
      await fetchSignals();
    } finally {
      setScanning(false);
    }
  };

  const handleSendDiscordPnlReport = async () => {
    setSendingDiscord(true);
    setDiscordToast(null);
    try {
      const res = await apiPost<{ ok: boolean; message: string }>(
        "/api/signals/discord-pnl-report",
        {}
      );
      setDiscordToast({
        ok: true,
        text: res.message || "Profit & Loss report sent to Discord!",
      });
    } catch (err: any) {
      setDiscordToast({
        ok: false,
        text:
          err?.message ||
          "Please configure your Discord Profit/Loss Webhook URL in Settings first.",
      });
    } finally {
      setSendingDiscord(false);
      setTimeout(() => setDiscordToast(null), 6000);
    }
  };

  useEffect(() => {
    fetchSignals();
    fetchOverview();
    const interval = setInterval(() => {
      fetchSignals();
      fetchOverview();
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchSignals, fetchOverview]);

  // Compute live PnL metrics scaled to positionSize
  const pnlAnalytics = useMemo(() => {
    let totalProfitPct = 0;
    let totalLossPct = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let active = 0;
    let tpHits = 0;
    let slHits = 0;

    let bestTrade: GeneratedSignal | null = null;
    let worstTrade: GeneratedSignal | null = null;

    for (const s of signals) {
      const pct = s.pnl_pct ?? 0;
      if (pct > 0.01) {
        wins++;
        totalProfitPct += pct;
      } else if (pct < -0.01) {
        losses++;
        totalLossPct += pct;
      } else {
        breakeven++;
      }

      if (s.status === "ACTIVE" || s.status === "PENDING" || s.status === "TP1_HIT") {
        active++;
      }
      if (s.status === "TP1_HIT" || s.status === "TP2_HIT") {
        tpHits++;
      }
      if (s.status === "STOPPED_OUT") {
        slHits++;
      }

      if (!bestTrade || pct > (bestTrade.pnl_pct ?? 0)) bestTrade = s;
      if (!worstTrade || pct < (worstTrade.pnl_pct ?? 0)) worstTrade = s;
    }

    const netPct = totalProfitPct + totalLossPct;
    const totalProfitUsd = (totalProfitPct / 100) * positionSize;
    const totalLossUsd = (totalLossPct / 100) * positionSize;
    const netUsd = totalProfitUsd + totalLossUsd;
    const decided = wins + losses;
    const winRate = decided > 0 ? Math.round((wins / decided) * 1000) / 10 : 0;

    return {
      total: signals.length,
      active,
      wins,
      losses,
      breakeven,
      tpHits,
      slHits,
      winRate,
      totalProfitPct,
      totalLossPct,
      netPct,
      totalProfitUsd,
      totalLossUsd,
      netUsd,
      bestTrade,
      worstTrade,
    };
  }, [signals, positionSize]);

  // Filtered & Sorted list
  const filtered = useMemo(() => {
    let list = signals;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.coin.toLowerCase().includes(q) ||
          s.symbol.toLowerCase().includes(q)
      );
    }

    if (outcomeFilter === "PROFIT") {
      list = list.filter((s) => (s.pnl_pct ?? 0) > 0.01);
    } else if (outcomeFilter === "LOSS") {
      list = list.filter((s) => (s.pnl_pct ?? 0) < -0.01);
    }

    if (directionFilter !== "ALL") {
      list = list.filter((s) => s.type === directionFilter);
    }

    if (statusFilter !== "ALL") {
      list = list.filter((s) => s.status === statusFilter);
    }

    return [...list].sort((a, b) => {
      if (sortBy === "profit_desc") {
        return (b.pnl_pct ?? 0) - (a.pnl_pct ?? 0);
      }
      if (sortBy === "loss_desc") {
        return (a.pnl_pct ?? 0) - (b.pnl_pct ?? 0);
      }
      if (sortBy === "confidence") {
        return b.confidence_score - a.confidence_score;
      }
      if (sortBy === "rr") {
        return b.risk_reward_tp2 - a.risk_reward_tp2;
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [signals, search, outcomeFilter, directionFilter, statusFilter, sortBy]);

  return (
    <div className="flex flex-col min-h-screen text-slate-900 p-3 md:p-5 gap-4">
      {/* Header */}
      <Header
        btc={overview?.benchmarks?.btc || null}
        eth={overview?.benchmarks?.eth || null}
        connection={(overview?.connection as WsStatus) || "CONNECTED"}
        lastUpdate={overview?.updated_at || null}
        freshness={overview?.data_freshness || "cached"}
      />

      {/* Top Database Sync & Trade Capital Bar */}
      <div className="terminal-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200/80 shadow-2xs">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Trade Profit & Loss (PnL) Database Ledger
              </h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supabase + SQLite Synced
              </span>
            </div>
            <p className="text-[11px] font-mono text-slate-500">
              All generated signals, live prices, profits, and losses are automatically saved to the database.
            </p>
          </div>
        </div>

        {/* Trade Capital Size Selector & Scan Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80 font-mono text-xs">
            <span className="text-[10px] uppercase text-slate-500 font-semibold px-2">
              Trade Size:
            </span>
            {[100, 500, 1000, 2500, 5000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setPositionSize(amt)}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  positionSize === amt
                    ? "bg-slate-900 text-white font-bold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
                }`}
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSendDiscordPnlReport}
            disabled={sendingDiscord}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold shadow-sm shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>
              {sendingDiscord ? "Sending to Discord..." : "Send PnL Alert to Discord"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleForceScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold shadow-sm shadow-indigo-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
            <span>{scanning ? "Scanning Market..." : "Force Signal Scan"}</span>
          </button>
        </div>
      </div>

      {discordToast && (
        <div
          className={`terminal-panel px-4 py-2.5 text-xs font-mono flex items-center justify-between gap-2 border ${
            discordToast.ok
              ? "bg-emerald-50/90 text-emerald-800 border-emerald-200"
              : "bg-rose-50/90 text-rose-800 border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`w-4 h-4 shrink-0 ${
                discordToast.ok ? "text-emerald-600" : "text-rose-600"
              }`}
            />
            <span>{discordToast.text}</span>
          </div>
          {!discordToast.ok && (
            <a
              href="/settings"
              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-indigo-600"
            >
              Open Webhook Settings →
            </a>
          )}
        </div>
      )}

      {/* 6-Card Profit & Loss KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
        {/* 1. Net Profit / Loss */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex items-center justify-between">
          <div
            className={`pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full ${
              pnlAnalytics.netUsd >= 0
                ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                : "bg-gradient-to-r from-rose-500 to-red-500"
            }`}
          />
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Net Profit / Loss
            </div>
            <div
              className={`font-mono text-lg font-extrabold mt-0.5 ${
                pnlAnalytics.netUsd >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {pnlAnalytics.netUsd >= 0 ? "+$" : "-$"}
              {Math.abs(pnlAnalytics.netUsd).toFixed(2)}
            </div>
            <div
              className={`text-[11px] font-mono font-bold mt-0.5 ${
                pnlAnalytics.netPct >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {pnlAnalytics.netPct >= 0 ? "+" : ""}
              {pnlAnalytics.netPct.toFixed(2)}% cumulative
            </div>
          </div>
          <div
            className={`p-2.5 rounded-xl border ${
              pnlAnalytics.netUsd >= 0
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : "bg-rose-50 text-rose-600 border-rose-200"
            }`}
          >
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        {/* 2. Total Profit (Winning Trades) */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex items-center justify-between">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-emerald-500 to-green-500" />
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Total Profit ({pnlAnalytics.wins} Trades)
            </div>
            <div className="font-mono text-lg font-extrabold text-emerald-600 mt-0.5">
              +${pnlAnalytics.totalProfitUsd.toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-emerald-700 font-semibold mt-0.5">
              +{pnlAnalytics.totalProfitPct.toFixed(2)}% gain
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        {/* 3. Total Loss (Losing Trades) */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex items-center justify-between">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-rose-500 to-red-500" />
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Total Loss ({pnlAnalytics.losses} Trades)
            </div>
            <div className="font-mono text-lg font-extrabold text-rose-600 mt-0.5">
              -${Math.abs(pnlAnalytics.totalLossUsd).toFixed(2)}
            </div>
            <div className="text-[11px] font-mono text-rose-600 font-semibold mt-0.5">
              {pnlAnalytics.totalLossPct.toFixed(2)}% drawdown
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        {/* 4. Win Rate & Trade Count */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex flex-col justify-between">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-indigo-500 to-violet-500" />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
                Win Rate ({pnlAnalytics.total} Saved)
              </div>
              <div className="font-mono text-lg font-extrabold text-indigo-600 mt-0.5">
                {pnlAnalytics.winRate}%
              </div>
            </div>
            <div className="text-right font-mono text-xs font-bold">
              <span className="text-emerald-600">{pnlAnalytics.wins}W</span>
              <span className="text-slate-300 mx-1">/</span>
              <span className="text-rose-600">{pnlAnalytics.losses}L</span>
            </div>
          </div>
          <div className="w-full h-1.5 rounded-full bg-rose-100 overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${pnlAnalytics.winRate}%` }}
            />
          </div>
        </div>

        {/* 5. Best Profit Trade */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex items-center justify-between">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="overflow-hidden">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Best Trade
            </div>
            <div className="font-mono text-sm font-extrabold text-slate-900 truncate mt-0.5">
              {pnlAnalytics.bestTrade
                ? `${pnlAnalytics.bestTrade.coin} (${pnlAnalytics.bestTrade.type})`
                : "—"}
            </div>
            <div className="font-mono text-xs font-bold text-emerald-600 mt-0.5">
              {pnlAnalytics.bestTrade
                ? `+${(pnlAnalytics.bestTrade.pnl_pct ?? 0).toFixed(2)}% (+$${(
                    ((pnlAnalytics.bestTrade.pnl_pct ?? 0) / 100) *
                    positionSize
                  ).toFixed(2)})`
                : "—"}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
            <Award className="w-4 h-4" />
          </div>
        </div>

        {/* 6. Biggest Loss Trade */}
        <div className="terminal-panel relative overflow-hidden p-3.5 flex items-center justify-between">
          <div className="pointer-events-none absolute inset-x-4 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-amber-500 to-rose-500" />
          <div className="overflow-hidden">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Max Loss Trade
            </div>
            <div className="font-mono text-sm font-extrabold text-slate-900 truncate mt-0.5">
              {pnlAnalytics.worstTrade
                ? `${pnlAnalytics.worstTrade.coin} (${pnlAnalytics.worstTrade.type})`
                : "—"}
            </div>
            <div
              className={`font-mono text-xs font-bold mt-0.5 ${
                (pnlAnalytics.worstTrade?.pnl_pct ?? 0) < 0
                  ? "text-rose-600"
                  : "text-emerald-600"
              }`}
            >
              {pnlAnalytics.worstTrade
                ? `${(pnlAnalytics.worstTrade.pnl_pct ?? 0) >= 0 ? "+" : ""}${(
                    pnlAnalytics.worstTrade.pnl_pct ?? 0
                  ).toFixed(2)}% (${
                    (pnlAnalytics.worstTrade.pnl_pct ?? 0) >= 0 ? "+$" : "-$"
                  }${Math.abs(
                    ((pnlAnalytics.worstTrade.pnl_pct ?? 0) / 100) * positionSize
                  ).toFixed(2)})`
                : "—"}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
            <AlertOctagon className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter, Search, and View Switcher Controls */}
      <div className="terminal-panel p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coin (BTC, SOL, XRP)..."
              className="w-full bg-white/80 border border-slate-200/90 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 shadow-2xs font-mono"
            />
          </div>

          {/* Outcome Filter (All / Profit / Loss) */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            {(
              [
                { id: "ALL", label: `All (${signals.length})` },
                { id: "PROFIT", label: `▲ Profit (${pnlAnalytics.wins})` },
                { id: "LOSS", label: `▼ Loss (${pnlAnalytics.losses})` },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setOutcomeFilter(item.id)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  outcomeFilter === item.id
                    ? item.id === "PROFIT"
                      ? "bg-emerald-500 text-white font-bold shadow-2xs"
                      : item.id === "LOSS"
                      ? "bg-rose-500 text-white font-bold shadow-2xs"
                      : "bg-white text-indigo-600 font-bold border border-slate-200/70 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Direction Filter */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            {(["ALL", "LONG", "SHORT"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setDirectionFilter(dir)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  directionFilter === dir
                    ? dir === "LONG"
                      ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 shadow-2xs"
                      : dir === "SHORT"
                      ? "bg-rose-50 text-rose-700 font-semibold border border-rose-200 shadow-2xs"
                      : "bg-white text-indigo-600 font-semibold border border-slate-200/70 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white/80 border border-slate-200/90 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-indigo-500/60 shadow-2xs"
          >
            <option value="date">Sort: Newest First</option>
            <option value="profit_desc">Sort: Highest Profit %</option>
            <option value="loss_desc">Sort: Biggest Loss %</option>
            <option value="confidence">Sort: Highest Confidence</option>
            <option value="rr">Sort: Highest R:R</option>
          </select>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            <button
              type="button"
              onClick={() => setViewMode("both")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer ${
                viewMode === "both"
                  ? "bg-white text-indigo-600 font-bold border border-slate-200/70 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>All</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer ${
                viewMode === "table"
                  ? "bg-white text-indigo-600 font-bold border border-slate-200/70 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white text-indigo-600 font-bold border border-slate-200/70 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchSignals}
            title="Refresh signals & PnL"
            className="p-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/90 text-slate-500 hover:text-slate-800 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading && signals.length === 0 ? (
        <div className="terminal-panel p-16 flex items-center justify-center text-slate-500 font-mono text-sm">
          Loading saved trades and live Profit/Loss from database...
        </div>
      ) : filtered.length === 0 ? (
        <div className="terminal-panel p-16 flex flex-col items-center justify-center text-center text-slate-500 font-mono">
          <Radio className="w-10 h-10 mb-3 opacity-40 text-indigo-500" />
          <h3 className="text-base font-bold text-slate-800">
            No Matching Trades Found
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Try switching the Profit/Loss filter to &quot;All&quot; or click &quot;Force Signal Scan&quot; to analyze live market setups.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 1. Database Trade Profit / Loss Ledger Table */}
          {(viewMode === "both" || viewMode === "table") && (
            <div className="terminal-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 bg-white/60">
                <div className="flex items-center gap-2">
                  <Table2 className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-xs font-mono uppercase tracking-wider font-extrabold text-slate-800">
                    Saved Trade Profit / Loss Ledger ({filtered.length} Trades)
                  </h2>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  Showing PnL based on{" "}
                  <strong className="text-slate-900">
                    ${positionSize.toLocaleString()}
                  </strong>{" "}
                  per trade
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                      <th className="py-2.5 px-3.5">Coin</th>
                      <th className="py-2.5 px-3">Side</th>
                      <th className="py-2.5 px-3 text-right">Entry Price</th>
                      <th className="py-2.5 px-3 text-right">Live / Exit</th>
                      <th className="py-2.5 px-3 text-right">Stop Loss</th>
                      <th className="py-2.5 px-3 text-right">TP1 / TP2</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Outcome</th>
                      <th className="py-2.5 px-3 text-right">PnL (%)</th>
                      <th className="py-2.5 px-3 text-right">
                        Profit / Loss ($)
                      </th>
                      <th className="py-2.5 px-3 text-right">R-Mult / Peak</th>
                      <th className="py-2.5 px-3.5 text-right">DB / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60">
                    {filtered.map((sig) => {
                      const isLong = sig.type === "LONG";
                      const curPrice =
                        sig.exit_price ?? sig.current_price ?? sig.entry;
                      const pct =
                        typeof sig.pnl_pct === "number"
                          ? sig.pnl_pct
                          : sig.entry > 0
                          ? ((curPrice - sig.entry) / sig.entry) *
                            100 *
                            (isLong ? 1 : -1)
                          : 0;
                      const usd = (pct / 100) * positionSize;
                      const rMult =
                        typeof sig.pnl_r === "number"
                          ? sig.pnl_r
                          : sig.risk_percentage > 0
                          ? pct / sig.risk_percentage
                          : 0;
                      const isProfit = pct > 0.01;
                      const isLoss = pct < -0.01;

                      return (
                        <tr
                          key={sig.signal_id}
                          className={`transition-colors ${
                            isProfit
                              ? "hover:bg-emerald-50/40"
                              : isLoss
                              ? "hover:bg-rose-50/40"
                              : "hover:bg-slate-50/80"
                          }`}
                        >
                          <td className="py-2.5 px-3.5 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span>{sig.coin}</span>
                              <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {sig.timeframe}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${
                                isLong
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {isLong ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {sig.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-blue-600">
                            ${formatPrice(sig.entry)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            ${formatPrice(curPrice)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-600">
                            ${formatPrice(sig.sl)}
                            <span className="block text-[9px] text-slate-400">
                              -{sig.risk_percentage.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-emerald-600">
                            <div>${formatPrice(sig.tp1)}</div>
                            <div className="text-[10px] text-emerald-700 font-bold">
                              ${formatPrice(sig.tp2)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                              {sig.status.replace("_", " ")}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                                isProfit
                                  ? "bg-emerald-500 text-white border-emerald-600"
                                  : isLoss
                                  ? "bg-rose-500 text-white border-rose-600"
                                  : "bg-slate-200 text-slate-700 border-slate-300"
                              }`}
                            >
                              {isProfit
                                ? "▲ PROFIT"
                                : isLoss
                                ? "▼ LOSS"
                                : "• EVEN"}
                            </span>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-extrabold ${
                              isProfit
                                ? "text-emerald-600"
                                : isLoss
                                ? "text-rose-600"
                                : "text-slate-600"
                            }`}
                          >
                            {pct >= 0 ? "+" : ""}
                            {pct.toFixed(2)}%
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-extrabold ${
                              isProfit
                                ? "text-emerald-700"
                                : isLoss
                                ? "text-rose-600"
                                : "text-slate-600"
                            }`}
                          >
                            {usd >= 0 ? "+$" : "-$"}
                            {Math.abs(usd).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div
                              className={`font-bold ${
                                rMult > 0
                                  ? "text-emerald-600"
                                  : rMult < 0
                                  ? "text-rose-600"
                                  : "text-slate-600"
                              }`}
                            >
                              {rMult >= 0 ? "+" : ""}
                              {rMult.toFixed(2)}R
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Peak: +{(sig.max_profit_pct ?? Math.max(0, pct)).toFixed(2)}%
                            </div>
                          </td>
                          <td className="py-2.5 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-[10px] text-slate-400">
                                {timeAgo(sig.timestamp)}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  window.location.href = `/?symbol=${sig.symbol}`;
                                }}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white hover:bg-indigo-50 text-indigo-600 border border-slate-200/90 text-[10px] font-bold shadow-2xs cursor-pointer"
                              >
                                <LineChart className="w-3 h-3" />
                                Chart
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Signal Cards Grid */}
          {(viewMode === "both" || viewMode === "cards") && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((sig) => (
                <SignalCard
                  key={sig.signal_id}
                  signal={sig}
                  positionSize={positionSize}
                  onViewChart={(sym) => {
                    window.location.href = `/?symbol=${sym}`;
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
