"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Header } from "@/components/Header";
import { MarketStats } from "@/components/MarketStats";
import { NewsRadar } from "@/components/NewsRadar";
import { CryptoBubbles } from "@/components/CryptoBubbles";
import { TradingChart } from "@/components/TradingChart";
import { SignalCard } from "@/components/SignalCard";
import type {
  OverviewResponse,
  BubblePoint,
  NewsCard,
  GeneratedSignal,
  CandleDto,
  WsStatus,
  MarketRow,
} from "@/types";
import { apiGet, apiPost } from "@/lib/api";
import {
  Radio,
  SlidersHorizontal,
  AlertTriangle,
  Info,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Layers,
} from "lucide-react";

export default function TerminalDashboard() {
  // Core states
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [bubbles, setBubbles] = useState<BubblePoint[]>([]);
  const [news, setNews] = useState<NewsCard[]>([]);
  const [signals, setSignals] = useState<GeneratedSignal[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [candles, setCandles] = useState<CandleDto[]>([]);
  const [currentTechnicals, setCurrentTechnicals] = useState<any>(null);

  // Timeframe states
  const [bubbleTimeframe, setBubbleTimeframe] = useState<"15m" | "1h" | "24h">("24h");
  const [chartTimeframe, setChartTimeframe] = useState<string>("15m");
  const [scanningSignals, setScanningSignals] = useState(false);

  // Load saved defaultTimeframe from Settings on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("signalix_settings_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.defaultTimeframe) {
          setChartTimeframe(parsed.defaultTimeframe);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Filter states
  const [signalFilter, setSignalFilter] = useState<"ALL" | "PROFIT" | "LOSS" | "LONG" | "SHORT" | "ACTIVE" | "TP_HIT">("ALL");
  const [filterTicker, setFilterTicker] = useState<string>("");

  // Loading & Connection states
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>("DISCONNECTED");

  // 1. Fetch Market Overview
  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiGet<OverviewResponse>("/api/market/overview");
      setOverview(data);
      setWsStatus(data.connection || "CONNECTED");
      if (!selectedSymbol && data.rows && data.rows.length > 0) {
        setSelectedSymbol(data.rows[0].symbol);
      }
    } catch (err) {
      console.warn("Error fetching market overview:", err);
      setWsStatus("RECONNECTING");
    } finally {
      setLoadingOverview(false);
    }
  }, [selectedSymbol]);

  // 2. Fetch Bubbles
  const fetchBubbles = useCallback(async (tf: "15m" | "1h" | "24h") => {
    try {
      const res = await apiGet<{ bubbles: BubblePoint[] }>(
        `/api/market/bubbles?timeframe=${tf}`
      );
      setBubbles(res.bubbles || []);
    } catch (err) {
      console.warn("Error fetching bubbles:", err);
    }
  }, []);

  // 3. Fetch News
  const fetchNews = useCallback(async () => {
    try {
      const res = await apiGet<{ items: NewsCard[] }>("/api/news");
      setNews(res.items || []);
    } catch (err) {
      console.warn("Error fetching news:", err);
    }
  }, []);

  // 4. Fetch Signals
  const fetchSignals = useCallback(async () => {
    try {
      const res = await apiGet<{ items: GeneratedSignal[] }>("/api/signals");
      setSignals(res.items || []);
    } catch (err) {
      console.warn("Error fetching signals:", err);
    }
  }, []);

  // 4b. Trigger Live Signal Scan + Refresh
  const scanAndRefreshSignals = useCallback(async () => {
    setScanningSignals(true);
    try {
      const res = await apiPost<{ items: GeneratedSignal[] }>("/api/signals/scan", {});
      if (res.items) {
        setSignals(res.items);
      } else {
        await fetchSignals();
      }
    } catch {
      await fetchSignals();
    } finally {
      setScanningSignals(false);
    }
  }, [fetchSignals]);

  // 5. Fetch Candles & Technicals for Selected Symbol
  const fetchCandles = useCallback(
    async (sym: string, tf: string) => {
      if (!sym) return;
      setLoadingCandles(true);
      try {
        const res = await apiGet<{
          candles: CandleDto[];
          technicals: any;
          signal: GeneratedSignal | null;
        }>(`/api/market/candles/${sym}?interval=${tf}&limit=140`);

        setCandles(res.candles || []);
        setCurrentTechnicals(res.technicals || null);
      } catch (err) {
        console.warn("Error fetching candles:", err);
      } finally {
        setLoadingCandles(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchOverview();
    fetchBubbles(bubbleTimeframe);
    fetchNews();
    fetchSignals();
  }, [fetchOverview, fetchBubbles, bubbleTimeframe, fetchNews, fetchSignals]);

  // Refresh candles when symbol or chart timeframe changes
  useEffect(() => {
    fetchCandles(selectedSymbol, chartTimeframe);
  }, [selectedSymbol, chartTimeframe, fetchCandles]);

  // Handle Bubble Timeframe change
  const handleBubbleTimeframeChange = (tf: "15m" | "1h" | "24h") => {
    setBubbleTimeframe(tf);
    fetchBubbles(tf);
  };

  // Auto polling refresh every 15 seconds + fast initial sync if any panel is still loading
  useEffect(() => {
    const isInitialEmpty =
      bubbles.length === 0 || news.length === 0 || candles.length === 0;
    const pollMs = isInitialEmpty ? 4000 : 15000;

    const interval = setInterval(() => {
      fetchOverview();
      fetchBubbles(bubbleTimeframe);
      fetchNews();
      fetchSignals();
      if (candles.length === 0) {
        fetchCandles(selectedSymbol, chartTimeframe);
      }
    }, pollMs);
    return () => clearInterval(interval);
  }, [
    bubbles.length,
    news.length,
    candles.length,
    fetchOverview,
    fetchBubbles,
    bubbleTimeframe,
    fetchNews,
    fetchSignals,
    fetchCandles,
    selectedSymbol,
    chartTimeframe,
  ]);

  // WebSocket connection for real-time market updates
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          setWsStatus("CONNECTED");
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "ticker_update" && data.benchmarks) {
              setOverview((prev) =>
                prev ? { ...prev, benchmarks: data.benchmarks } : prev
              );
            }
            if (
              data.type === "signal" ||
              data.type === "new_signal" ||
              data.type === "signal_status"
            ) {
              fetchSignals();
              if (data.type === "signal" && data.signal && typeof window !== "undefined" && "Notification" in window) {
                try {
                  const raw = localStorage.getItem("signalix_settings_v2");
                  const notifyOn = raw ? JSON.parse(raw).notifyBrowser !== false : true;
                  if (notifyOn && Notification.permission === "granted") {
                    const s = data.signal;
                    new Notification(`SIGNALIX · ${s.type} ${s.coin || s.symbol}`, {
                      body: `Entry: $${s.entry} | SL: $${s.sl} | TP1: $${s.tp1} | Score: ${s.confidence_score}/100`,
                      icon: "/logo.png",
                    });
                  }
                } catch {
                  // ignore notification errors
                }
              }
            }
          } catch {
            // ignore non-json messages
          }
        };
        ws.onclose = () => {
          setWsStatus("RECONNECTING");
          reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = () => {
          setWsStatus("DISCONNECTED");
        };
      } catch {
        setWsStatus("DISCONNECTED");
        reconnectTimeout = setTimeout(connect, 8000);
      }
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [fetchSignals]);

  // Handle Symbol Selection from Bubbles, News, or Signals
  const handleSelectSymbol = (sym: string) => {
    const formatted = sym.toUpperCase().includes("USDT")
      ? sym.toUpperCase()
      : `${sym.toUpperCase()}USDT`;
    setSelectedSymbol(formatted);
    setFilterTicker(sym.replace("USDT", ""));
  };

  // Active signal for currently selected chart coin
  const activeChartSignal = useMemo(() => {
    return (
      signals.find(
        (s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase()
      ) || null
    );
  }, [signals, selectedSymbol]);

  // Filtered signals list
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (signalFilter === "PROFIT" && (s.pnl_pct ?? 0) <= 0.01) return false;
      if (signalFilter === "LOSS" && (s.pnl_pct ?? 0) >= -0.01) return false;
      if (signalFilter === "LONG" && s.type !== "LONG") return false;
      if (signalFilter === "SHORT" && s.type !== "SHORT") return false;
      if (
        signalFilter === "ACTIVE" &&
        s.status !== "ACTIVE" &&
        s.status !== "PENDING"
      )
        return false;
      if (
        signalFilter === "TP_HIT" &&
        s.status !== "TP1_HIT" &&
        s.status !== "TP2_HIT"
      )
        return false;
      return true;
    });
  }, [signals, signalFilter]);

  // Live PnL stats for right panel banner
  const panelPnl = useMemo(() => {
    let profitUsd = 0;
    let lossUsd = 0;
    let netPct = 0;
    let wins = 0;
    let losses = 0;
    for (const s of signals) {
      const pct = s.pnl_pct ?? 0;
      const usd = s.pnl_usd ?? (pct / 100) * 1000;
      netPct += pct;
      if (pct > 0.01) {
        profitUsd += usd;
        wins++;
      } else if (pct < -0.01) {
        lossUsd += usd;
        losses++;
      }
    }
    return {
      profitUsd,
      lossUsd,
      netUsd: profitUsd + lossUsd,
      netPct,
      wins,
      losses,
    };
  }, [signals]);

  return (
    <div className="flex flex-col min-h-screen text-slate-900 p-3 md:p-5 gap-3.5">
      {/* 1. Master Header */}
      <Header
        btc={overview?.benchmarks?.btc || null}
        eth={overview?.benchmarks?.eth || null}
        connection={wsStatus}
        lastUpdate={overview?.updated_at || null}
        freshness={overview?.data_freshness || "cached"}
      />

      {/* 2. Top Market Statistics Bar */}
      <MarketStats rows={overview?.rows || []} signals={signals} />

      {/* 3. Main 3-Column Terminal Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1 items-stretch">
        {/* Left Column: AI News Radar (Col 1-3) */}
        <section className="lg:col-span-3 flex flex-col h-[650px] lg:h-[820px]">
          <NewsRadar
            news={news}
            selectedTicker={filterTicker}
            onSelectTicker={(ticker) => {
              setFilterTicker(ticker);
              if (ticker) handleSelectSymbol(ticker);
            }}
            isLoading={news.length === 0}
          />
        </section>

        {/* Center Column: Bubbles (Top) + TradingView Chart (Bottom) (Col 4-8) */}
        <section className="lg:col-span-5 flex flex-col gap-3.5 h-[900px] lg:h-[820px]">
          {/* Top Half: Crypto Bubbles Heatmap */}
          <div className="h-[340px] shrink-0">
            <CryptoBubbles
              bubbles={bubbles}
              selectedTimeframe={bubbleTimeframe}
              onTimeframeChange={handleBubbleTimeframeChange}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={handleSelectSymbol}
              isLoading={bubbles.length === 0}
            />
          </div>

          {/* Bottom Half: TradingView Lightweight Candlestick Chart */}
          <div className="flex-1 min-h-[360px]">
            <TradingChart
              symbol={selectedSymbol}
              candles={candles}
              timeframe={chartTimeframe}
              onTimeframeChange={setChartTimeframe}
              signal={activeChartSignal}
              technicals={currentTechnicals}
              isLoading={loadingCandles}
              onRefresh={() => fetchCandles(selectedSymbol, chartTimeframe)}
            />
          </div>
        </section>

        {/* Right Column: Algorithmic Confluence Signal Radar (Col 9-12) */}
        <section className="lg:col-span-4 flex flex-col h-[650px] lg:h-[820px] terminal-panel p-4 overflow-hidden">
          {/* Signals Panel Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 shrink-0">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
              <h2 className="text-xs uppercase tracking-wider font-bold text-slate-800">
                Confluence Signals
              </h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {signals.length} Saved in DB
              </span>
            </div>

            <button
              type="button"
              onClick={scanAndRefreshSignals}
              disabled={scanningSignals}
              title="Scan and Refresh Signals"
              className="p-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 text-slate-500 hover:text-slate-800 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningSignals ? "animate-spin text-indigo-600" : ""}`} />
            </button>
          </div>

          {/* Live Trade Profit / Loss Summary Strip */}
          {signals.length > 0 && (
            <div className="grid grid-cols-3 gap-2 py-2 border-b border-slate-200/70 shrink-0 font-mono text-center">
              <div className="rounded-lg bg-emerald-50/80 border border-emerald-200/80 px-2 py-1.5">
                <div className="text-[9px] uppercase text-emerald-700 font-semibold">
                  Profit ({panelPnl.wins}W)
                </div>
                <div className="text-xs font-extrabold text-emerald-700">
                  +${panelPnl.profitUsd.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-rose-50/80 border border-rose-200/80 px-2 py-1.5">
                <div className="text-[9px] uppercase text-rose-700 font-semibold">
                  Loss ({panelPnl.losses}L)
                </div>
                <div className="text-xs font-extrabold text-rose-600">
                  -${Math.abs(panelPnl.lossUsd).toFixed(2)}
                </div>
              </div>
              <div
                className={`rounded-lg border px-2 py-1.5 ${
                  panelPnl.netUsd >= 0
                    ? "bg-indigo-50/80 border-indigo-200/80"
                    : "bg-amber-50/80 border-amber-200/80"
                }`}
              >
                <div className="text-[9px] uppercase text-slate-600 font-semibold">
                  Net PnL
                </div>
                <div
                  className={`text-xs font-extrabold ${
                    panelPnl.netUsd >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {panelPnl.netUsd >= 0 ? "+$" : "-$"}
                  {Math.abs(panelPnl.netUsd).toFixed(2)} (
                  {panelPnl.netPct >= 0 ? "+" : ""}
                  {panelPnl.netPct.toFixed(1)}%)
                </div>
              </div>
            </div>
          )}

          {/* Signal Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 py-2 border-b border-slate-200/70 shrink-0 text-[11px] font-mono">
            {(
              [
                { id: "ALL", label: "All" },
                { id: "PROFIT", label: `Profit (${panelPnl.wins})` },
                { id: "LOSS", label: `Loss (${panelPnl.losses})` },
                { id: "LONG", label: "Long" },
                { id: "SHORT", label: "Short" },
                { id: "ACTIVE", label: "Active" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSignalFilter(tab.id)}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                  signalFilter === tab.id
                    ? tab.id === "LONG" || tab.id === "PROFIT"
                      ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 shadow-2xs"
                      : tab.id === "SHORT" || tab.id === "LOSS"
                      ? "bg-rose-50 text-rose-700 font-semibold border border-rose-200 shadow-2xs"
                      : "bg-indigo-600 text-white font-semibold shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 bg-slate-100/70 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Signal Cards Feed */}
          <div className="flex-1 overflow-y-auto scrollbar-thin py-2.5 space-y-3 pr-1">
            {filteredSignals.length === 0 ? (
              <div className="flex flex-col gap-3 h-full">
                <div className="glass-subcard p-4 text-center border-dashed border-slate-300/90">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-2 text-indigo-600 shadow-2xs">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-xs text-slate-800">
                    Strict Confluence Filter Active
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Setups require aligned <strong>15m Supertrend</strong>,{" "}
                    <strong>≥1.5x Volume Spike</strong>, and{" "}
                    <strong>≥0.70 News Sentiment</strong>. Sub-par setups are
                    automatically rejected.
                  </div>
                </div>

                {/* Live Confluence Radar Watchlist */}
                {overview?.rows && overview.rows.length > 0 && (
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500">
                        Top Market Movers Watchlist
                      </span>
                      <span className="text-[10px] font-mono text-indigo-600 font-semibold">
                        Click to inspect chart
                      </span>
                    </div>
                    <div className="space-y-2">
                      {[...overview.rows]
                        .sort(
                          (a, b) =>
                            Math.abs(b.price_change_24h) -
                            Math.abs(a.price_change_24h)
                        )
                        .slice(0, 7)
                        .map((row) => {
                          const up = row.price_change_24h >= 0;
                          const isSel =
                            row.symbol.toUpperCase() ===
                            selectedSymbol.toUpperCase();
                          return (
                            <div
                              key={row.symbol}
                              onClick={() => handleSelectSymbol(row.symbol)}
                              className={`glass-subcard p-3 cursor-pointer flex items-center justify-between transition-all ${
                                isSel
                                  ? "ring-2 ring-indigo-500/70 bg-white"
                                  : "hover:border-indigo-200"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono text-xs font-bold border ${
                                    up
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                                  }`}
                                >
                                  {up ? (
                                    <TrendingUp className="w-4 h-4" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-mono text-xs font-extrabold text-slate-900">
                                    {row.display_symbol}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-500">
                                    Vol Ratio:{" "}
                                    <span className="font-semibold text-slate-700">
                                      {row.volume_ratio
                                        ? `${row.volume_ratio.toFixed(2)}x`
                                        : "1.0x"}
                                    </span>{" "}
                                    · Mom:{" "}
                                    <span className="font-semibold text-indigo-600">
                                      {Math.round(row.momentum_score)}/100
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right font-mono">
                                <div className="text-xs font-bold text-slate-900">
                                  ${row.last_price < 1 ? row.last_price.toFixed(4) : row.last_price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                                <span
                                  className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded-md border mt-0.5 ${
                                    up
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                                      : "bg-rose-50 text-rose-700 border-rose-200/80"
                                  }`}
                                >
                                  {up ? "+" : ""}
                                  {row.price_change_24h.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              filteredSignals.map((sig) => (
                <SignalCard
                  key={sig.signal_id}
                  signal={sig}
                  isSelected={sig.symbol.toUpperCase() === selectedSymbol.toUpperCase()}
                  onViewChart={(sym) => handleSelectSymbol(sym)}
                />
              ))
            )}
          </div>
        </section>
      </main>

      {/* 4. Mandatory Risk & Educational Disclaimer Banner */}
      <footer className="terminal-panel px-4 py-2.5 flex items-center justify-between text-[11px] font-mono text-slate-500">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span>
            <strong className="text-slate-800">Disclaimer:</strong> CryptoConfluence
            AI provides algorithmic market intelligence & educational data. Signals
            are not financial advice and do not guarantee profit. Cryptocurrency
            trading involves substantial risk.
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-slate-400">
          <span>Binance Spot USDT Feed</span>
          <span>•</span>
          <span>Zero Execution Risk (Analysis Only)</span>
        </div>
      </footer>
    </div>
  );
}
