-- Ledgerly migration 0005: Capital Snapshots and Tracking

create table if not exists public.capital (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_paise bigint not null check (amount_paise >= 0),
  occurred_on date not null,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capital_user_date_idx on public.capital (user_id, occurred_on desc, created_at desc);

create trigger capital_updated_at before update on public.capital
  for each row execute function public.set_updated_at();

alter table public.capital enable row level security;
create policy capital_all on public.capital for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
