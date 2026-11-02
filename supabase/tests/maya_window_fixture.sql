-- Minimal isolated PostgreSQL fixture. Run only in an empty test database.
-- Auth, admin membership, and family deletion state are platform stubs.
-- The family write fence retains the parent share lock used by the real insert path.
do $$ begin
  if to_regclass('public.parents') is not null then raise exception 'fixture_requires_empty_database'; end if;
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create table public.admin_users (user_id uuid primary key);
create function public.fence_family_write() returns trigger language plpgsql as $$
begin
  perform 1 from public.parents where id=(to_jsonb(new)->>'parent_id')::uuid for share;
  return new;
end $$;
