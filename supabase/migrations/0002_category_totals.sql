-- Totals per category for a date range (SECURITY INVOKER, so RLS limits it to the caller's rows).
create or replace function public.category_totals(p_from date, p_to date)
returns table (category_id uuid, total_paise bigint, tx_count bigint)
language sql stable security invoker as $$
  select c.id, coalesce(sum(t.amount_paise), 0)::bigint, count(t.id)
  from public.categories c
  left join public.transactions t
    on t.category_id = c.id and t.deleted_at is null
   and (p_from is null or t.occurred_on >= p_from) and (p_to is null or t.occurred_on <= p_to)
  group by c.id;
$$;
