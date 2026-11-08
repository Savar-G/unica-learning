-- Reduced dependencies only. The runner loads production scan, marking, delivery, zone and fence SQL unchanged.
-- No Storage daemon, PostgREST, hosted roles, byte decoder, image classifier or scheduler runs in this fixture.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema storage;
create schema cron;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.viewer',true),'')::uuid $$;
create table public.admin_users(user_id uuid primary key,email text);
grant select on public.admin_users to authenticated;
create function public.is_admin() returns boolean language sql stable as $$
  select exists(select 1 from public.admin_users where user_id=auth.uid())
$$;

create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create table auth.users(id uuid primary key);
create table public.parents(id uuid primary key references auth.users(id) on delete cascade,deletion_requested_at timestamptz);
create table public.children(id uuid primary key,parent_id uuid references parents(id) on delete cascade,unique(id,parent_id));
create table public.child_deletions(child_id uuid primary key references children(id) on delete cascade,parent_id uuid references parents(id) on delete cascade);
create table public.assessments(id uuid primary key,child_id uuid references children(id) on delete cascade,parent_id uuid references parents(id) on delete cascade,unique(id,child_id));
create table public.workbooks(id uuid primary key,parent_id uuid references parents(id) on delete cascade,child_id uuid references children(id) on delete cascade,number integer not null default 1,status text,printed_revision text,print_manifest jsonb,approved_at timestamptz,printed_at timestamptz,shipped_at timestamptz);
create table public.workbook_pages(id uuid primary key,workbook_id uuid references workbooks(id) on delete cascade,parent_id uuid references parents(id) on delete cascade,page_number int,day_label text,page_type text,print_contract jsonb,image_width int,image_height int,image_path text,qr_token text,unique(id,workbook_id,parent_id));
create table public.workbook_questions(id uuid primary key default gen_random_uuid(),parent_id uuid references parents(id) on delete cascade,workbook_id uuid references workbooks(id) on delete cascade,page_id uuid references workbook_pages(id) on delete cascade,question_number int,package jsonb,teaching jsonb,regions jsonb,unique(page_id,question_number));
create table public.workbook_audit(id bigint generated always as identity primary key,parent_id uuid references parents(id) on delete cascade,child_id uuid references children(id) on delete cascade,workbook_id uuid references workbooks(id) on delete cascade,actor_id uuid,actor_email text,action text,detail jsonb);
create table public.child_profiles(child_id uuid primary key references children(id) on delete cascade,parent_id uuid references parents(id) on delete cascade,assessment_id uuid,revision int,schema_version smallint,profile jsonb,built_at timestamptz,build_token uuid default gen_random_uuid());
create table public.skill_state_history(id bigint generated always as identity primary key,child_id uuid references children(id) on delete cascade,parent_id uuid references parents(id) on delete cascade,standard text,state text,reason text,evidence_source text,evidence_at timestamptz,changed_at timestamptz default now());
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage to anon,authenticated,service_role;
grant all on storage.objects to anon,authenticated,service_role;
create policy fixture_broad_owner_admin on storage.objects for all to anon,authenticated using(true) with check(true);

-- Test-only barrier. A delivery RPC has already locked the book before it reaches receipt insertion.
create function public.fixture_scan_delivery_barrier() returns trigger language plpgsql as $$
begin
  if current_setting('test.delivery_barrier',true)='on' then perform pg_advisory_xact_lock(475,41); end if;
  return new;
end $$;
