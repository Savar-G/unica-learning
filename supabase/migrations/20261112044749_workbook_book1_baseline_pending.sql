-- #870 Book 1 baselines after approval. Additive: one new table and two new service-only functions.
--
-- After an admin approves a Book 1 draft, the approve route tries the baseline capture at once (src/lib/workbook-book1-
-- capture-server.ts). The reminders run (/api/reminders, every 15 minutes) repairs a capture that failed or lost its
-- answer: due_workbook_book1_baselines lists the approved Book 1 revisions that have no baseline and no pending row.
-- A capture that cannot be made in a Vercel function (a run frame with no planning capture, which needs the pinned
-- planner and Git) or that the save refuses for good is recorded here, once, with its reason. The admin run page shows
-- it. Recovery stays local (scripts/book1-baseline-recover.ts). A baseline is never replaced.

-- One row per draft revision whose baseline waits for recovery. Immutable: the first reason stays.
create table public.workbook_book1_baseline_pending (
  draft_id uuid not null references public.workbook_drafts(id) on delete cascade,
  revision integer not null check (revision between 1 and 10000),
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  run_id uuid not null references public.workbook_runs(id) on delete cascade,
  reason text not null check (reason ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (draft_id, revision),
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  foreign key (draft_id, revision) references public.workbook_draft_revisions(draft_id, revision) on delete cascade
);
create index workbook_book1_baseline_pending_family on public.workbook_book1_baseline_pending(parent_id, child_id);

alter table public.workbook_book1_baseline_pending enable row level security;
revoke all on public.workbook_book1_baseline_pending from public, anon, authenticated, service_role;
grant select on public.workbook_book1_baseline_pending to authenticated, service_role;
create policy workbook_book1_baseline_pending_service_read on public.workbook_book1_baseline_pending for select to service_role using (true);
create policy workbook_book1_baseline_pending_admin_read on public.workbook_book1_baseline_pending for select to authenticated
  using (public.workbook_book1_access(parent_id, child_id));
create trigger fence_family_write before insert or update on public.workbook_book1_baseline_pending
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.workbook_book1_baseline_pending
  for each row execute function public.fence_child_delete_write();
create trigger immutable_record before update on public.workbook_book1_baseline_pending
  for each row execute function public.immutable_workbook_book1();

-- The approved Book 1 draft revisions with no baseline and no pending row, oldest approval first. Only each draft's
-- latest approval counts: the save takes only the draft's latest revision, and the source read binds only that one.
create function public.due_workbook_book1_baselines(p_limit integer)
returns table(run_id uuid, draft_id uuid, revision integer, parent_id uuid, child_id uuid, actor_id uuid, approved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with latest as (
    select distinct on (a.workbook_id) a.workbook_id, a.run_id, a.parent_id, a.child_id, a.actor_id, a.at, a.detail
    from public.workbook_audit a
    where a.action = 'workbook-approved' and a.workbook_id is not null
    order by a.workbook_id, a.id desc
  )
  select l.run_id, l.workbook_id, (l.detail->>'revision')::integer, l.parent_id, l.child_id, l.actor_id, l.at
  from latest l
  join public.workbook_drafts d on d.id = l.workbook_id and d.parent_id = l.parent_id and d.child_id = l.child_id and d.number = 1
  join public.parents p on p.id = l.parent_id and p.deletion_requested_at is null
  where l.run_id is not null and l.actor_id is not null and jsonb_typeof(l.detail->'revision') = 'number'
    and not exists(select 1 from public.workbook_book1_baselines b where b.draft_id = l.workbook_id and b.draft_revision = (l.detail->>'revision')::integer)
    and not exists(select 1 from public.workbook_book1_baseline_pending q where q.draft_id = l.workbook_id and q.revision = (l.detail->>'revision')::integer)
    and not exists(select 1 from public.family_deletions f where f.parent_id = l.parent_id)
    and not exists(select 1 from public.child_deletions c where c.child_id = l.child_id)
  order by l.at, l.workbook_id
  limit greatest(0, least(coalesce(p_limit, 3), 20));
$$;
revoke all on function public.due_workbook_book1_baselines(integer) from public, anon, authenticated;
grant execute on function public.due_workbook_book1_baselines(integer) to service_role;

-- Records one pending recovery. Refused (nothing stored) when a baseline already binds that revision, when the
-- revision is not the run's Book 1 draft, or when the family is fenced. A second call keeps the first row.
create function public.record_workbook_book1_baseline_pending(p_run uuid, p_draft uuid, p_revision integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.workbook_runs; d public.workbook_drafts;
begin
  if p_run is null or p_draft is null or p_revision is null or p_reason is null or p_reason !~ '^[a-z0-9-]{1,80}$' then
    return jsonb_build_object('status', 'refused');
  end if;
  select * into r from public.workbook_runs where id = p_run;
  select * into d from public.workbook_drafts where id = p_draft;
  if r.id is null or d.id is null or r.draft_id is distinct from p_draft or d.number <> 1 or (r.parent_id, r.child_id) is distinct from (d.parent_id, d.child_id)
    or not exists(select 1 from public.workbook_draft_revisions where draft_id = p_draft and revision = p_revision) then
    return jsonb_build_object('status', 'refused');
  end if;
  perform public.assert_family_writable(d.parent_id);
  -- The same lock the baseline save takes: a save and this record never cross.
  perform pg_advisory_xact_lock(hashtextextended('scan:' || d.parent_id::text, 0));
  if exists(select 1 from public.workbook_book1_baselines where draft_id = p_draft and draft_revision = p_revision) then
    return jsonb_build_object('status', 'baseline');
  end if;
  insert into public.workbook_book1_baseline_pending(draft_id, revision, parent_id, child_id, run_id, reason)
  values (p_draft, p_revision, d.parent_id, d.child_id, p_run, p_reason)
  on conflict do nothing;
  return jsonb_build_object('status', case when found then 'saved' else 'duplicate' end);
end $$;
revoke all on function public.record_workbook_book1_baseline_pending(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.record_workbook_book1_baseline_pending(uuid, uuid, integer, text) to service_role;
