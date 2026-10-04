"use client";

import { useState } from "react";
import type { GeneratedSignal } from "@/types";
import { formatPrice, timeAgo } from "@/lib/utils";
import { CoinIcon } from "@/components/CoinIcon";
import {
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  LineChart,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  DollarSign,
} from "lucide-react";

interface SignalCardProps {
  signal: GeneratedSignal;
  onViewChart?: (symbol: string) => void;
  isSelected?: boolean;
  positionSize?: number;
}

export function SignalCard({
  signal,
  onViewChart,
  isSelected = false,
  positionSize = 1000,
}: SignalCardProps) {
  const [copied, setCopied] = useState(false);

  const isLong = signal.type === "LONG";
  const currentPrice = signal.exit_price ?? signal.current_price ?? signal.entry;
  const pnlPct =
    typeof signal.pnl_pct === "number"
      ? signal.pnl_pct
      : signal.entry > 0
      ? ((currentPrice - signal.entry) / signal.entry) * 100 * (isLong ? 1 : -1)
      : 0;
  const pnlUsd = (pnlPct / 100) * positionSize;
  const pnlR =
    typeof signal.pnl_r === "number"
      ? signal.pnl_r
      : signal.risk_percentage > 0
      ? pnlPct / signal.risk_percentage
      : 0;
  const isProfit = pnlPct > 0.01;
  const isLoss = pnlPct < -0.01;

  // Progress bar between SL (0%) -> Entry (35%) -> TP1 (70%) -> TP2 (100%)
  const totalSpan = Math.abs(signal.tp2 - signal.sl);
  const progressPct =
    totalSpan > 0
      ? Math.max(
          4,
          Math.min(
            100,
            isLong
              ? ((currentPrice - signal.sl) / totalSpan) * 100
              : ((signal.sl - currentPrice) / totalSpan) * 100
          )
        )
      : 40;

  const handleCopy = () => {
    const sign = pnlPct >= 0 ? "+" : "";
    const text = `🎯 CRYPTOCONFLUENCE SIGNAL: ${signal.coin} (${signal.type})
Timeframe: ${signal.timeframe} | Status: ${signal.status}
Entry: $${formatPrice(signal.entry)} | Live: $${formatPrice(currentPrice)}
Trade PnL: ${sign}${pnlPct.toFixed(2)}% (${sign}$${pnlUsd.toFixed(2)} on $${positionSize})
Stop Loss: $${formatPrice(signal.sl)} (Risk: ${signal.risk_percentage.toFixed(2)}%)
TP1: $${formatPrice(signal.tp1)} (R:R 1:${signal.risk_reward_tp1.toFixed(2)})
TP2: $${formatPrice(signal.tp2)} (R:R 1:${signal.risk_reward_tp2.toFixed(2)})
Confidence: ${signal.confidence_score}% (${signal.confidence_level})
Confluence:
${signal.confluence_reasons.map((r) => ` • ${r}`).join("\n")}
${signal.warnings.length ? `Warnings:\n${signal.warnings.map((w) => ` ⚠️ ${w}`).join("\n")}` : ""}
Generated: ${new Date(signal.timestamp).toUTCString()}
[CryptoConfluence AI — Algorithmic Market Intelligence]`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Status badge styling
  const statusConfig = {
    ACTIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    TP1_HIT: "bg-emerald-100/80 text-emerald-800 border-emerald-300",
    TP2_HIT: "bg-emerald-100 text-emerald-900 border-emerald-400 font-bold",
    STOPPED_OUT: "bg-rose-50 text-rose-700 border-rose-200",
    EXPIRED: "bg-slate-100 text-slate-500 border-slate-200",
    INVALIDATED: "bg-slate-100 text-slate-500 border-slate-200",
  }[signal.status] || "bg-slate-100 text-slate-600";

  return (
    <div
      className={`glass-subcard p-4 flex flex-col gap-3 transition-all ${
        isSelected
          ? "border-indigo-400 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500/30 bg-white/95"
          : "hover:border-slate-300 hover:bg-white/90"
      }`}
    >
      {/* Top Header: Coin, Type, Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CoinIcon
            symbol={signal.symbol || signal.coin}
            size={20}
            className="ring-1 ring-slate-200/80"
          />
          <span className="font-mono text-base font-bold text-slate-900">
            {signal.coin}
          </span>
          <span
            className={`flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
              isLong
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {isLong ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" />
            )}
            {signal.type}
          </span>
          <span className="text-[11px] font-mono text-slate-600 px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200/80">
            {signal.timeframe}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-md border ${statusConfig}`}
          >
            {signal.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {/* Live Trade Profit / Loss (PnL) Banner */}
      <div
        className={`rounded-xl p-3 border transition-all ${
          isProfit
            ? "bg-gradient-to-r from-emerald-50/90 via-teal-50/60 to-white border-emerald-200/90"
            : isLoss
            ? "bg-gradient-to-r from-rose-50/90 via-red-50/60 to-white border-rose-200/90"
            : "bg-slate-50/90 border-slate-200/80"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                  isProfit
                    ? "bg-emerald-500 text-white border-emerald-600"
                    : isLoss
                    ? "bg-rose-500 text-white border-rose-600"
                    : "bg-slate-200 text-slate-700 border-slate-300"
                }`}
              >
                {isProfit ? "▲ PROFIT" : isLoss ? "▼ LOSS" : "• BREAKEVEN"}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Live:{" "}
                <strong className="text-slate-900">
                  ${formatPrice(currentPrice)}
                </strong>
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2">
              <span>
                R-Multiple:{" "}
                <strong
                  className={
                    pnlR > 0
                      ? "text-emerald-700"
                      : pnlR < 0
                      ? "text-rose-700"
                      : "text-slate-700"
                  }
                >
                  {pnlR >= 0 ? "+" : ""}
                  {pnlR.toFixed(2)}R
                </strong>
              </span>
              {typeof signal.max_profit_pct === "number" &&
                signal.max_profit_pct > 0 && (
                  <>
                    <span>·</span>
                    <span>
                      Peak:{" "}
                      <strong className="text-emerald-700">
                        +{signal.max_profit_pct.toFixed(2)}%
                      </strong>
                    </span>
                  </>
                )}
            </div>
          </div>

          <div className="text-right font-mono">
            <div
              className={`text-sm font-extrabold tracking-tight ${
                isProfit
                  ? "text-emerald-700"
                  : isLoss
                  ? "text-rose-600"
                  : "text-slate-700"
              }`}
            >
              {pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(2)}%
            </div>
            <div
              className={`text-xs font-bold flex items-center justify-end gap-0.5 ${
                isProfit
                  ? "text-emerald-600"
                  : isLoss
                  ? "text-rose-600"
                  : "text-slate-500"
              }`}
            >
              <span>
                {pnlUsd >= 0 ? "+$" : "-$"}
                {Math.abs(pnlUsd).toFixed(2)}
              </span>
              <span className="text-[9px] text-slate-400 font-normal">
                /${positionSize}
              </span>
            </div>
          </div>
        </div>

        {/* SL -> Entry -> TP1 -> TP2 Visual Progress Track */}
        <div className="mt-2">
          <div className="flex justify-between text-[9px] font-mono text-slate-400 mb-0.5">
            <span className="text-rose-500 font-semibold">SL</span>
            <span className="text-blue-600 font-semibold">ENTRY</span>
            <span className="text-emerald-600 font-semibold">TP1</span>
            <span className="text-emerald-700 font-bold">TP2</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200/90 overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isProfit
                  ? "bg-gradient-to-r from-blue-500 to-emerald-500"
                  : isLoss
                  ? "bg-gradient-to-r from-rose-500 to-amber-500"
                  : "bg-indigo-500"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Confidence Score Bar */}
      <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-200/70">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-slate-500 font-mono font-medium">
            Confluence Score
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-indigo-600 font-mono font-bold">
              {signal.confidence_score}/100
            </span>
            <span className="text-[10px] uppercase font-mono font-semibold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/80">
              {signal.confidence_level}
            </span>
          </div>
        </div>
        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              signal.confidence_score >= 80
                ? "bg-emerald-500"
                : signal.confidence_score >= 65
                ? "bg-indigo-500"
                : "bg-amber-500"
            }`}
            style={{ width: `${Math.min(100, signal.confidence_score)}%` }}
          />
        </div>
      </div>

      {/* Price Target Matrix */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {/* Entry */}
        <div className="bg-white/80 rounded-xl p-2 border border-slate-200/80 shadow-2xs">
          <div className="text-[10px] uppercase font-mono text-slate-500">
            Entry
          </div>
          <div className="font-mono text-xs font-bold text-blue-600 mt-0.5">
            ${formatPrice(signal.entry)}
          </div>
        </div>

        {/* Stop Loss */}
        <div className="bg-white/80 rounded-xl p-2 border border-slate-200/80 shadow-2xs">
          <div className="text-[10px] uppercase font-mono text-slate-500">
            Stop Loss
          </div>
          <div className="font-mono text-xs font-bold text-rose-600 mt-0.5">
            ${formatPrice(signal.sl)}
          </div>
          <div className="text-[9px] font-mono text-rose-500 font-medium">
            -{signal.risk_percentage.toFixed(2)}%
          </div>
        </div>

        {/* TP1 */}
        <div className="bg-white/80 rounded-xl p-2 border border-slate-200/80 shadow-2xs">
          <div className="text-[10px] uppercase font-mono text-slate-500">
            TP1 (1:{signal.risk_reward_tp1.toFixed(1)})
          </div>
          <div className="font-mono text-xs font-bold text-emerald-600 mt-0.5">
            ${formatPrice(signal.tp1)}
          </div>
        </div>

        {/* TP2 */}
        <div className="bg-white/80 rounded-xl p-2 border border-slate-200/80 shadow-2xs">
          <div className="text-[10px] uppercase font-mono text-slate-500">
            TP2 (1:{signal.risk_reward_tp2.toFixed(1)})
          </div>
          <div className="font-mono text-xs font-bold text-emerald-600 mt-0.5">
            ${formatPrice(signal.tp2)}
          </div>
        </div>
      </div>

      {/* Confluence Reasons */}
      <div className="space-y-1">
        <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold tracking-wider">
          Confluence Criteria
        </div>
        <div className="space-y-1">
          {signal.confluence_reasons.map((reason, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 text-[11px] font-mono text-slate-700 leading-tight"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings (if any) */}
      {signal.warnings && signal.warnings.length > 0 && (
        <div className="space-y-1 border-t border-slate-200/70 pt-2">
          {signal.warnings.map((warn, idx) => (
            <div
              key={idx}
              className="flex items-start gap-1.5 text-[10px] font-mono text-amber-700 leading-tight"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer Timestamp, DB Badge & Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 mt-auto">
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(signal.timestamp)}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50/90 text-indigo-700 border border-indigo-200/70 font-semibold">
            <Database className="w-2.5 h-2.5" />
            DB Saved
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Chart Button */}
          {onViewChart && (
            <button
              type="button"
              onClick={() => onViewChart(signal.symbol)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200/90 text-xs font-mono text-slate-700 hover:text-slate-900 shadow-2xs cursor-pointer transition-all"
            >
              <LineChart className="w-3.5 h-3.5 text-indigo-600" />
              <span>Chart</span>
            </button>
          )}

          {/* Copy Signal Button */}
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-mono transition-all cursor-pointer shadow-2xs ${
              copied
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-600"
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
