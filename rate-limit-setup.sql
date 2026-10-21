-- DisMyth rate-limiting store (protects your AI credits from spam/abuse).
-- Paste into Supabase -> SQL Editor -> New query -> Run. Safe to re-run.
-- The server (service role) is the only thing that reads/writes this; RLS with
-- no policy means nobody with the public key can touch it.

create table if not exists public.rate_limits (
  id bigint generated always as identity primary key,
  ip text not null,
  ts timestamptz not null default now()
);
create index if not exists rate_limits_ip_ts on public.rate_limits (ip, ts);
alter table public.rate_limits enable row level security;
