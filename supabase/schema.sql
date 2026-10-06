-- Well Go: chat and small-state tables
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
--
-- Everything else (people, interactions, photos, challenges) lives in Notion.
-- These two tables only hold what needs to be fast: chat messages and tiny
-- per-person settings (weekly goals, buddy, cheers, nudge threshold).
--
-- Row level security is on with no policies, so the public API key can't read
-- or write them. Only the `go` Edge Function (service role) can.

create table if not exists public.go_messages (
  id bigint generated always as identity primary key,
  thread text not null,               -- 'all', 'team:<team id>', or 'dm:<id>:<id>'
  sender_id text not null,            -- Notion player id, or 'system'
  sender_name text not null,
  body text not null check (length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists go_messages_thread_idx on public.go_messages (thread, id desc);

create table if not exists public.go_kv (
  owner text not null,                -- Notion player id
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);

alter table public.go_messages enable row level security;
alter table public.go_kv enable row level security;
revoke all on public.go_messages from anon, authenticated;
revoke all on public.go_kv from anon, authenticated;
