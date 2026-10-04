"use client";

import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/Header";
import type { NewsCard, OverviewResponse, WsStatus, Sentiment } from "@/types";
import { apiGet } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import {
  Newspaper,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Flame,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

export default function NewsPage() {
  const [news, setNews] = useState<NewsCard[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<"ALL" | Sentiment>("ALL");
  const [impactFilter, setImpactFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const fetchNews = async () => {
    try {
      setLoading(true);
      const res = await apiGet<{ items: NewsCard[] }>("/api/news");
      setNews(res.items || []);
    } catch (err) {
      console.warn("Failed to fetch news:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchOverview = async () => {
    try {
      const data = await apiGet<OverviewResponse>("/api/market/overview");
      setOverview(data);
    } catch (err) {
      console.warn("Overview error:", err);
    }
  };

  useEffect(() => {
    fetchNews();
    fetchOverview();
  }, []);

  // Filtered news
  const filtered = useMemo(() => {
    const seen = new Set<string>();
    return news.filter((item) => {
      if (seen.has(item.news_id)) {
        return false;
      }
      if (sentimentFilter !== "ALL" && item.sentiment !== sentimentFilter) {
        return false;
      }
      if (impactFilter !== "ALL" && item.impact_level !== impactFilter) {
        return false;
      }
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          item.ticker.toLowerCase().includes(q) ||
          item.headline.toLowerCase().includes(q) ||
          item.source.toLowerCase().includes(q) ||
          (item.reason && item.reason.toLowerCase().includes(q));
        if (!matches) return false;
      }
      seen.add(item.news_id);
      return true;
    });
  }, [news, sentimentFilter, impactFilter, categoryFilter, search]);

  // Sentiment analytics summary
  const metrics = useMemo(() => {
    if (!news.length) {
      return { total: 0, bullish: 0, bearish: 0, neutral: 0, avgScore: 0, highImpact: 0 };
    }
    const bullish = news.filter((n) => n.sentiment === "BULLISH").length;
    const bearish = news.filter((n) => n.sentiment === "BEARISH").length;
    const neutral = news.filter((n) => n.sentiment === "NEUTRAL").length;
    const highImpact = news.filter((n) => n.impact_level === "HIGH").length;
    const sumScore = news.reduce((acc, n) => acc + n.sentiment_score, 0);

    return {
      total: news.length,
      bullish,
      bearish,
      neutral,
      highImpact,
      avgScore: Number((sumScore / news.length).toFixed(2)),
    };
  }, [news]);

  // Unique categories
  const categories = useMemo(() => {
    const cats = new Set(news.map((n) => n.category));
    return Array.from(cats).sort();
  }, [news]);

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

      {/* Top Sentiment Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="terminal-panel p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-medium">
              Total Ingested
            </div>
            <div className="font-mono text-xl font-bold text-slate-900 mt-0.5">
              {metrics.total}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <Newspaper className="w-4 h-4" />
          </div>
        </div>

        <div className="terminal-panel p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-medium">
              Bullish Signals
            </div>
            <div className="font-mono text-xl font-bold text-emerald-600 mt-0.5">
              {metrics.bullish}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>

        <div className="terminal-panel p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-medium">
              Bearish Signals
            </div>
            <div className="font-mono text-xl font-bold text-rose-600 mt-0.5">
              {metrics.bearish}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
            <TrendingDown className="w-4 h-4" />
          </div>
        </div>

        <div className="terminal-panel p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-medium">
              High Impact
            </div>
            <div className="font-mono text-xl font-bold text-amber-600 mt-0.5">
              {metrics.highImpact}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
            <Flame className="w-4 h-4" />
          </div>
        </div>

        <div className="terminal-panel p-3.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-500 font-medium">
              Avg LLM Sentiment
            </div>
            <div className="font-mono text-xl font-bold text-indigo-600 mt-0.5">
              {metrics.avgScore} <span className="text-xs text-slate-400 font-normal">/ 1.0</span>
            </div>
          </div>
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="terminal-panel p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search news, tickers, keywords..."
            className="w-full bg-white/80 border border-slate-200/90 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500/60 shadow-2xs font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sentiment */}
          <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 border border-slate-200/80 text-xs font-mono">
            {(["ALL", "BULLISH", "BEARISH", "NEUTRAL"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSentimentFilter(s)}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  sentimentFilter === s
                    ? s === "BULLISH"
                      ? "bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200 shadow-2xs"
                      : s === "BEARISH"
                      ? "bg-rose-50 text-rose-700 font-semibold border border-rose-200 shadow-2xs"
                      : "bg-white text-indigo-600 font-semibold border border-slate-200/70 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Impact */}
          <select
            value={impactFilter}
            onChange={(e) => setImpactFilter(e.target.value)}
            className="bg-white/80 border border-slate-200/90 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-indigo-500/60 shadow-2xs"
          >
            <option value="ALL">All Impacts</option>
            <option value="HIGH">High Impact</option>
            <option value="MEDIUM">Medium Impact</option>
            <option value="LOW">Low Impact</option>
          </select>

          {/* Category */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white/80 border border-slate-200/90 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-indigo-500/60 shadow-2xs"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={fetchNews}
            title="Refresh news"
            className="p-1.5 rounded-lg bg-white/80 hover:bg-white border border-slate-200/90 text-slate-500 hover:text-slate-800 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* News Feed Grid */}
      <div className="flex-1">
        {loading && news.length === 0 ? (
          <div className="terminal-panel p-16 flex items-center justify-center text-slate-500 font-mono text-sm">
            Ingesting news feeds and running LLM structured sentiment extraction...
          </div>
        ) : filtered.length === 0 ? (
          <div className="terminal-panel p-16 flex flex-col items-center justify-center text-center text-slate-500 font-mono">
            <Newspaper className="w-10 h-10 mb-3 opacity-40 text-indigo-500" />
            <h3 className="text-base font-bold text-slate-800">
              No News Stories Found
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              No articles match the chosen sentiment, impact, or category filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filtered.map((item, idx) => {
              const isBull = item.sentiment === "BULLISH";
              const isBear = item.sentiment === "BEARISH";

              return (
                <div
                  key={`${item.news_id}-${item.ticker}-${idx}`}
                  className="terminal-panel p-4 flex flex-col gap-3 hover:border-indigo-300 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {item.ticker}
                      </span>
                      <span
                        className={`flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md border uppercase font-semibold ${
                          isBull
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : isBear
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {isBull ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : isBear ? (
                          <TrendingDown className="w-3 h-3" />
                        ) : (
                          <Minus className="w-3 h-3" />
                        )}
                        {item.sentiment} ({item.sentiment_score.toFixed(2)})
                      </span>
                    </div>

                    <span className="text-[10px] font-mono uppercase text-slate-500 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80">
                      {item.category}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                    {item.headline}
                  </h3>

                  {item.reason && (
                    <div className="bg-slate-50/90 rounded-xl p-2.5 border border-slate-200/80 text-xs font-mono text-slate-600">
                      <span className="text-indigo-600 font-bold">
                        Analysis Reason:
                      </span>{" "}
                      {item.reason}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-2 border-t border-slate-200/70 mt-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-600 font-medium capitalize">{item.source}</span>
                      <span>·</span>
                      <span>{timeAgo(item.published_at)}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      Confidence: {Math.round(item.confidence * 100)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
