export type WsStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
export type Sentiment = "BULLISH" | "BEARISH" | "NEUTRAL";
export type SignalType = "LONG" | "SHORT";
export type SignalStatus =
  | "PENDING"
  | "ACTIVE"
  | "TP1_HIT"
  | "TP2_HIT"
  | "STOPPED_OUT"
  | "EXPIRED"
  | "INVALIDATED";

export interface MarketRow {
  symbol: string;
  display_symbol: string;
  last_price: number;
  price_change_15m: number | null;
  price_change_1h: number | null;
  price_change_24h: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  quote_volume_24h: number;
  average_volume_30: number | null;
  volume_ratio: number | null;
  momentum_score: number;
  data_freshness: "live" | "cached";
  updated_at: string;
}

export interface BubblePoint {
  symbol: string;
  display_symbol: string;
  price: number;
  change: number;
  volume: number;
  volume_ratio: number | null;
  momentum_score: number;
}

export interface NewsCard {
  news_id: string;
  ticker: string;
  headline: string;
  sentiment: Sentiment;
  sentiment_score: number;
  impact_level: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  source: string;
  published_at: string | null;
  confidence: number;
  reason: string | null;
}

export type TradeOutcome = "PROFIT" | "LOSS" | "BREAKEVEN" | "OPEN";

export interface GeneratedSignal {
  signal_id: string;
  coin: string;
  symbol: string;
  timeframe: string;
  type: SignalType;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  risk_percentage: number;
  risk_reward_tp1: number;
  risk_reward_tp2: number;
  confidence_score: number;
  confidence_level: string;
  confluence_reasons: string[];
  warnings: string[];
  timestamp: string;
  status: SignalStatus;
  fingerprint: string;
  unlock_risk: string;
  expires_at: string | null;
  current_price?: number | null;
  exit_price?: number | null;
  pnl_pct?: number;
  pnl_usd?: number;
  pnl_r?: number;
  max_profit_pct?: number;
  max_drawdown_pct?: number;
  outcome?: TradeOutcome;
  closed_at?: string | null;
  updated_at?: string | null;
}

export interface TradePerformanceSummary {
  total_trades: number;
  active_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  tp_hits: number;
  sl_hits: number;
  win_rate: number;
  total_pnl_pct: number;
  total_profit_pct: number;
  total_loss_pct: number;
  total_pnl_usd: number;
  total_profit_usd: number;
  total_loss_usd: number;
  avg_pnl_pct: number;
  avg_r_multiple: number;
  best_trade: {
    coin: string;
    type: SignalType;
    pnl_pct: number;
    pnl_usd: number;
  } | null;
  worst_trade: {
    coin: string;
    type: SignalType;
    pnl_pct: number;
    pnl_usd: number;
  } | null;
  db_synced: boolean;
  updated_at: string;
}

export interface CandleDto {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time: string;
  quote_volume: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  utc_now: string;
  binance_ws: WsStatus;
  supabase_configured: boolean;
  llm_configured: boolean;
  news_configured: boolean;
  last_market_update: string | null;
  details: Record<string, unknown>;
}

export interface Benchmark {
  symbol: string;
  price: number;
  change_24h: number;
}

export interface OverviewResponse {
  data_freshness: "live" | "cached";
  updated_at: string | null;
  connection: WsStatus;
  benchmarks: { btc: Benchmark | null; eth: Benchmark | null };
  rows: MarketRow[];
}
