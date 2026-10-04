"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { MarketRow, GeneratedSignal } from "@/types";
import { formatVolume, formatPct } from "@/lib/utils";
import { CoinIcon } from "@/components/CoinIcon";
import {
  TrendingUp,
  Activity,
  Zap,
  BarChart3,
  DollarSign,
  Database,
} from "lucide-react";

interface MarketStatsProps {
  rows: MarketRow[];
  signals: GeneratedSignal[];
}

export function MarketStats({ rows, signals }: MarketStatsProps) {
  const stats = useMemo(() => {
    let totalVol = 0;
    let gainers = 0;
    let losers = 0;
    let totalMom = 0;

    let maxGainer: MarketRow | null = rows[0] || null;

    for (const r of rows) {
      totalVol += r.quote_volume_24h || 0;
      totalMom += r.momentum_score || 0;
      if (r.price_change_24h > 0) gainers++;
      else if (r.price_change_24h < 0) losers++;

      if (maxGainer && r.price_change_24h > maxGainer.price_change_24h) {
        maxGainer = r;
      }
    }

    const activeSig = signals.filter(
      (s) => s.status === "ACTIVE" || s.status === "PENDING" || s.status === "TP1_HIT"
    ).length;

    let totalPnlPct = 0;
    let totalPnlUsd = 0;
    let profitCount = 0;
    let lossCount = 0;

    for (const s of signals) {
      const pct = typeof s.pnl_pct === "number" ? s.pnl_pct : 0;
      const usd = typeof s.pnl_usd === "number" ? s.pnl_usd : (pct / 100) * 1000;
      totalPnlPct += pct;
      totalPnlUsd += usd;
      if (pct > 0.01) profitCount++;
      else if (pct < -0.01) lossCount++;
    }

    const decided = profitCount + lossCount;
    const winRate = decided > 0 ? Math.round((profitCount / decided) * 100) : 0;

    return {
      totalVolume: totalVol,
      gainersCount: gainers,
      losersCount: losers,
      avgMomentum: rows.length ? Math.round(totalMom / rows.length) : 0,
      activeSignals: activeSig,
      topGainer: maxGainer,
      totalPnlPct,
      totalPnlUsd,
      profitCount,
      lossCount,
      winRate,
    };
  }, [rows, signals]);

  const bullRatio = rows.length
    ? Math.round((stats.gainersCount / rows.length) * 100)
    : 50;

  const isNetProfit = stats.totalPnlPct >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
      {/* 24h Volume */}
      <div className="terminal-panel relative overflow-hidden px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-blue-500 to-indigo-500" />
        <div className="min-w-0">
          <div className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold truncate">
            24h Volume
          </div>
          <div className="font-mono text-sm sm:text-lg font-extrabold text-slate-900 mt-0.5 truncate">
            ${formatVolume(stats.totalVolume)}
          </div>
          <div className="text-[9px] sm:text-[10px] font-mono text-slate-400 mt-0.5 truncate">
            {rows.length} USDT Spot Pairs
          </div>
        </div>
        <div className="p-2 sm:p-2.5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 text-indigo-600 border border-indigo-100 shadow-2xs shrink-0">
          <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>

      {/* Market Breadth */}
      <div className="terminal-panel relative overflow-hidden px-4 py-3 flex flex-col justify-between">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-emerald-500 to-teal-500" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Market Breadth
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs mt-1">
              <span className="text-emerald-600 font-extrabold">{stats.gainersCount}▲</span>
              <span className="text-slate-300">/</span>
              <span className="text-rose-600 font-extrabold">{stats.losersCount}▼</span>
              <span className="text-[10px] text-slate-500 font-semibold">({bullRatio}%)</span>
            </div>
          </div>
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-600 border border-emerald-100 shadow-2xs">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-rose-100 overflow-hidden mt-2">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${bullRatio}%` }}
          />
        </div>
      </div>

      {/* Avg Momentum */}
      <div className="terminal-panel relative overflow-hidden px-4 py-3 flex flex-col justify-between">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-indigo-500 to-violet-500" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
              Avg Momentum
            </div>
            <div className="font-mono text-lg font-extrabold text-indigo-600 mt-0.5">
              {stats.avgMomentum} <span className="text-xs text-slate-400 font-normal">/ 100</span>
            </div>
          </div>
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 border border-indigo-100 shadow-2xs">
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(6, stats.avgMomentum))}%` }}
          />
        </div>
      </div>

      {/* Active Signals */}
      <div className="terminal-panel relative overflow-hidden px-4 py-3 flex items-center justify-between">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-amber-500 to-orange-500" />
        <div>
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
            Active Signals
          </div>
          <div className="font-mono text-lg font-extrabold text-amber-600 mt-0.5">
            {stats.activeSignals} <span className="text-xs text-slate-400 font-normal">live</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
            Win Rate: <strong className="text-emerald-600">{stats.winRate}%</strong>
          </div>
        </div>
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 text-amber-600 border border-amber-100 shadow-2xs">
          <Zap className="w-4 h-4" />
        </div>
      </div>

      {/* Top 24h Gainer */}
      <div className="terminal-panel relative overflow-hidden px-4 py-3 flex items-center justify-between">
        <div className="pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full bg-gradient-to-r from-emerald-500 to-green-500" />
        <div className="overflow-hidden">
          <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
            Top Gainer (24h)
          </div>
          <div className="font-mono text-sm font-extrabold truncate mt-0.5 text-slate-900 flex items-center gap-1.5">
            {stats.topGainer && (
              <CoinIcon
                symbol={stats.topGainer.symbol}
                size={16}
                className="ring-1 ring-slate-200/80"
              />
            )}
            <span>{stats.topGainer ? stats.topGainer.display_symbol : "—"}</span>
          </div>
          <div className="font-mono text-xs font-bold text-emerald-600 mt-0.5">
            {stats.topGainer ? formatPct(stats.topGainer.price_change_24h) : "—"}
          </div>
        </div>
        <div className="p-2.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-green-50 text-emerald-600 border border-emerald-100 shrink-0 shadow-2xs">
          <TrendingUp className="w-4 h-4" />
        </div>
      </div>

      {/* Live Trade Profit / Loss (DB Saved) */}
      <Link
        href="/signals"
        className="terminal-panel relative overflow-hidden px-4 py-3 flex items-center justify-between hover:border-indigo-300 transition-all group"
      >
        <div
          className={`pointer-events-none absolute inset-x-5 top-0 h-[2.5px] rounded-b-full ${
            isNetProfit
              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
              : "bg-gradient-to-r from-rose-500 to-red-500"
          }`}
        />
        <div>
          <div className="flex items-center gap-1 text-[10px] uppercase font-mono tracking-wider text-slate-500 font-semibold">
            <span>Net Trade PnL</span>
            <Database className="w-3 h-3 text-indigo-500" />
          </div>
          <div
            className={`font-mono text-base font-extrabold mt-0.5 ${
              isNetProfit ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {stats.totalPnlUsd >= 0 ? "+$" : "-$"}
            {Math.abs(stats.totalPnlUsd).toFixed(2)}{" "}
            <span className="text-[11px] font-bold">
              ({stats.totalPnlPct >= 0 ? "+" : ""}
              {stats.totalPnlPct.toFixed(2)}%)
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span className="text-emerald-600 font-bold">{stats.profitCount}W</span>
            <span>/</span>
            <span className="text-rose-600 font-bold">{stats.lossCount}L</span>
            <span className="text-slate-400">· DB Saved</span>
          </div>
        </div>
        <div
          className={`p-2.5 rounded-2xl border shrink-0 shadow-2xs ${
            isNetProfit
              ? "bg-emerald-50 text-emerald-600 border-emerald-200/80"
              : "bg-rose-50 text-rose-600 border-rose-200/80"
          }`}
        >
          <DollarSign className="w-4 h-4" />
        </div>
      </Link>
    </div>
  );
}
