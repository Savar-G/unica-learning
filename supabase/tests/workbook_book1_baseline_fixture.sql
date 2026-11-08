-- Reduced local schema for #472 Book 1 baseline, on top of workbook_preview_sources_fixture.sql. No customer rows.
create table public.workbook_runs(id uuid primary key,parent_id uuid not null references public.parents(id) on delete cascade,child_id uuid not null,
  number int not null,status text not null,draft_id uuid);
create table public.workbook_drafts(id uuid primary key,parent_id uuid not null references public.parents(id) on delete cascade,child_id uuid not null,number int not null,draft jsonb not null);
create table public.workbook_draft_revisions(draft_id uuid not null references public.workbook_drafts(id) on delete cascade,revision int not null,
  parent_id uuid not null,child_id uuid not null,content jsonb,rendering jsonb,primary key(draft_id,revision));
create table public.workbook_run_frames(run_id uuid primary key references public.workbook_runs(id) on delete cascade,parent_id uuid not null,child_id uuid not null,frame jsonb not null);
create table public.learning_events(id uuid primary key,parent_id uuid,child_id uuid,workbook_id uuid);
create table public.scan_marking_items(id uuid primary key,parent_id uuid not null references public.parents(id) on delete cascade,child_id uuid not null,workbook_id uuid not null,
  printed_revision text not null,page_id uuid not null,item_id text not null,observation jsonb not null,result_version int not null,evidence_at timestamptz not null default now());
create table public.scan_mark_changes(id bigint generated always as identity primary key,item_id uuid not null references public.scan_marking_items(id) on delete cascade);
create table public.workbook_scan_receipts(id uuid primary key,workbook_id uuid not null);
create table public.workbook_audit(id bigint generated always as identity primary key,parent_id uuid,child_id uuid,workbook_id uuid,run_id uuid,action text,detail jsonb);
