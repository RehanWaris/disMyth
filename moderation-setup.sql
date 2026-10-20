-- DisMyth moderation: hide a check from the public "recent lies dismissed" feed.
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to re-run.

-- 1) Flag column.
alter table public.checks add column if not exists hidden boolean not null default false;

-- 2) Public feed excludes hidden rows.
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
      and hidden = false
    order by created_at desc
    limit 24
  ) r;
$$;
grant execute on function public.recent_checks() to anon, authenticated;

-- 3) Admin overview carries id + hidden so the console can show a Hide button.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := (auth.jwt() ->> 'email') in ('rehan.waris@gmail.com');
begin
  if not is_admin then
    return jsonb_build_object('error', 'not_authorized');
  end if;
  return jsonb_build_object(
    'by_verdict', (
      select coalesce(jsonb_object_agg(verdict, n), '{}'::jsonb)
      from (select coalesce(verdict, 'Unknown') as verdict, count(*) as n
            from public.checks group by 1) t),
    'recent', (
      select coalesce(jsonb_agg(r), '[]'::jsonb)
      from (select id, claim, verdict, confidence, region, created_at, hidden
            from public.checks order by created_at desc limit 20) r)
  );
end;
$$;
grant execute on function public.admin_overview() to authenticated;

-- 4) Owner-only toggle to hide / unhide a check.
create or replace function public.admin_set_hidden(p_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if (auth.jwt() ->> 'email') not in ('rehan.waris@gmail.com') then
    return false;
  end if;
  update public.checks set hidden = p_hidden where id = p_id;
  return true;
end;
$$;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;
