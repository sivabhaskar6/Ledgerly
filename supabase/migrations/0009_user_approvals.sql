-- Migration 0009: User Access Approvals & Super Admin Role
-- Protects existing user data and ensures ONLY gonthinasivabhaskar6@gmail.com is admin.
-- All other new or existing users require admin approval before they can log in.

-- 1. Add approval columns to public.profiles (WITHOUT touching transactions or income)
alter table public.profiles
  add column if not exists email text,
  add column if not exists is_approved boolean not null default false,
  add column if not exists is_admin boolean not null default false,
  add column if not exists status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz;

-- 2. Populate email for all profiles from auth.users
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

-- 3. Explicitly mark gonthinasivabhaskar6@gmail.com as SUPER ADMIN and APPROVED
update public.profiles
set is_approved = true, is_admin = true, status = 'approved', approved_at = now()
where lower(trim(coalesce(email, ''))) = 'gonthinasivabhaskar6@gmail.com'
   or id in (select id from auth.users where lower(trim(email)) = 'gonthinasivabhaskar6@gmail.com');

-- 4. Mark all other non-admin accounts as pending approval
update public.profiles
set is_approved = false, is_admin = false, status = 'pending'
where lower(trim(coalesce(email, ''))) != 'gonthinasivabhaskar6@gmail.com'
  and id not in (select id from auth.users where lower(trim(email)) = 'gonthinasivabhaskar6@gmail.com');

-- 5. Create security definer function to check if current user is admin
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select coalesce(
    (
      select is_admin or lower(trim(email)) = 'gonthinasivabhaskar6@gmail.com'
      from public.profiles
      where id = auth.uid()
      limit 1
    ),
    false
  );
$$;

-- 6. RLS policies so only the admin (gonthinasivabhaskar6@gmail.com) can view and update profiles
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select
  using (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- 7. Trigger to automatically hold any new registrations under pending approval
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  is_admin_user boolean;
  u_name text;
begin
  -- Check if this user is the super admin
  is_admin_user := (lower(trim(new.email)) = 'gonthinasivabhaskar6@gmail.com');
  u_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  insert into public.profiles (
    id,
    display_name,
    email,
    is_approved,
    is_admin,
    status,
    approved_at
  ) values (
    new.id,
    u_name,
    new.email,
    is_admin_user, -- Only gonthinasivabhaskar6@gmail.com is auto-approved
    is_admin_user, -- Only gonthinasivabhaskar6@gmail.com is admin
    case when is_admin_user then 'approved' else 'pending' end,
    case when is_admin_user then now() else null end
  ) on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    is_admin = case when lower(trim(excluded.email)) = 'gonthinasivabhaskar6@gmail.com' then true else public.profiles.is_admin end,
    is_approved = case when lower(trim(excluded.email)) = 'gonthinasivabhaskar6@gmail.com' then true else public.profiles.is_approved end;

  -- Default categories for new users
  if not exists (select 1 from public.categories where user_id = new.id) then
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
  end if;

  return new;
end;
$$;
