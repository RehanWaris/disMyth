-- ============================================================================
-- DisMyth — Personal check history ("My checks")
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once (uses IF NOT EXISTS / CREATE OR REPLACE).
--
-- What it does:
--   1. Adds a user_id column to the checks table so each check can be linked
--      to the signed-in person who ran it (older rows stay NULL — that's fine).
--   2. Creates my_checks(): a secure function that returns ONLY the caller's
--      own checks. A logged-in user can never see anyone else's history, and a
--      logged-out caller gets nothing.
-- ============================================================================

-- 1) Link each check to its owner (nullable; existing rows are unaffected).
alter table public.checks
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists checks_user_id_created_idx
  on public.checks (user_id, created_at desc);

-- 2) "My checks" — the signed-in user's own history, newest first.
--    Returns jsonb (same robust shape as the public feed function), so there
--    are no column-type pitfalls. SECURITY DEFINER lets it read the table, but
--    it HARD-FILTERS on auth.uid(), so each caller only ever gets their own
--    rows. Logged out (auth.uid() IS NULL) => empty array.
create or replace function public.my_checks(lim int default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r), '[]'::jsonb)
  from (
    select id, claim, verdict, confidence, models, evidence, region, created_at
    from public.checks
    where user_id is not null
      and user_id = auth.uid()
    order by created_at desc
    limit greatest(1, least(coalesce(lim, 50), 200))
  ) r;
$$;

-- Only signed-in users may call it (anon gets an empty array anyway).
revoke all on function public.my_checks(int) from public, anon;
grant execute on function public.my_checks(int) to authenticated;
