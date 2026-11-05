-- A parent renames a child from the Account tab (#555, PR #606 review).
--
-- 1. children.former_names: every name the child had before a rename, oldest first, each once. The call note writer
--    (src/lib/maya-call-note.ts) hides these as it hides the name now, so a note written after a rename (a pending
--    note's retry) never stores an old name or sends it to the AI. Only rename_child writes it: parents have no update
--    grant on the column. It goes with the child row, so the child's and the family's deletion remove it.
-- 2. rename_child: the check of the child's workbook runs and the write in one transaction, under the child's row lock.
--    start_workbook_run already takes that lock first (select ... from public.children ... for update), so a run
--    cannot start between the check and the write. A run counts as active by the app's rule for a stopped run
--    (runState in src/lib/workbook-job.ts): a queued run for the Mac waits however long it takes; any other queued or
--    running run is active until it has had no heartbeat (or, with none, no start) for p_stale_seconds. So a run that
--    stopped with its status still running never blocks a rename.
--
-- Additive: the live code reads and writes neither yet.

alter table public.children add column if not exists former_names text[] not null default '{}'::text[];

alter table public.children drop constraint if exists children_former_names_max;
alter table public.children add constraint children_former_names_max check (cardinality(former_names) <= 20);

comment on column public.children.former_names is
  'Names the child had before a parent renamed them, oldest first, each once (at most 20). Written only by rename_child; the call note writer hides them (#555).';

create or replace function public.rename_child(p_parent uuid, p_child uuid, p_first_name text, p_stale_seconds integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text; v_former text[];
begin
  if p_first_name is null or btrim(p_first_name) = '' then raise exception 'rename_child: empty name'; end if;
  if p_stale_seconds is null or p_stale_seconds <= 0 then raise exception 'rename_child: bad stale seconds'; end if;
  -- The same lock start_workbook_run takes first.
  select first_name, former_names into v_name, v_former from public.children
    where id = p_child and parent_id = p_parent for update;
  if not found then return 'not_found'; end if;
  if exists (
    select 1 from public.workbook_runs r
    where r.child_id = p_child and r.status in ('queued', 'running')
      and ((r.status = 'queued' and r.runner = 'mac')
        or coalesce(r.heartbeat_at, r.created_at) >= now() - make_interval(secs => p_stale_seconds))
  ) then
    return 'book_in_progress';
  end if;
  if v_name = p_first_name then return 'saved'; end if;
  if not (v_name = any(v_former)) then
    if cardinality(v_former) >= 20 then return 'too_many'; end if;
    v_former := v_former || v_name;
  end if;
  -- The family write fence (fence_family_write) refuses a family being deleted with 55000.
  update public.children set first_name = p_first_name, former_names = v_former where id = p_child;
  return 'saved';
end $$;

revoke all on function public.rename_child(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.rename_child(uuid, uuid, text, integer) to service_role;
