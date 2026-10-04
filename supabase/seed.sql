-- Optional seed data. Do not insert fabricated market prices or signals.
-- News/market/signals are produced at runtime from live providers.

insert into public.news_articles (news_id, source, source_quality, headline, url, tickers, is_rejected, rejection_reason)
values (
  'seed-placeholder-do-not-use',
  'internal',
  0.000,
  'Seed row for schema verification only — ignored by the pipeline',
  null,
  '{}',
  true,
  'seed'
)
on conflict (news_id) do nothing;
