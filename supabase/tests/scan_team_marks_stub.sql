-- #715 team marks on a disposable local Postgres with stub tables (no Supabase, no network).
-- Run: createdb t715 && psql -d t715 -v ON_ERROR_STOP=1 -f supabase/tests/scan_team_marks_stub.sql
-- It loads the stubs, then the #715 migrations (paths relative to the repo root), then the checks.
create schema auth;
create table auth.cur(uid uuid);
create function auth.uid() returns uuid language sql stable as $$ select uid from auth.cur limit 1 $$;
do $$ begin create role anon; create role authenticated; create role service_role; exception when duplicate_object then null; end $$;
create table public.parents(id uuid primary key, deletion_requested_at timestamptz);
create table public.children(id uuid primary key, parent_id uuid references public.parents(id), first_name text, unique(id,parent_id));
create table public.admin_users(user_id uuid primary key);
create table public.test_accounts(parent_id uuid primary key);
create table public.child_deletions(child_id uuid primary key, parent_id uuid);
create table public.family_deletions(parent_id uuid primary key);
create table public.workbooks(id uuid primary key, number int);
create table public.workbook_pages(id uuid primary key, page_number int);
create table public.workbook_questions(page_id uuid, parent_id uuid, question_number int, package jsonb);
-- Row types the explanation function declares (#715 follow-up replaces its body); this test does not call it.
create table public.scan_photos(id uuid primary key); create table public.parent_explanations(id uuid primary key); create table public.parent_explanation_prices(id uuid primary key);
create table public.scan_marking_revisions(child_id uuid primary key, parent_id uuid, revision bigint not null default 0);
create table public.scan_marking_items(id uuid primary key default gen_random_uuid(), parent_id uuid, child_id uuid, workbook_id uuid, printed_revision text, page_id uuid, item_id text,
  expected jsonb, observation jsonb, result_version int not null default 1, owner_photo uuid, original_event jsonb, event_id uuid, evidence_at timestamptz not null default now(), model text, prompt text,
  check ((observation->>'resultVersion')::int = result_version), check (observation->>'state' in ('pending','scored','parent-pending','parent-checked','unscored')));
create table public.scan_mark_changes(id bigint generated always as identity primary key, item_id uuid not null references public.scan_marking_items(id), parent_id uuid not null, child_id uuid not null,
  from_version int not null, to_version int not null check (to_version=from_version+1), actor text not null default 'parent' check (actor='parent'), changed_at timestamptz not null default clock_timestamp(),
  previous jsonb not null, current jsonb not null, unique(item_id,to_version));
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid())) $$;
create function public.assert_family_writable(p uuid) returns void language plpgsql security definer set search_path='' as $$
declare deleting timestamptz; begin select deletion_requested_at into deleting from public.parents where id = p for share;
  if not found or deleting is not null then raise exception 'family_unavailable' using errcode = '55000'; end if; end $$;
\i supabase/migrations/20261107204619_scan_team_marks.sql
\i supabase/migrations/20261107213302_scan_team_mark_followups.sql
insert into public.parents values ('00000000-0000-4000-8000-000000000001', null);
insert into public.children values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Iris');
insert into public.workbooks values ('00000000-0000-4000-8000-000000000003', 1);
insert into public.workbook_pages values ('00000000-0000-4000-8000-000000000004', 9);
insert into public.workbook_questions values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001',2,'{"skill":{"standard":"2.1","skills":["a"]}}');
insert into public.admin_users values ('00000000-0000-4000-8000-0000000000aa');
-- unsure (read), unread, finished
insert into public.scan_marking_items(id,parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version,model) values
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','rev','00000000-0000-4000-8000-000000000004','q2',
  '{"number":2,"method":"code","mastery":{"eligible":true}}','{"state":"pending","result":null,"actor":"system","method":"code","issue":"answer-form","readAnswerText":"42","resultVersion":2,"evidence":{"photoRevision":"00000000-0000-4000-8000-0000000000f1"}}',2,'m'),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','rev','00000000-0000-4000-8000-000000000004','q3',
  '{"number":3,"method":"code","mastery":{"eligible":true}}','{"state":"pending","result":null,"actor":"system","method":"code","resultVersion":1,"evidence":{"photoRevision":"00000000-0000-4000-8000-0000000000f1"}}',1,null),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','rev','00000000-0000-4000-8000-000000000004','q4',
  '{"number":4,"method":"code","mastery":{"eligible":true}}','{"state":"scored","result":"right","actor":"system","method":"code","resultVersion":2}',2,'m');
