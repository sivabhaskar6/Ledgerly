-- Ledgerly migration 0012: Borrow & Lend (Borrower & Borrowing Tracking)

create table if not exists public.borrow_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  person_name text not null,
  type text not null check (type in ('lent', 'borrowed')),
  amount_paise bigint not null check (amount_paise > 0),
  occurred_on date not null,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'settled')),
  settled_on date,
  note text check (note is null or length(note) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists borrow_records_user_date_idx on public.borrow_records (user_id, occurred_on desc, created_at desc);
create index if not exists borrow_records_person_idx on public.borrow_records (user_id, person_name);
create index if not exists borrow_records_status_idx on public.borrow_records (user_id, status);
create index if not exists borrow_records_active_idx on public.borrow_records (user_id, occurred_on desc) where deleted_at is null;
create index if not exists borrow_records_deleted_idx on public.borrow_records (user_id, deleted_at desc) where deleted_at is not null;

create trigger borrow_records_updated_at before update on public.borrow_records
  for each row execute function public.set_updated_at();

alter table public.borrow_records enable row level security;
create policy borrow_records_all on public.borrow_records for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
