-- CryptoConfluence AI schema
-- Apply in Supabase SQL editor or via supabase db push.
-- All timestamps are stored as timestamptz (UTC).

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  default_timeframe text not null default '15m',
  watchlist jsonb not null default '[]'::jsonb,
  notify_browser boolean not null default true,
  notify_email boolean not null default false,
  notify_discord boolean not null default false,
  notify_telegram boolean not null default false,
  aggressive_mode boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  news_id text not null unique,
  source text not null,
  source_quality numeric(4,3) not null default 0.500,
  headline text not null,
  url text,
  body text,
  published_at timestamptz,
  tickers text[] not null default '{}',
  is_rejected boolean not null default false,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists news_articles_published_idx on public.news_articles (published_at desc);
create index if not exists news_articles_tickers_idx on public.news_articles using gin (tickers);

create table if not exists public.news_sentiments (
  id uuid primary key default gen_random_uuid(),
  news_id text not null references public.news_articles (news_id) on delete cascade,
  ticker text not null,
  sentiment text not null check (sentiment in ('BULLISH', 'BEARISH', 'NEUTRAL')),
  sentiment_score numeric(4,3) not null check (sentiment_score >= 0 and sentiment_score <= 1),
  category text not null,
  impact_level text not null check (impact_level in ('HIGH', 'MEDIUM', 'LOW')),
  reason text,
  confidence numeric(4,3) not null,
  llm_provider text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (news_id, ticker)
);

create index if not exists news_sentiments_ticker_idx on public.news_sentiments (ticker, created_at desc);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  last_price numeric not null,
  price_change_15m numeric,
  price_change_1h numeric,
  price_change_24h numeric,
  high_24h numeric,
  low_24h numeric,
  volume_24h numeric,
  quote_volume_24h numeric,
  volume_ratio numeric,
  captured_at timestamptz not null default timezone('utc', now())
);

create index if not exists market_snapshots_symbol_time_idx on public.market_snapshots (symbol, captured_at desc);

create table if not exists public.technical_snapshots (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  timeframe text not null,
  rsi numeric,
  rsi_state text,
  supertrend_trend text,
  supertrend_value numeric,
  ewo numeric,
  ewo_state text,
  swing_high numeric,
  swing_low numeric,
  payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default timezone('utc', now())
);

create index if not exists technical_snapshots_symbol_tf_idx
  on public.technical_snapshots (symbol, timeframe, captured_at desc);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  coin text not null,
  symbol text not null,
  timeframe text not null,
  type text not null check (type in ('LONG', 'SHORT')),
  setup_type text not null default 'momentum_confluence',
  entry numeric not null,
  sl numeric not null,
  tp1 numeric not null,
  tp2 numeric not null,
  risk_percentage numeric not null,
  risk_reward_tp1 numeric not null,
  risk_reward_tp2 numeric not null,
  confidence_score integer not null,
  confidence_level text not null,
  confluence_reasons jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'ACTIVE', 'TP1_HIT', 'TP2_HIT', 'STOPPED_OUT', 'EXPIRED', 'INVALIDATED')),
  unlock_risk text not null default 'UNKNOWN',
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists signals_status_idx on public.signals (status, created_at desc);
create index if not exists signals_symbol_idx on public.signals (symbol, type, timeframe, created_at desc);
create index if not exists signals_fingerprint_idx on public.signals (fingerprint, created_at desc);

create table if not exists public.signal_events (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals (id) on delete cascade,
  status text not null,
  price numeric,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists signal_events_signal_idx on public.signal_events (signal_id, created_at);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_sentiments enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.technical_snapshots enable row level security;
alter table public.signals enable row level security;
alter table public.signal_events enable row level security;

drop policy if exists "profiles_own_row" on public.profiles;
create policy "profiles_own_row" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "preferences_own_row" on public.user_preferences;
create policy "preferences_own_row" on public.user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public_read_news" on public.news_articles;
create policy "public_read_news" on public.news_articles
  for select using (true);

drop policy if exists "public_read_sentiment" on public.news_sentiments;
create policy "public_read_sentiment" on public.news_sentiments
  for select using (true);

drop policy if exists "public_read_market" on public.market_snapshots;
create policy "public_read_market" on public.market_snapshots
  for select using (true);

drop policy if exists "public_read_technicals" on public.technical_snapshots;
create policy "public_read_technicals" on public.technical_snapshots
  for select using (true);

drop policy if exists "public_read_signals" on public.signals;
create policy "public_read_signals" on public.signals
  for select using (true);

drop policy if exists "public_read_signal_events" on public.signal_events;
create policy "public_read_signal_events" on public.signal_events
  for select using (true);

-- Writes are performed by the backend with the service role, which bypasses RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
