-- Add Trade Profit / Loss (PnL) tracking columns to public.signals
alter table public.signals
  add column if not exists current_price numeric,
  add column if not exists exit_price numeric,
  add column if not exists pnl_pct numeric not null default 0,
  add column if not exists pnl_usd numeric not null default 0,
  add column if not exists pnl_r numeric not null default 0,
  add column if not exists max_profit_pct numeric not null default 0,
  add column if not exists max_drawdown_pct numeric not null default 0,
  add column if not exists outcome text not null default 'OPEN'
    check (outcome in ('PROFIT', 'LOSS', 'BREAKEVEN', 'OPEN')),
  add column if not exists closed_at timestamptz;

create index if not exists signals_outcome_idx on public.signals (outcome, created_at desc);
