-- Keep only folder keys after the child is gone. These parent-owned guards stop a late upload from restoring a deleted file.
-- No name, child id, test content or file content is stored. The parent's deletion removes the guards.
create table public.child_deleted_folders (
  parent_id uuid not null references public.parents(id) on delete cascade,
  bucket text not null check(bucket in ('shown-work','workbook-pages','scan-photos')),
  prefix text not null,
  primary key(parent_id,bucket,prefix),
  check(starts_with(prefix,parent_id::text || '/'))
);
alter table public.child_deleted_folders enable row level security;
revoke all on public.child_deleted_folders from public,anon,authenticated,service_role;
alter table public.child_deletions add column folders jsonb not null default '[]'::jsonb;

-- Capture the immutable folder set in the same transaction as the request.
create function public.capture_child_delete_folders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(jsonb_agg(jsonb_build_object('bucket',r.bucket,'prefix',r.prefix)),'[]'::jsonb)
    into new.folders from public.child_delete_roots(new.parent_id,new.child_id) r;
  insert into public.child_deleted_folders(parent_id,bucket,prefix)
    select new.parent_id,r->>'bucket',r->>'prefix' from jsonb_array_elements(new.folders) r
    on conflict do nothing;
  return new;
end $$;
create trigger capture_child_delete_folders before insert on public.child_deletions
  for each row execute function public.capture_child_delete_folders();

create or replace function public.child_delete_roots(p uuid,c uuid)
returns table(bucket text,prefix text) language sql stable security definer set search_path = '' as $$
  select 'shown-work',p::text||'/'||a.id::text from public.assessments a where a.parent_id=p and a.child_id=c
  union select 'workbook-pages',p::text||'/'||w.id::text from public.workbooks w where w.parent_id=p and w.child_id=c
  union select 'workbook-pages',p::text||'/'||d.id::text from public.workbook_drafts d where d.parent_id=p and d.child_id=c
  union select 'scan-photos',p::text||'/'||s.id::text from public.scan_photos s where s.parent_id=p and s.child_id=c
  union select f->>'bucket',f->>'prefix' from public.child_deletions d,lateral jsonb_array_elements(d.folders) f where d.parent_id=p and d.child_id=c;
$$;
create or replace function public.fence_child_delete_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  for r in select to_jsonb(new) union all select to_jsonb(old) where tg_op='UPDATE' loop
    if exists(select 1 from public.child_deleted_folders f where f.bucket=r->>'bucket_id'
      and starts_with(lower(r->>'name'),f.prefix || '/')) then
      raise exception 'child_unavailable' using errcode='55000';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.capture_child_delete_folders() from public,anon,authenticated,service_role;