-- not admin
insert into auth.cur values ('00000000-0000-4000-8000-0000000000bb');
do $$ begin perform public.admin_scan_team_queue(); raise exception 'should fail'; exception when insufficient_privilege then raise notice 'queue refuses non-admin: ok'; end $$;
do $$ begin perform public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',2,'wrong'); raise exception 'should fail'; exception when insufficient_privilege then raise notice 'set refuses non-admin: ok'; end $$;
update auth.cur set uid='00000000-0000-4000-8000-0000000000aa';
select item_id, question_number, photo_id, issue, read_text, child_name, book, page_number, test_family, total from public.admin_scan_team_queue();
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000012',1,'wrong') as unread;
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000013',2,'wrong') as finished;
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',1,'wrong') as stale;
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',2,'maybe') as bad;
-- before the swap: insert fails on the actor check
do $$ begin perform public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',2,'wrong'); raise exception 'should fail'; exception when check_violation then raise notice 'before swap: check violation, nothing saved: ok'; end $$;
select result_version, observation->>'state' from public.scan_marking_items where id='00000000-0000-4000-8000-000000000011';
\i supabase/migrations/20261107211637_scan_mark_changes_team_actor.sql
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',2,'wrong') as saved;
select result_version, observation->>'state' st, observation->>'actor' actor, observation->>'result' r, original_event->>'result' ev, original_event->'evidence'->>'id' photo, owner_photo from public.scan_marking_items where id='00000000-0000-4000-8000-000000000011';
select actor, admin_id, from_version, to_version, previous->'observation'->>'state' prev from public.scan_mark_changes;
select * from public.scan_marking_revisions;
select count(*) as queue_after from public.admin_scan_team_queue();
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000011',3,'right') as again;
-- parent journal row still allowed, and an admin row without admin id refused
insert into public.scan_mark_changes(item_id,parent_id,child_id,from_version,to_version,previous,current) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',3,4,'{}','{}');
do $$ begin insert into public.scan_mark_changes(item_id,parent_id,child_id,from_version,to_version,actor,previous,current) values ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',4,5,'admin','{}','{}'); raise exception 'should fail'; exception when check_violation then raise notice 'admin row needs admin id: ok'; end $$;
-- One waiting rule (#715 review): a stored reading with no model still waits for the team and can be marked; an
-- unread row with no model does not. Same rule as waitsForTeam in src/lib/scan-marking.ts.
insert into public.scan_marking_items(id,parent_id,child_id,workbook_id,printed_revision,page_id,item_id,expected,observation,result_version,model) values
 ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','rev','00000000-0000-4000-8000-000000000004','q5',
  '{"number":5,"method":"code","mastery":{"eligible":false}}','{"state":"pending","result":null,"actor":"system","method":"code","certainty":"uncertain","issue":"unreadable","resultVersion":2}',2,null);
do $$ begin
  if (select count(*) from public.admin_scan_team_queue() where item_id='00000000-0000-4000-8000-000000000021') <> 1 then raise exception 'reading without a model is not in the team list'; end if;
  if (select count(*) from public.admin_scan_team_queue() where item_id='00000000-0000-4000-8000-000000000012') <> 0 then raise exception 'unread row is in the team list'; end if;
  if (select photo_id from public.admin_scan_team_queue() where item_id='00000000-0000-4000-8000-000000000021') is not null then raise exception 'expected no photo'; end if;
  raise notice 'one waiting rule in the list: ok';
end $$;
select public.admin_set_scan_mark('00000000-0000-4000-8000-000000000021',2,'right')->>'status' as no_model_reading_marked;
