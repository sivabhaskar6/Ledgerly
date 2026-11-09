-- Migration 0010: User Approval Tracking, Timestamps & Re-Request Cooldown
-- Adds requested_at, rejected_at, rejection_count, and re-request permissions.
-- Safe and non-destructive: only adds tracking columns to public.profiles.

-- 1. Add tracking columns to public.profiles
alter table public.profiles
  add column if not exists requested_at timestamptz default now(),
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_count int not null default 0;

-- 2. Populate requested_at for existing rows
update public.profiles
set requested_at = coalesce(created_at, now())
where requested_at is null;

-- 3. Update existing approved accounts
update public.profiles
set approved_at = coalesce(approved_at, created_at, now())
where is_approved = true and approved_at is null;

-- 4. Function to allow rejected users to re-request access after cooldown has passed
create or replace function public.re_request_access() returns void
language plpgsql security definer set search_path = public as $$
declare
  p record;
  cooldown_hours int;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Profile not found';
  end if;

  if p.is_approved = true then
    return; -- already approved
  end if;

  -- Cooldown rule: 2 hours for first 3 rejections, 24 hours after 3 rejections
  if p.rejection_count <= 3 then
    cooldown_hours := 2;
  else
    cooldown_hours := 24;
  end if;

  -- Verify cooldown has passed
  if p.rejected_at is not null and (now() < p.rejected_at + (cooldown_hours || ' hours')::interval) then
    raise exception 'Cooldown period has not elapsed yet. Please try again later.';
  end if;

  -- Reset status to pending and update requested_at timestamp
  update public.profiles
  set status = 'pending',
      is_approved = false,
      requested_at = now()
  where id = auth.uid();
end;
$$;

-- Grant execution to authenticated users
grant execute on function public.re_request_access() to authenticated;
