-- Reduced local schema. No customer rows or hosted configuration.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
create table public.admin_users(user_id uuid primary key);
create table public.parents(id uuid primary key,deletion_requested_at timestamptz);
create table public.children(id uuid primary key,parent_id uuid not null references public.parents(id) on delete cascade,unique(id,parent_id));
create table public.assessments(id uuid primary key,parent_id uuid);
create table public.family_deletions(parent_id uuid primary key);
create table public.child_deletions(child_id uuid primary key,parent_id uuid);
create table public.workbooks(id uuid primary key,parent_id uuid not null references public.parents(id) on delete cascade,child_id uuid not null,number int not null,status text,printed_revision text,print_manifest jsonb,
  foreign key(child_id,parent_id) references public.children(id,parent_id) on delete cascade,unique(id,parent_id,child_id,number));
create table public.workbook_delivery_receipts(workbook_id uuid primary key references public.workbooks(id) on delete cascade,parent_id uuid,child_id uuid,number int,audit_id bigint,delivered_at timestamptz);
create table public.workbook_delivery_corrections(workbook_id uuid references public.workbooks(id) on delete cascade,audit_id bigint,delivered_at timestamptz);
create table public.scan_marking_revisions(parent_id uuid,child_id uuid primary key,revision bigint);
