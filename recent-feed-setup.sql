-- DisMyth "recent lies dismissed" public feed.
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
--
-- Returns the most recent False / Misleading checks run by anyone, anywhere,
-- so the app feed can show real dismissed lies instead of samples.
-- Only non-sensitive fields are exposed; it is read-only.

create or replace function public.recent_checks()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb)
  from (
    select id, claim, verdict, confidence, models, evidence, region, created_at
    from public.checks
    where verdict in ('False', 'Misleading')
      and claim is not null
      and length(claim) between 1 and 600
    order by created_at desc
    limit 24
  ) r;
$$;

grant execute on function public.recent_checks() to anon, authenticated;
