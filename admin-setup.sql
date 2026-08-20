-- DisMyth admin console — one-time database setup.
-- Paste this whole block into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- 1) Settings store (drives the AI on/off toggles).
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

-- anyone may READ settings; only the owner email(s) may write.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all
  using      ((auth.jwt() ->> 'email') in ('rehan.waris@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('rehan.waris@gmail.com'));

-- default: all optional voters ON.
insert into public.app_settings (key, value)
values ('ai_enabled', '{"gpt4o":true,"grok":true,"gemini":true}'::jsonb)
on conflict (key) do nothing;

-- 2) Owner-only overview: verdict breakdown + recent checks.
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
      from (
        select coalesce(verdict, 'Unknown') as verdict, count(*) as n
        from public.checks group by 1
      ) t
    ),
    'recent', (
      select coalesce(jsonb_agg(r), '[]'::jsonb)
      from (
        select claim, verdict, confidence, region, created_at
        from public.checks order by created_at desc limit 15
      ) r
    )
  );
end;
$$;

grant execute on function public.admin_overview() to authenticated;
