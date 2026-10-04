# CryptoConfluence AI — Production Master Guide

CryptoConfluence AI is an enterprise-grade cryptocurrency market intelligence and automated trading signal analysis terminal. It combines real-time Binance spot market data, multi-timeframe momentum screening, deterministic technical indicator calculations, automated news ingestion, LLM-powered structured sentiment analysis, and a strict risk/reward confluence engine.

> **Important**: This platform is strictly an analysis and signal-generation system. It does **not** execute real-money trades.

---

## 1. Project Overview & Pipeline

```text
BINANCE MARKET DATA (REST + WebSockets)
        ↓
MULTI-TIMEFRAME MARKET SCREENER (15m, 1h, 24h)
        ↓
TECHNICAL ANALYSIS (Wilder's RSI, Supertrend, EWO, Swings S/R)
        ↓
NEWS INGESTION (RSS Feeds, CryptoPanic, CoinMarketCap)
        ↓
LLM SENTIMENT EXTRACTION (Structured JSON: Bullish/Bearish, Score, Impact, Rationale)
        ↓
CONFLUENCE SCORING ENGINE (Weighted Multi-Factor Confluence: 0–100)
        ↓
RISK & SAFETY FILTERS (Min/Max SL Distance, Min R:R, Extreme RSI, Token Unlock)
        ↓
SIGNAL GENERATION & LIFECYCLE TRACKING (Pending → Active → TP1/TP2 Hit / Stopped Out)
        ↓
SUPABASE STORAGE & REAL-TIME WEBSOCKET DISTRIBUTION
        ↓
DARK FINANCIAL TERMINAL DASHBOARD
```

---

## 2. Architecture & Monorepo Structure

```text
CryptoWeb/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application & background workers
│   │   ├── config.py                   # Pydantic Settings
│   │   ├── engines/
│   │   │   ├── confluence.py           # Multi-factor confluence scorer
│   │   │   ├── news_quality.py         # Spam / referral / freshness filters
│   │   │   ├── risk.py                 # Stop loss, TP1/TP2 calculation & R:R verification
│   │   │   ├── signals.py              # Long/Short setup evaluator & fingerprint deduplication
│   │   │   └── status.py               # Price-based signal lifecycle progression
│   │   ├── indicators/
│   │   │   ├── atr.py                  # Average True Range
│   │   │   ├── engine.py               # Unified indicator calculation pipeline
│   │   │   ├── ewo.py                  # Elliott Wave Oscillator
│   │   │   ├── rsi.py                  # Wilder's RSI (14-period)
│   │   │   ├── supertrend.py           # Supertrend (ATR 10, Mult 3.0)
│   │   │   └── swings.py               # 20-period Swing High/Low & S/R
│   │   ├── routes/
│   │   │   └── api.py                  # REST & WebSocket endpoints
│   │   ├── schemas/                    # Pydantic models for markets, news & signals
│   │   └── services/
│   │       ├── binance_service.py      # Binance REST & WebSocket client
│   │       ├── llm_service.py          # OpenAI / Anthropic / Google Gemini sentiment
│   │       ├── market_state.py         # In-memory central market state & scanner
│   │       ├── news_service.py         # Scheduled news ingestion & deduplication
│   │       ├── notifications.py        # Browser/Webhook alert notification service
│   │       ├── supabase_service.py     # Supabase DB storage & sync
│   │       └── unlock.py               # Token unlock risk verification
│   ├── tests/                          # 23 Automated pytest unit & integration tests
│   └── requirements.txt
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout & dark financial terminal fonts
│   │   ├── page.tsx                    # Main Terminal Dashboard (3-Column Layout)
│   │   ├── dashboard/page.tsx          # Terminal alias route
│   │   ├── signals/page.tsx            # Dedicated Signal History & Analytics
│   │   ├── news/page.tsx               # Dedicated AI News Intelligence Radar
│   │   ├── settings/page.tsx           # Terminal & Risk Engine configuration
│   │   └── api/                        # Next.js Server-side secure proxies
│   ├── components/
│   │   ├── Header.tsx                  # BTC/ETH Benchmarks & Connection status
│   │   ├── MarketStats.tsx             # 24h Volume, Breadth & Momentum metrics
│   │   ├── CryptoBubbles.tsx           # Interactive 15m/1h/24h SVG bubble heatmap
│   │   ├── TradingChart.tsx            # TradingView Lightweight Candlestick Chart
│   │   ├── SignalCard.tsx              # Long/Short cards with Copy & Chart buttons
│   │   ├── NewsRadar.tsx               # AI News feed with sentiment badges
│   │   └── ConnectionStatus.tsx        # Pulsing WebSocket status indicator
│   └── package.json
│
├── supabase/
│   ├── migrations/
│   │   └── 001_init.sql                # Complete PostgreSQL schema with RLS & triggers
│   └── seed.sql
│
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## 3. Requirements

- **Python**: 3.11+ or 3.12
- **Node.js**: 20+ or 22+
- **Database**: Supabase PostgreSQL account (optional for local testing; system runs in-memory if unconfigured)
- **Binance API**: Public endpoints (no API key required)
- **LLM Key** (Optional): OpenAI, Anthropic, or Google Gemini API key. System includes deterministic heuristic fallback if keys are omitted.

---

## 4. Installation & Quickstart

### Step 1: Clone & Setup Environment

```bash
cp .env.example .env
cp .env.example backend/.env
cp .env.example frontend/.env.local
```

### Step 2: Backend Setup

```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### Step 3: Run Backend Tests

