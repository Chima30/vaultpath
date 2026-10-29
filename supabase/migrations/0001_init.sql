-- VaultPath initial schema
-- Run in the Supabase SQL editor (or `supabase db push`).
--
-- ACCESS MODEL
--   Row Level Security is enabled and FORCED on every table, and no policies are
--   created. That means the anon and authenticated roles (the ones a browser
--   could ever use) are denied everything. Only the server-side service-role key,
--   used exclusively inside Next.js API routes / server components, can read or
--   write. The service-role key must never be exposed to the browser.
--
--   To move to per-user access later, add an owner_id uuid column referencing
--   auth.users and policies such as:  using (owner_id = auth.uid())

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- investigations
create table public.investigations (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 200),
  subject_address  text not null check (subject_address ~ '^0x[0-9a-f]{64}$'),
  network          text not null default 'sui-mainnet' check (network = 'sui-mainnet'),
  status           text not null default 'open' check (status in ('open','monitoring','closed')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index investigations_subject_idx on public.investigations (subject_address);
create index investigations_created_idx on public.investigations (created_at desc);
create trigger investigations_updated before update on public.investigations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------- evidence
-- Raw-but-trimmed results returned by Tatum Sui Mainnet RPC. Rows only exist if a
-- real RPC call succeeded; nothing is ever inserted as a placeholder.
create table public.evidence (
  id                uuid primary key default gen_random_uuid(),
  investigation_id  uuid not null references public.investigations(id) on delete cascade,
  kind              text not null check (kind in ('tatum_balances','tatum_transactions','analyst_note')),
  source_methods    text[] not null default '{}',
  latest_checkpoint text,
  payload           jsonb not null,
  fetched_at        timestamptz not null default now()
);
create index evidence_investigation_idx on public.evidence (investigation_id, fetched_at desc);

-- ------------------------------------------------------------------- assessments
create table public.assessments (
  id                uuid primary key default gen_random_uuid(),
  investigation_id  uuid not null references public.investigations(id) on delete cascade,
  verdict           text not null check (verdict in ('low','medium','high','inconclusive')),
  score             integer not null default 0,
  method            text not null default 'rule-based-v1',
  summary           text not null,
  reasoning         jsonb not null default '[]'::jsonb,
  recalled_count    integer not null default 0,
  recalled_context  jsonb not null default '[]'::jsonb,  -- [{blob_id, distance, preview}]
  evidence_ids      uuid[] not null default '{}',
  created_at        timestamptz not null default now()
);
create index assessments_investigation_idx on public.assessments (investigation_id, created_at desc);

-- ---------------------------------------------------------- walrus_write_receipts
-- One row per memory write submitted to the Walrus Memory relayer.
-- blob_id stays NULL until the relayer reports the job as done, so a row with
-- status = 'done' and a non-null blob_id is the only proof of a stored memory.
create table public.walrus_write_receipts (
  id                uuid primary key default gen_random_uuid(),
  investigation_id  uuid references public.investigations(id) on delete set null,
  assessment_id     uuid references public.assessments(id) on delete set null,
  namespace         text not null,
  job_id            text not null unique,
  blob_id           text,
  owner_address     text,
  status            text not null default 'accepted' check (status in ('accepted','done','failed')),
  error             text,
  content_sha256    text not null,
  content_preview   text not null,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz
);
create index receipts_status_idx on public.walrus_write_receipts (status, created_at desc);
create index receipts_investigation_idx on public.walrus_write_receipts (investigation_id);

-- ------------------------------------------------------------------- access control
alter table public.investigations        enable row level security;
alter table public.evidence              enable row level security;
alter table public.assessments           enable row level security;
alter table public.walrus_write_receipts enable row level security;

alter table public.investigations        force row level security;
alter table public.evidence              force row level security;
alter table public.assessments           force row level security;
alter table public.walrus_write_receipts force row level security;

revoke all on public.investigations        from anon, authenticated;
revoke all on public.evidence              from anon, authenticated;
revoke all on public.assessments           from anon, authenticated;
revoke all on public.walrus_write_receipts from anon, authenticated;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

grant all on public.investigations, public.evidence, public.assessments, public.walrus_write_receipts to service_role;
