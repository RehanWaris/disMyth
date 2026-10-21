-- DisMyth admin analytics (basic): volume over time, top cities, topics.
-- Paste into Supabase -> SQL Editor -> New query -> Run. Owner-only. Safe to re-run.

create or replace function public.admin_analytics()
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
    'total',   (select count(*) from public.checks),
    'last_7',  (select count(*) from public.checks where created_at > now() - interval '7 days'),
    'last_30', (select count(*) from public.checks where created_at > now() - interval '30 days'),
    'by_verdict', (
      select coalesce(jsonb_object_agg(v, n), '{}'::jsonb)
      from (select coalesce(verdict, 'Unknown') v, count(*) n from public.checks group by 1) t),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) order by dt), '[]'::jsonb)
      from (select to_char(date_trunc('day', created_at), 'Mon DD') d,
                   date_trunc('day', created_at) dt, count(*) n
            from public.checks
            where created_at > now() - interval '14 days'
            group by 1, 2) x),
    'by_region', (
      select coalesce(jsonb_agg(jsonb_build_object('region', r, 'n', n) order by n desc), '[]'::jsonb)
      from (select coalesce(nullif(region, ''), 'Unknown') r, count(*) n
            from public.checks group by 1 order by n desc limit 10) y),
    'by_topic', (
      select coalesce(jsonb_object_agg(topic, n), '{}'::jsonb)
      from (
        select case
          when claim ~* '(vaccine|covid|health|cancer|medicine|doctor|disease|hospital)' then 'Health'
          when claim ~* '(election|vote|minister|govern|\mbjp\M|congress|\mparty\M|modi|rally|\mcm\M|policy)' then 'Politics'
          when claim ~* '(\mrbi\M|bank|rupee|\mnote\M|money|loan|\mtax\M|stock|crypto|price|economy)' then 'Finance'
          when claim ~* '(nasa|isro|space|moon|scientist|\mstudy\M|research|climate|\mai\M)' then 'Science/Tech'
          when claim ~* '(flood|earthquake|cyclone|\mfire\M|storm|disaster|\mrain\M)' then 'Disaster'
          when claim ~* '(cricket|football|olympic|\mmatch\M|world cup|tournament)' then 'Sports'
          else 'Other' end topic,
          count(*) n
        from public.checks group by 1) z)
  );
end;
$$;
grant execute on function public.admin_analytics() to authenticated;
