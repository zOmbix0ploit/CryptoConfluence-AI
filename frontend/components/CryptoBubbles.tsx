"use client";

import { useState, useMemo } from "react";
import type { BubblePoint } from "@/types";
import { formatPct, formatPrice, formatVolume } from "@/lib/utils";
import { Search, Info } from "lucide-react";

interface CryptoBubblesProps {
  bubbles: BubblePoint[];
  selectedTimeframe: "15m" | "1h" | "24h";
  onTimeframeChange: (tf: "15m" | "1h" | "24h") => void;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  isLoading?: boolean;
}

export function CryptoBubbles({
  bubbles,
  selectedTimeframe,
  onTimeframeChange,
  selectedSymbol,
  onSelectSymbol,
  isLoading = false,
}: CryptoBubblesProps) {
  const [search, setSearch] = useState("");
  const [hoveredBubble, setHoveredBubble] = useState<BubblePoint | null>(null);

  // Filtered bubbles
  const filtered = useMemo(() => {
    let list = bubbles;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.symbol.toLowerCase().includes(q) ||
          b.display_symbol.toLowerCase().includes(q)
      );
    }
    return list;
  }, [bubbles, search]);

  // Volume range for bubble sizing
  const { minVol, maxVol } = useMemo(() => {
    if (!filtered.length) return { minVol: 1, maxVol: 10 };
    let min = Infinity;
    let max = -Infinity;
    for (const b of filtered) {
      if (b.volume < min) min = b.volume;
      if (b.volume > max) max = b.volume;
    }
    return { minVol: Math.max(1, min), maxVol: Math.max(min + 1, max) };
  }, [filtered]);

  // Helper to scale volume logarithmically to bubble diameter (in px)
  const getBubbleSize = (vol: number) => {
    const minSize = 48;
    const maxSize = 96;
    if (maxVol <= minVol) return (minSize + maxSize) / 2;
    const logMin = Math.log(minVol);
    const logMax = Math.log(maxVol);
    const logCurrent = Math.log(Math.max(minVol, vol));
    const ratio = (logCurrent - logMin) / (logMax - logMin);
    return Math.round(minSize + ratio * (maxSize - minSize));
  };

  return (
    <div className="terminal-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-slate-800">
            Market Heatmap Bubbles
          </span>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80">
            {filtered.length} Assets
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coin..."
              className="bg-white/80 border border-slate-200/90 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 shadow-2xs w-28 md:w-36 transition-all"
            />
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            {(["15m", "1h", "24h"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  selectedTimeframe === tf
                    ? "bg-white text-indigo-600 font-semibold shadow-2xs border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bubble Container Area */}
      <div className="relative flex-1 overflow-y-auto scrollbar-thin p-3 min-h-[220px]">
        {isLoading && bubbles.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
            Loading Binance market bubbles...
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-400 text-xs font-mono">
            No assets match current criteria
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {filtered.map((bubble) => {
              const size = getBubbleSize(bubble.volume);
              const isUp = bubble.change >= 0;
              const isSelected = bubble.symbol === selectedSymbol;

              // Frosted glass orb colors for light theme
              const colorBg = isUp
                ? "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.92) 0%, rgba(209, 250, 229, 0.85) 55%, rgba(16, 185, 129, 0.25) 100%)"
                : "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.92) 0%, rgba(254, 226, 226, 0.85) 55%, rgba(244, 63, 94, 0.25) 100%)";

              const borderColor = isSelected
                ? "#4f46e5"
                : isUp
                ? "rgba(16, 185, 129, 0.45)"
                : "rgba(244, 63, 94, 0.45)";

              const glow = isSelected
                ? "0 8px 20px -2px rgba(79, 70, 229, 0.3), inset 0 2px 4px rgba(255, 255, 255, 0.95)"
                : isUp
                ? "0 6px 16px -4px rgba(16, 185, 129, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.95)"
                : "0 6px 16px -4px rgba(244, 63, 94, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.95)";

              return (
                <div
                  key={bubble.symbol}
                  onClick={() => onSelectSymbol(bubble.symbol)}
                  onMouseEnter={() => setHoveredBubble(bubble)}
                  onMouseLeave={() => setHoveredBubble(null)}
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    background: colorBg,
                    borderColor: borderColor,
                    boxShadow: glow,
                  }}
                  className={`relative rounded-full border flex flex-col items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110 hover:z-20 select-none backdrop-blur-md group ${
                    isSelected ? "ring-2 ring-indigo-500/70" : ""
                  }`}
                >
                  <span
                    className={`font-mono font-bold text-[11px] leading-tight truncate max-w-[85%] text-center ${
                      isUp ? "text-emerald-950" : "text-rose-950"
                    }`}
                  >
                    {bubble.display_symbol.replace("/USDT", "")}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-semibold leading-tight mt-0.5 ${
                      isUp ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {formatPct(bubble.change)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Hover Floating Details Card */}
        {hoveredBubble && (
          <div className="pointer-events-none absolute bottom-3 left-3 bg-white/90 border border-slate-200/90 rounded-2xl p-3.5 shadow-xl backdrop-blur-xl text-xs font-mono z-30 min-w-[215px]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1.5 mb-2">
              <span className="font-bold text-slate-900 text-sm">
                {hoveredBubble.display_symbol}
              </span>
              <span
                className={`font-bold ${
                  hoveredBubble.change >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatPct(hoveredBubble.change)} ({selectedTimeframe})
              </span>
            </div>

            <div className="space-y-1 text-slate-600 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Price:</span>
                <span className="font-bold text-slate-900">
                  ${formatPrice(hoveredBubble.price)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">24h Volume:</span>
                <span className="font-medium text-slate-800">${formatVolume(hoveredBubble.volume)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Vol Ratio:</span>
                <span
                  className={
                    hoveredBubble.volume_ratio &&
                    hoveredBubble.volume_ratio >= 1.5
                      ? "text-emerald-600 font-bold"
                      : "text-slate-600"
                  }
                >
                  {hoveredBubble.volume_ratio
                    ? `${hoveredBubble.volume_ratio.toFixed(2)}x`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Momentum:</span>
                <span className="text-indigo-600 font-bold">
                  {hoveredBubble.momentum_score}/100
                </span>
              </div>
            </div>
            <div className="mt-2 text-[9px] text-indigo-600 flex items-center gap-1 border-t border-slate-200/70 pt-1.5 font-medium">
              <Info className="w-3 h-3 shrink-0" />
              <span>Click to view technical chart</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