```bash
pytest
```
*All 23 deterministic mathematical and risk tests should pass.*

### Step 4: Frontend Setup

```bash
cd ../frontend
npm install
```

---

## 5. Running the Application

### Option A: Local Development

1. **Start Backend (FastAPI)**:
   ```bash
   cd backend
   .venv\Scripts\activate
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   FastAPI API docs will be available at: `http://localhost:8000/docs`

2. **Start Frontend (Next.js)**:
   ```bash
   cd frontend
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

### Option B: Docker Compose

```bash
docker compose up --build
```

---

## 6. Environment Variables Reference

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Frontend URL | `http://localhost:3000` |
| `FASTAPI_BASE_URL` | Backend URL for Next.js server proxy | `http://localhost:8000` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `""` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon public key | `""` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend service key (Never expose to client) | `""` |
| `BINANCE_BASE_URL` | Public Binance API URL | `https://api.binance.com` |
| `BINANCE_WS_URL` | Public Binance WebSocket | `wss://stream.binance.com:9443/ws` |
| `OPENAI_API_KEY` | OpenAI API key for sentiment analysis | `""` |
| `OPENAI_MODEL` | LLM model name | `gpt-4o-mini` |
| `SIGNAL_COOLDOWN_MINUTES` | Cooldown period between duplicate signals | `30` |
| `MIN_STOP_DISTANCE_PCT` | Minimum allowed stop loss distance | `1.5` |
| `MAX_STOP_DISTANCE_PCT` | Maximum allowed stop loss distance | `3.5` |
| `MIN_TP1_R` | Minimum required risk-to-reward for TP1 | `1.5` |
| `MIN_TP2_R` | Minimum required risk-to-reward for TP2 | `2.5` |

---

## 7. Supabase Database Setup

1. Create a new project in [Supabase](https://supabase.com).
2. Go to the **SQL Editor**.
3. Run the migration script in `supabase/migrations/001_init.sql`.
4. Copy the Project URL and Anon Key into `.env`.
5. Copy the Service Role Key into `backend/.env`.

---

## 8. Signal Generation Pipeline Details

A signal is only generated when strict multi-factor criteria are simultaneously satisfied:

1. **News Sentiment**: Sentiment must match setup direction (`BULLISH` for Long, `BEARISH` for Short) with confidence score $\ge 0.70$.
2. **Momentum Confirmation**: 15m or 1h price change must exceed $+0.50\%$ (Long) or $-0.50\%$ (Short).
3. **Volume Participation**: 24h volume ratio compared to 30-period average must be $\ge 1.50\times$.
4. **Supertrend Alignment**: 15m Supertrend must confirm direction (`BULLISH` support or `BEARISH` resistance).
5. **Oscillator Confirmation**: Elliott Wave Oscillator (EWO) must be supportive or expanding momentum.
6. **Risk/Reward Invalidation**:
   - Stop Loss is set $0.5\%$ beyond swing structure or Supertrend band.
   - Stop distance must reside strictly between $1.5\%$ and $3.5\%$.
   - Target 1 must provide $\ge 1.5R$.
   - Target 2 must provide $\ge 2.5R$.
   - Wilder's RSI must not be extreme ($>85$ for Long or $<15$ for Short) unless Aggressive Mode is explicitly toggled.

---

## 9. Testing & Quality Assurance

Automated unit tests cover:
- **Supertrend**: Bullish/Bearish direction, trend flips, ATR calculation.
- **EWO**: Zero crossovers, histogram momentum direction.
- **RSI**: Wilder's smoothing algorithm, state boundaries (Overbought/Oversold).
- **Risk Engine**: Valid/invalid stop placement, target risk-reward validation, buffer math.
- **Signal Evaluator**: Long/Short confluence evaluation, cooldown fingerprint deduplication, extreme RSI rejection.

Run all tests:
```bash
cd backend
.venv\Scripts\pytest -v
```

---

## 10. License & Educational Disclaimer

CryptoConfluence AI provides algorithmic market intelligence and educational information. Signals are not financial advice and do not guarantee profit. Cryptocurrency trading involves substantial risk of capital loss.
