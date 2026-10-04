"use client";

import { useState, useMemo } from "react";
import type { NewsCard, Sentiment } from "@/types";
import { timeAgo } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Flame,
  Search,
  Filter,
  Sparkles,
} from "lucide-react";

interface NewsRadarProps {
  news: NewsCard[];
  selectedTicker?: string;
  onSelectTicker?: (ticker: string) => void;
  isLoading?: boolean;
}

export function NewsRadar({
  news,
  selectedTicker,
  onSelectTicker,
  isLoading = false,
}: NewsRadarProps) {
  const [sentimentFilter, setSentimentFilter] = useState<"ALL" | Sentiment>("ALL");
  const [search, setSearch] = useState("");

  const filteredNews = useMemo(() => {
    const seen = new Set<string>();
    return news.filter((item) => {
      if (seen.has(item.news_id)) {
        return false;
      }
      if (sentimentFilter !== "ALL" && item.sentiment !== sentimentFilter) {
        return false;
      }
      if (selectedTicker && item.ticker.toUpperCase() !== selectedTicker.toUpperCase()) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          item.ticker.toLowerCase().includes(q) ||
          item.headline.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q);
        if (!matches) return false;
      }
      seen.add(item.news_id);
      return true;
    });
  }, [news, sentimentFilter, selectedTicker, search]);

  return (
    <div className="terminal-panel p-4 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/70 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            AI News Radar
          </span>
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80">
            {filteredNews.length} Stories
          </span>
        </div>

        {selectedTicker && onSelectTicker && (
          <button
            type="button"
            onClick={() => onSelectTicker("")}
            className="text-[10px] font-mono text-indigo-600 hover:text-indigo-500 underline cursor-pointer font-semibold"
          >
            Clear {selectedTicker} filter
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2 py-2.5 border-b border-slate-200/70 shrink-0 text-xs">
        <div className="relative flex-1 min-w-[120px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search news & tickers..."
            className="w-full bg-white/80 border border-slate-200/90 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 shadow-2xs"
          />
        </div>

        {/* Sentiment Filter Tabs */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-[11px] font-mono">
          {(["ALL", "BULLISH", "BEARISH", "NEUTRAL"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSentimentFilter(s)}
              className={`px-2 py-0.5 rounded-md transition-all cursor-pointer ${
                sentimentFilter === s
                  ? s === "BULLISH"
                    ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200/80 shadow-2xs"
                    : s === "BEARISH"
                    ? "bg-rose-50 text-rose-700 font-semibold border border-rose-200/80 shadow-2xs"
                    : "bg-white text-indigo-600 font-semibold border border-slate-200/70 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* News Cards Feed */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-2.5 space-y-2.5 pr-1">
        {isLoading && news.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
            Ingesting crypto news & computing LLM sentiment...
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
            No news articles match filter criteria
          </div>
        ) : (
          filteredNews.map((item, idx) => (
            <NewsArticleCard
              key={`${item.news_id}-${item.ticker}-${idx}`}
              item={item}
              onSelectTicker={onSelectTicker}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NewsArticleCard({
  item,
  onSelectTicker,
}: {
  item: NewsCard;
  onSelectTicker?: (ticker: string) => void;
}) {
  const isBull = item.sentiment === "BULLISH";
  const isBear = item.sentiment === "BEARISH";

  const sentimentStyle = isBull
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : isBear
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : "bg-slate-100 text-slate-600 border-slate-200";

  const impactStyle =
    item.impact_level === "HIGH"
      ? "bg-amber-50 text-amber-700 border-amber-200 font-semibold"
      : item.impact_level === "MEDIUM"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-slate-100 text-slate-500 border-slate-200/80";

  return (
    <div className="glass-subcard hover:bg-white/90 hover:border-indigo-200 p-3 transition-all flex flex-col gap-2">
      {/* Ticker & Badges Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => onSelectTicker?.(item.ticker)}
            className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/80 hover:bg-indigo-100 transition-all cursor-pointer"
          >
            {item.ticker}
          </button>

          <span
            className={`flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md border uppercase font-semibold ${sentimentStyle}`}
          >
            {isBull ? (
              <TrendingUp className="w-3 h-3" />
            ) : isBear ? (
              <TrendingDown className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {item.sentiment} {item.sentiment_score.toFixed(2)}
          </span>

          <span
            className={`font-mono text-[9px] px-1.5 py-0.5 rounded-md border uppercase ${impactStyle}`}
          >
            {item.impact_level} IMPACT
          </span>
        </div>

        <span className="text-[10px] font-mono uppercase text-slate-500 px-1.5 py-0.5 rounded-md bg-slate-100/80 border border-slate-200/70">
          {item.category}
        </span>
      </div>

      {/* Headline */}
      <h3 className="text-xs font-semibold text-slate-900 leading-snug">
        {item.headline}
      </h3>

      {/* Rationale reason if provided */}
      {item.reason && (
        <p className="text-[11px] font-mono text-slate-600 bg-slate-50/90 rounded-lg p-2 border border-slate-200/70 leading-normal">
          <span className="text-indigo-600 font-semibold">AI Logic:</span>{" "}
          {item.reason}
        </p>
      )}

      {/* Footer Info: Source and Age */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-200/60">
        <div className="flex items-center gap-1">
          <span className="text-slate-600 font-medium capitalize">{item.source}</span>
          <span>·</span>
          <span>{timeAgo(item.published_at)}</span>
        </div>
        <div className="text-[9px] text-slate-500 font-medium">
          Confidence: {Math.round(item.confidence * 100)}%
        </div>
      </div>
    </div>
  );
}
