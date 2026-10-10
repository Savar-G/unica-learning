-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_sign_in_links, 2026-10-11.
-- The phone-to-laptop sign-in link (#63, D-082): one row per emailed link. It signs the parent in once, within 24 hours,
-- and opens one child's start screen. Only the SHA-256 hash of the token is kept.
-- Only the server reads and writes it (secret key; service_role skips row-level security). anon and authenticated get nothing.
create table public.sign_in_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null references public.children (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index sign_in_links_parent_idx on public.sign_in_links (parent_id, created_at);
create index sign_in_links_child_idx on public.sign_in_links (child_id);

alter table public.sign_in_links enable row level security;
revoke all on table public.sign_in_links from anon, authenticated;
