-- Ledgerly migration 0004: Import Batches, Transfers, Investments, and Income Account link

-- 1. Import Batches
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text not null,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists import_batches_user_idx on public.import_batches (user_id, created_at desc);

alter table public.import_batches enable row level security;
create policy import_batches_all on public.import_batches for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 2. Account Transfers (Between user's accounts; strictly NOT income or expense)
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_account_id uuid not null references public.accounts(id) on delete restrict,
  to_account_id uuid not null references public.accounts(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  occurred_on date not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create index if not exists transfers_user_date_idx on public.transfers (user_id, occurred_on desc);
create index if not exists transfers_from_idx on public.transfers (from_account_id);
create index if not exists transfers_to_idx on public.transfers (to_account_id);

alter table public.transfers enable row level security;
create policy transfers_all on public.transfers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 3. Investments & Capital Movements
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  symbol text not null check (length(trim(symbol)) > 0 and length(symbol) <= 30),
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  asset_type text not null check (asset_type in ('stock', 'etf', 'mutual_fund', 'ipo', 'other')),
  trade_type text not null check (trade_type in ('buy', 'sell', 'ipo_apply', 'ipo_allotment', 'ipo_refund')),
  quantity numeric(14, 4) not null check (quantity >= 0),
  price_paise bigint not null check (price_paise >= 0),
  amount_paise bigint not null check (amount_paise >= 0),
  current_price_paise bigint,
  occurred_on date not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investments_user_date_idx on public.investments (user_id, occurred_on desc);
create index if not exists investments_user_symbol_idx on public.investments (user_id, upper(trim(symbol)));

create trigger investments_updated_at before update on public.investments
  for each row execute function public.set_updated_at();

alter table public.investments enable row level security;
create policy investments_all on public.investments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- 4. Link optional account to income
alter table public.income add column if not exists account_id uuid references public.accounts(id) on delete set null;
