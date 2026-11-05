-- Ledgerly migration 0008: IPO Listing Gains & Income Sync

-- 1. Create ipo_gains table
create table if not exists public.ipo_gains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  income_id uuid references public.income(id) on delete set null,
  symbol text not null,
  name text,
  quantity integer not null check (quantity > 0),
  issue_price_paise bigint not null check (issue_price_paise >= 0),
  sold_price_paise bigint not null check (sold_price_paise >= 0),
  charges_paise bigint not null default 0 check (charges_paise >= 0),
  gross_pnl_paise bigint not null,
  net_pnl_paise bigint not null,
  occurred_on date not null,
  note text check (note is null or length(note) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ipo_gains_user_date_idx on public.ipo_gains (user_id, occurred_on desc, created_at desc);
create index if not exists ipo_gains_symbol_idx on public.ipo_gains (user_id, symbol);
create index if not exists ipo_gains_user_deleted_idx on public.ipo_gains (user_id, deleted_at desc) where deleted_at is not null;
create index if not exists ipo_gains_user_active_idx on public.ipo_gains (user_id, occurred_on desc) where deleted_at is null;

create trigger ipo_gains_updated_at before update on public.ipo_gains
  for each row execute function public.set_updated_at();

alter table public.ipo_gains enable row level security;
create policy ipo_gains_all on public.ipo_gains for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
