-- R3: reference page records and masked photos. Service-role only: browser roles (anon, authenticated)
-- have no access to public.bank_reference_images or the private curriculum-reference bucket.
create table public.bank_reference_images (
  id uuid primary key default gen_random_uuid(),
  source_ref text not null unique,
  kind text not null check (kind in ('page', 'contents')),
  path text,
  transcript jsonb,
  transcript_status text not null default 'machine_read' check (transcript_status in ('machine_read', 'double_read', 'human_checked')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bank_reference_images enable row level security;
revoke all on public.bank_reference_images from anon, authenticated;
grant all on public.bank_reference_images to service_role;

-- No policy on storage.objects for curriculum-reference; only service_role may read or write objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('curriculum-reference', 'curriculum-reference', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
