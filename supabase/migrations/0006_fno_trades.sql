-- Ledgerly migration 0006: F&O (Futures & Options) Daily Trading Journal & Income Sync

-- 1. Adjust income table constraints to support F&O trading source and loss deductions
alter table public.income drop constraint if exists income_amount_paise_check;
alter table public.income add constraint income_amount_paise_check check (amount_paise <> 0);

alter table public.income drop constraint if exists income_source_check;
alter table public.income add constraint income_source_check check (source in ('stock_profit','ipo_gain','dividend','interest','fno_trading','other'));

-- 2. Create fno_trades table
create table if not exists public.fno_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  income_id uuid references public.income(id) on delete set null,
  symbol text not null,
  instrument_type text not null check (instrument_type in ('call', 'put', 'future')),
  strike_price_paise bigint check (strike_price_paise is null or strike_price_paise >= 0),
  expiry_date date,
  trade_type text not null default 'buy_first' check (trade_type in ('buy_first', 'sell_first')),
  quantity integer not null check (quantity > 0),
  buy_price_paise bigint not null check (buy_price_paise >= 0),
  sell_price_paise bigint not null check (sell_price_paise >= 0),
  charges_paise bigint not null default 0 check (charges_paise >= 0),
  gross_pnl_paise bigint not null,
  net_pnl_paise bigint not null,
  occurred_on date not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fno_trades_user_date_idx on public.fno_trades (user_id, occurred_on desc, created_at desc);
create index if not exists fno_trades_symbol_idx on public.fno_trades (user_id, symbol);

create trigger fno_trades_updated_at before update on public.fno_trades
  for each row execute function public.set_updated_at();

alter table public.fno_trades enable row level security;
create policy fno_trades_all on public.fno_trades for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
