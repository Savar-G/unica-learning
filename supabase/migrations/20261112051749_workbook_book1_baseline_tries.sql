-- #870 review: the reminders run's Book 1 baseline repair must not stall behind revisions that never settle. A revision
-- whose capture is tried again (the service is unavailable, a race, a throw) stayed at the top of the due list, oldest
-- approval first, so with a limit of 3 no later Book 1 was ever captured. Additive: one new table, one new function,
-- and the due list now ordered by the last try (never tried first), then the approval. Same signature and columns, plus
-- the try count; the old function had no deployed caller.

-- One row per draft revision the repair tried: how many times and when last. Only the counts; no family content.
create table public.workbook_book1_baseline_tries (
  draft_id uuid not null references public.workbook_drafts(id) on delete cascade,
  revision integer not null check (revision between 1 and 10000),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  tries integer not null default 1 check (tries >= 1),
  last_tried_at timestamptz not null default clock_timestamp(),
  primary key (draft_id, revision),
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  foreign key (draft_id, revision) references public.workbook_draft_revisions(draft_id, revision) on delete cascade
);
create index workbook_book1_baseline_tries_family on public.workbook_book1_baseline_tries(parent_id, child_id);

alter table public.workbook_book1_baseline_tries enable row level security;
revoke all on public.workbook_book1_baseline_tries from public, anon, authenticated, service_role;
grant select on public.workbook_book1_baseline_tries to authenticated, service_role;
create policy workbook_book1_baseline_tries_service_read on public.workbook_book1_baseline_tries for select to service_role using (true);
create policy workbook_book1_baseline_tries_admin_read on public.workbook_book1_baseline_tries for select to authenticated
  using (public.workbook_book1_access(parent_id, child_id));
create trigger fence_family_write before insert or update on public.workbook_book1_baseline_tries
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_book1_baseline_tries
  for each row execute function public.fence_child_delete_write();

-- Counts one try of a Book 1 draft revision, before the capture starts, so a capture that throws or hangs still counts.
create function public.note_workbook_book1_baseline_try(p_draft uuid, p_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.workbook_drafts; n integer;
begin
  select * into d from public.workbook_drafts where id = p_draft;
  if d.id is null or d.number <> 1 or p_revision is null
    or not exists(select 1 from public.workbook_draft_revisions where draft_id = p_draft and revision = p_revision) then
    return jsonb_build_object('status', 'refused');
  end if;
  insert into public.workbook_book1_baseline_tries as t(draft_id, revision, parent_id, child_id)
  values (p_draft, p_revision, d.parent_id, d.child_id)
  on conflict (draft_id, revision) do update set tries = t.tries + 1, last_tried_at = clock_timestamp()
  returning t.tries into n;
  return jsonb_build_object('status', 'noted', 'tries', n);
end $$;
revoke all on function public.note_workbook_book1_baseline_try(uuid, integer) from public, anon, authenticated;
grant execute on function public.note_workbook_book1_baseline_try(uuid, integer) to service_role;

-- The due list: as before, then the least recently tried first, so every due revision gets its turn.
drop function public.due_workbook_book1_baselines(integer);
create function public.due_workbook_book1_baselines(p_limit integer)
returns table(run_id uuid, draft_id uuid, revision integer, parent_id uuid, child_id uuid, actor_id uuid, approved_at timestamptz, tries integer)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (a.workbook_id) a.workbook_id, a.run_id, a.parent_id, a.child_id, a.actor_id, a.at, a.detail
    from public.workbook_audit a
    where a.action = 'workbook-approved' and a.workbook_id is not null
    order by a.workbook_id, a.id desc
  )
  select l.run_id, l.workbook_id, (l.detail->>'revision')::integer, l.parent_id, l.child_id, l.actor_id, l.at, coalesce(t.tries, 0)
  from latest l
  join public.workbook_drafts d on d.id = l.workbook_id and d.parent_id = l.parent_id and d.child_id = l.child_id and d.number = 1
  join public.parents p on p.id = l.parent_id and p.deletion_requested_at is null
  left join public.workbook_book1_baseline_tries t on t.draft_id = l.workbook_id and t.revision = (l.detail->>'revision')::integer
  where l.run_id is not null and l.actor_id is not null and jsonb_typeof(l.detail->'revision') = 'number'
    and not exists(select 1 from public.workbook_book1_baselines b where b.draft_id = l.workbook_id and b.draft_revision = (l.detail->>'revision')::integer)
    and not exists(select 1 from public.workbook_book1_baseline_pending q where q.draft_id = l.workbook_id and q.revision = (l.detail->>'revision')::integer)
    and not exists(select 1 from public.family_deletions f where f.parent_id = l.parent_id)
    and not exists(select 1 from public.child_deletions c where c.child_id = l.child_id)
  order by t.last_tried_at nulls first, l.at, l.workbook_id
  limit greatest(0, least(coalesce(p_limit, 3), 20));
$$;
revoke all on function public.due_workbook_book1_baselines(integer) from public, anon, authenticated;
grant execute on function public.due_workbook_book1_baselines(integer) to service_role;
