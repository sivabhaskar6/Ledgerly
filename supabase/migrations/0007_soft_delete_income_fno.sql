-- Ledgerly migration 0007: Soft Delete Support for Income and F&O Trades

-- 1. Add deleted_at column to public.income if not exists
alter table public.income add column if not exists deleted_at timestamptz;
create index if not exists income_user_deleted_idx on public.income (user_id, deleted_at desc) where deleted_at is not null;
create index if not exists income_user_active_idx on public.income (user_id, occurred_on desc) where deleted_at is null;

-- 2. Add deleted_at column to public.fno_trades if not exists
alter table public.fno_trades add column if not exists deleted_at timestamptz;
create index if not exists fno_trades_user_deleted_idx on public.fno_trades (user_id, deleted_at desc) where deleted_at is not null;
create index if not exists fno_trades_user_active_idx on public.fno_trades (user_id, occurred_on desc) where deleted_at is null;

-- 3. Update income_summary function to ignore deleted rows
create or replace function public.income_summary(
  p_today date, p_month_start date, p_month_end date, p_year_start date, p_year_end date
) returns table (today_paise bigint, month_paise bigint, year_paise bigint)
language sql stable security invoker as $$
  select
    coalesce(sum(amount_paise) filter (where occurred_on = p_today and deleted_at is null), 0)::bigint,
    coalesce(sum(amount_paise) filter (where occurred_on between p_month_start and p_month_end and deleted_at is null), 0)::bigint,
    coalesce(sum(amount_paise) filter (where occurred_on between p_year_start and p_year_end and deleted_at is null), 0)::bigint
  from public.income;
$$;
