-- Income entries: money earned (e.g. stock-market profit). Deliberately separate from expenses.
-- Original capital, transfers between your accounts and IPO refunds are NOT income and must not be entered here.
create table public.income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0 and length(title) <= 120),
  source text not null check (source in ('stock_profit','ipo_gain','dividend','interest','other')),
  note text check (note is null or length(note) <= 500),
  occurred_on date not null,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index income_user_date_idx on public.income (user_id, occurred_on desc);
create trigger income_updated_at before update on public.income
  for each row execute function public.set_updated_at();

alter table public.income enable row level security;
create policy income_all on public.income for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.income_summary(
  p_today date, p_month_start date, p_month_end date, p_year_start date, p_year_end date
) returns table (today_paise bigint, month_paise bigint, year_paise bigint)
language sql stable security invoker as $$
  select
    coalesce(sum(amount_paise) filter (where occurred_on = p_today), 0)::bigint,
    coalesce(sum(amount_paise) filter (where occurred_on between p_month_start and p_month_end), 0)::bigint,
    coalesce(sum(amount_paise) filter (where occurred_on between p_year_start and p_year_end), 0)::bigint
  from public.income;
$$;
