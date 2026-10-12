-- Ledgerly initial schema. Money is stored as integer paise (1 INR = 100 paise).
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  -- null = never auto-delete trash. Cleanup is not automatic; this is only the stored policy.
  trash_retention_days integer check (trash_retention_days is null or trash_retention_days between 1 and 3650),
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null check (type in ('cash','bank','brokerage')),
  opening_balance_paise bigint not null default 0,
  opening_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 60),
  icon text not null default 'tag',
  color text not null default 'indigo',
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index categories_user_name_uq on public.categories (user_id, lower(trim(name)));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  account_id uuid,
  title text not null check (length(trim(title)) > 0 and length(title) <= 120),
  note text check (note is null or length(note) <= 500),
  occurred_on date not null,
  amount_paise bigint not null check (amount_paise > 0),
  payment_method text check (payment_method is null or payment_method in ('cash','upi','debit_card','credit_card','bank_transfer','other')),
  external_ref text,          -- bank reference number (used by imports in a later stage)
  fingerprint text,           -- normalized fingerprint (imports)
  import_batch_id uuid,
  deleted_at timestamptz,     -- soft delete marker
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- composite FKs guarantee a row can only reference its owner's category/account
  constraint tx_category_fk foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  constraint tx_account_fk foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);
create index tx_user_date_idx on public.transactions (user_id, occurred_on desc) where deleted_at is null;
create index tx_user_deleted_idx on public.transactions (user_id, deleted_at desc) where deleted_at is not null;
create index tx_user_category_idx on public.transactions (user_id, category_id);
create unique index tx_user_extref_uq on public.transactions (user_id, external_ref) where external_ref is not null and deleted_at is null;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tx_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy accounts_all on public.accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_all on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy tx_select on public.transactions for select using (user_id = auth.uid());
create policy tx_insert on public.transactions for insert with check (user_id = auth.uid() and deleted_at is null);
create policy tx_update on public.transactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Hard delete is only possible for rows already in the trash, so ordinary deletion can never be permanent.
create policy tx_delete on public.transactions for delete using (user_id = auth.uid() and deleted_at is not null);

-- New users: profile + default categories ---------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.categories (user_id, name, icon, color) values
    (new.id, 'Food and groceries', 'utensils', 'orange'),
    (new.id, 'Transportation', 'bus', 'sky'),
    (new.id, 'College and education', 'graduation-cap', 'indigo'),
    (new.id, 'Shopping', 'shopping-bag', 'pink'),
    (new.id, 'Health and fitness', 'heart-pulse', 'green'),
    (new.id, 'Bills and utilities', 'receipt', 'slate'),
    (new.id, 'Subscriptions', 'repeat', 'violet'),
    (new.id, 'Entertainment', 'clapperboard', 'amber'),
    (new.id, 'Travel', 'plane', 'teal'),
    (new.id, 'Personal care', 'sparkles', 'rose'),
    (new.id, 'Gifts and donations', 'gift', 'red'),
    (new.id, 'Other', 'tag', 'slate');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reporting helpers (SECURITY INVOKER: RLS still applies) -------------------
create or replace function public.expense_summary(
  p_from date, p_to date, p_category uuid, p_account uuid, p_search text,
  p_today date, p_month_start date, p_month_end date
) returns table (total_paise bigint, tx_count bigint, today_paise bigint, month_paise bigint)
language sql stable security invoker as $$
  with base as (
    select * from public.transactions
    where deleted_at is null
  )
  select
    coalesce(sum(amount_paise) filter (where
      (p_from is null or occurred_on >= p_from) and (p_to is null or occurred_on <= p_to)
      and (p_category is null or category_id = p_category)
      and (p_account is null or account_id = p_account)
      and (p_search is null or p_search = '' or title ilike '%'||p_search||'%' or note ilike '%'||p_search||'%')
    ), 0)::bigint,
    count(*) filter (where
      (p_from is null or occurred_on >= p_from) and (p_to is null or occurred_on <= p_to)
      and (p_category is null or category_id = p_category)
      and (p_account is null or account_id = p_account)
      and (p_search is null or p_search = '' or title ilike '%'||p_search||'%' or note ilike '%'||p_search||'%')
    ),
    coalesce(sum(amount_paise) filter (where occurred_on = p_today), 0)::bigint,
    coalesce(sum(amount_paise) filter (where occurred_on between p_month_start and p_month_end), 0)::bigint
  from base;
$$;

-- Safe category deletion: move transactions to a replacement first -----------
create or replace function public.delete_category(p_id uuid, p_replacement uuid default null)
returns void language plpgsql security invoker as $$
declare used bigint;
begin
  select count(*) into used from public.transactions where category_id = p_id;
  if used > 0 then
    if p_replacement is null or p_replacement = p_id then
      raise exception 'Category is used by % transactions; choose a replacement category.', used using errcode = 'P0001';
    end if;
    update public.transactions set category_id = p_replacement where category_id = p_id;
  end if;
  delete from public.categories where id = p_id;
end $$;
