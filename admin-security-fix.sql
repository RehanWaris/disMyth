-- SECURITY FIX: the owner-only gate in admin_overview / admin_set_hidden failed
-- OPEN when there was no login (auth.jwt() email is null → "null in/ not in"
-- is null → the IF skipped the guard). coalesce(...,'') makes it fail CLOSED.
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to re-run.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean := coalesce(auth.jwt() ->> 'email', '') = 'rehan.waris@gmail.com';
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

create or replace function public.admin_set_hidden(p_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'email', '') <> 'rehan.waris@gmail.com' then
    return false;
  end if;
  update public.checks set hidden = p_hidden where id = p_id;
  return true;
end;
$$;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;

-- Also lock down app_settings writes the same way (defense in depth; RLS already
-- denies null, but keep the function-style checks consistent).
