-- R6: topic method records (how each topic is taught). Service-role only, like bank_reference_images:
-- browser roles (anon, authenticated) have no access. Written by npm run reference:method -- import.
create table public.bank_reference_topic_methods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source ~ '^[A-Za-z0-9]+$'),
  level text not null check (level ~ '^[A-Z0-9]+$'),
  topic_number integer not null check (topic_number >= 1),
  record jsonb not null,
  status text not null default 'drafted' check (status in ('drafted', 'approved')),
  -- SHA-256 of the record without its status and approvals.
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row for each level and topic of a source.
  unique (source, level, topic_number),
  -- The columns never say something else than the record. "is not distinct from" also refuses a missing key.
  constraint bank_reference_topic_methods_record_matches check (
    (record ->> 'source') is not distinct from source
    and (record ->> 'level') is not distinct from level
    and (record -> 'topic') is not distinct from to_jsonb(topic_number)
    and (record ->> 'status') is not distinct from status
  )
);

alter table public.bank_reference_topic_methods enable row level security;
revoke all on public.bank_reference_topic_methods from anon, authenticated;
grant all on public.bank_reference_topic_methods to service_role;
