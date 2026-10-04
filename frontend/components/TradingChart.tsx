"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  CrosshairMode,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import type { CandleDto, GeneratedSignal } from "@/types";
import { formatPrice, formatPct } from "@/lib/utils";
import { Maximize2, RefreshCw } from "lucide-react";

interface TradingChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  candles: CandleDto[];
  timeframe: string;
  onTimeframeChange: (tf: string) => void;
  signal?: GeneratedSignal | null;
  technicals?: {
    rsi?: { rsi: number; rsi_state: string };
    supertrend?: { trend: string; value: number; support: number | null; resistance: number | null };
    ewo?: { ewo: number; state: string };
    swings?: {
      recent_swing_high: number;
      recent_swing_low: number;
      major_resistance: number;
      major_support: number;
    };
  } | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export function TradingChart({
  symbol,
  candles,
  timeframe,
  onTimeframeChange,
  signal,
  technicals,
  isLoading = false,
  onRefresh,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const supertrendSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [activeLegend, setActiveLegend] = useState<{
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // Initialize or recreate chart
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "var(--font-geist-mono), monospace",
      },
      grid: {
        vertLines: { color: "rgba(15, 23, 42, 0.045)" },
        horzLines: { color: "rgba(15, 23, 42, 0.045)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(79, 70, 229, 0.35)",
          width: 1,
          style: LineStyle.Dashed,
        },
        horzLine: {
          color: "rgba(79, 70, 229, 0.35)",
          width: 1,
          style: LineStyle.Dashed,
        },
      },
      rightPriceScale: {
        borderColor: "rgba(15, 23, 42, 0.08)",
        scaleMargins: {
          top: 0.1,
          bottom: 0.22,
        },
      },
      timeScale: {
        borderColor: "rgba(15, 23, 42, 0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });
    candleSeriesRef.current = candleSeries;

    // Volume Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume_scale",
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale("volume_scale").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Supertrend Line Series
    const supertrendSeries = chart.addSeries(LineSeries, {
      color: "#a855f7",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    supertrendSeriesRef.current = supertrendSeries;

    // Subscribe to crosshair move for legend
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        if (candles.length > 0) {
          const last = candles[candles.length - 1];
          setActiveLegend({
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
          });
        }
        return;
      }
      const data = param.seriesData.get(candleSeries) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
      const vol = param.seriesData.get(volumeSeries) as
        | { value: number }
        | undefined;

      if (data) {
        setActiveLegend({
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: vol?.value ?? 0,
        });
      }
    });

    // Resize observer
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  // Update chart data whenever candles or signals change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || !candles.length)
      return;

    // Format and sort candles
    const formattedCandles = candles
      .map((c) => ({
        time: Math.floor(new Date(c.open_time).getTime() / 1000) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => (Number(a.time) - Number(b.time)));

    const formattedVolume = candles
      .map((c) => ({
        time: Math.floor(new Date(c.open_time).getTime() / 1000) as Time,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(239, 68, 68, 0.3)",
      }))
      .sort((a, b) => (Number(a.time) - Number(b.time)));

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    // Default legend to latest candle
    const latest = candles[candles.length - 1];
    setActiveLegend({
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
    });

    // Draw Supertrend level line if available
    if (supertrendSeriesRef.current && technicals?.supertrend?.value) {
      const stColor =
        technicals.supertrend.trend === "BULLISH" ? "#22c55e" : "#ef4444";
      supertrendSeriesRef.current.applyOptions({ color: stColor });
      const stVal = technicals.supertrend.value;
      const stData = formattedCandles.slice(-30).map((c) => ({
        time: c.time,
        value: stVal,
      }));
      supertrendSeriesRef.current.setData(stData);
    }

    // Add signal levels & swing levels via price lines
    // Note: Remove old price lines first if supported or re-set
    const cs = candleSeriesRef.current;

    // Draw active signal levels
    if (signal && signal.symbol.toUpperCase() === symbol.toUpperCase()) {
      cs.createPriceLine({
        price: signal.entry,
        color: "#60a5fa",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `ENTRY (${signal.type})`,
      });
      cs.createPriceLine({
        price: signal.sl,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SL",
      });
      cs.createPriceLine({
        price: signal.tp1,
        color: "#22c55e",
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "TP1",
      });
      cs.createPriceLine({
        price: signal.tp2,
        color: "#10b981",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: "TP2",
      });
    }

    // Swing Support & Resistance
    if (technicals?.swings) {
      const { recent_swing_high, recent_swing_low } = technicals.swings;
      if (recent_swing_high) {
        cs.createPriceLine({
          price: recent_swing_high,
          color: "rgba(244, 63, 94, 0.6)",
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: "RES",
        });
      }
      if (recent_swing_low) {
        cs.createPriceLine({
          price: recent_swing_low,
          color: "rgba(16, 185, 129, 0.6)",
          lineWidth: 1,
          lineStyle: LineStyle.LargeDashed,
          axisLabelVisible: true,
          title: "SUPP",
        });
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, signal, symbol, technicals]);

  const fitContent = useCallback(() => {
    chartRef.current?.timeScale().fitContent();
  }, []);

  const latestCandle = candles[candles.length - 1];
  const priceChange = latestCandle
    ? ((latestCandle.close - latestCandle.open) / latestCandle.open) * 100
    : 0;

  return (
    <div className="terminal-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Chart Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/70 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold font-mono text-slate-900">
              {symbol.replace("USDT", "/USDT")}
            </h2>
            {latestCandle && (
              <span className="font-mono text-base font-bold text-slate-800">
                ${formatPrice(latestCandle.close)}
              </span>
            )}
            {latestCandle && (
              <span
                className={`font-mono text-xs font-bold ${
                  priceChange >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {formatPct(priceChange)}
              </span>
            )}
          </div>

          {technicals?.supertrend && (
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                technicals.supertrend.trend === "BULLISH"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
            >
              ST: {technicals.supertrend.trend}
            </span>
          )}

          {technicals?.rsi && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200/80 hidden sm:inline-block">
              RSI: {technicals.rsi.rsi.toFixed(1)} ({technicals.rsi.rsi_state})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            {(["15m", "1h", "4h", "1d"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  timeframe.toLowerCase() === tf.toLowerCase()
                    ? "bg-white text-indigo-600 font-semibold shadow-2xs border border-slate-200/60"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Fit view button */}
          <button
            type="button"
            onClick={fitContent}
            title="Reset Chart Zoom"
            className="p-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 text-slate-500 hover:text-slate-800 shadow-2xs cursor-pointer transition-all"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Refresh button */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh Candles"
              className={`p-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/80 text-slate-500 hover:text-slate-800 shadow-2xs cursor-pointer transition-all ${
                isLoading ? "animate-spin text-indigo-600" : ""
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* OHLCV Legend Bar */}
      {activeLegend && (
        <div className="flex flex-wrap items-center gap-3 pt-2 text-[10px] font-mono text-slate-500 shrink-0">
          <div>
            O: <span className="text-slate-800 font-semibold">${formatPrice(activeLegend.open)}</span>
          </div>
          <div>
            H: <span className="text-emerald-600 font-semibold">${formatPrice(activeLegend.high)}</span>
          </div>
          <div>
            L: <span className="text-rose-600 font-semibold">${formatPrice(activeLegend.low)}</span>
          </div>
          <div>
            C: <span className="text-slate-800 font-semibold">${formatPrice(activeLegend.close)}</span>
          </div>
          <div>
            Vol: <span className="text-slate-800 font-semibold">{activeLegend.volume.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Chart Canvas Area */}
      <div className="relative flex-1 w-full min-h-[320px] mt-2">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-xs text-xs font-mono text-slate-500">
            Loading {symbol} candlesticks...
          </div>
        )}
      </div>
    </div>
  );
}
