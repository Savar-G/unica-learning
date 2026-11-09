-- #476. A trigger owns one revision chain. These rows go with the family and child on deletion.
-- This migration adds no scheduler and does not start a worker.
create table public.next_book_snapshots (
  id uuid primary key default gen_random_uuid(),
  trigger_id uuid not null references public.workbook_scan_trigger_claims(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null references public.workbooks(id) on delete cascade,
  printed_revision text not null,
  trigger_reason text not null check (trigger_reason in ('day7_scanned','delivery_backstop')),
  trigger_at timestamptz not null,
  revision integer not null check (revision > 0),
  draft_id uuid references public.workbook_drafts(id) on delete cascade,
  receipt_ids uuid[] not null,
  frozen_at timestamptz,
  scope jsonb,
  sources jsonb,
  history_fence jsonb,
  progress_snapshot jsonb,
  progress_history jsonb,
  consumed_ledger jsonb,
  pending_items jsonb,
  held_for_later jsonb,
  snapshot_hash text check (snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'),
  plan_input jsonb,
  plan_hash text check (plan_hash is null or plan_hash ~ '^[0-9a-f]{64}$'),
  planner_consumed jsonb,
  planner_held jsonb,
  run_id uuid references public.workbook_runs(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (trigger_id, revision),
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  check ((frozen_at is null and snapshot_hash is null) or (frozen_at is not null and snapshot_hash is not null)),
  check ((plan_hash is null and plan_input is null and planner_consumed is null and planner_held is null)
      or (plan_hash is not null and plan_input is not null and planner_consumed is not null and planner_held is not null))
);
create index next_book_snapshots_parent on public.next_book_snapshots(parent_id);
alter table public.next_book_snapshots enable row level security;
revoke all on public.next_book_snapshots from public, anon, authenticated, service_role;
grant select on public.next_book_snapshots to authenticated, service_role;
create policy "Admins read next book snapshots" on public.next_book_snapshots for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.next_book_snapshots for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.next_book_snapshots for each row execute function public.fence_child_delete_write();

alter table public.workbook_runs add column snapshot_id uuid references public.next_book_snapshots(id) on delete set null;
create unique index workbook_runs_snapshot_once on public.workbook_runs(snapshot_id) where snapshot_id is not null;

-- Claim the same row after a lost response. Receipt IDs come from the immutable trigger, not the caller.
create function public.claim_next_book_snapshot(p_trigger uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.workbook_scan_trigger_claims; s public.next_book_snapshots; w public.workbooks;
begin
  select * into t from public.workbook_scan_trigger_claims where id=p_trigger;
  if not found then return jsonb_build_object('status','refused','reason','trigger-not-found'); end if;
  select * into w from public.workbooks where id=t.workbook_id for key share;
  if w.number <> 1 then return jsonb_build_object('status','refused','reason','unsupported-source-book'); end if;
  if w.status <> 'shipped' or w.printed_revision is distinct from t.printed_revision then
    return jsonb_build_object('status','refused','reason','source-changed');
  end if;
  insert into public.next_book_snapshots(trigger_id,parent_id,child_id,workbook_id,printed_revision,trigger_reason,trigger_at,revision,receipt_ids)
    values(t.id,t.parent_id,t.child_id,t.workbook_id,t.printed_revision,t.reason,t.claimed_at,1,t.receipt_ids)
    on conflict(trigger_id,revision) do nothing;
  select * into s from public.next_book_snapshots where trigger_id=t.id and revision=1;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- The first successful freeze wins. A later caller reads it; it cannot rewrite the cutoff or evidence.
create function public.save_next_book_snapshot(p_id uuid,p_data jsonb,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.next_book_snapshots;
begin
  select * into s from public.next_book_snapshots where id=p_id;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  if s.draft_id is not null then
    perform 1 from public.workbook_drafts where id=s.draft_id for no key update;
    if not found or exists(select 1 from public.workbooks where id=s.draft_id and status in ('approved','printed','shipped')) then
      return jsonb_build_object('status','refused','reason','already-approved');
    end if;
  end if;
  select * into s from public.next_book_snapshots where id=p_id for update;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  if s.frozen_at is null then
    if p_hash !~ '^[0-9a-f]{64}$' or p_data is null or p_data->'frozenAt' is null
      or p_data->'scope' is null or p_data->'sources' is null or p_data->'historyFence' is null
      or p_data->'snapshot' is null or p_data->'history' is null or p_data->'ledger' is null
      or p_data->'pending' is null or p_data->'held' is null then
      return jsonb_build_object('status','refused','reason','invalid-snapshot');
    end if;
    update public.next_book_snapshots set frozen_at=(p_data->>'frozenAt')::timestamptz,scope=p_data->'scope',sources=p_data->'sources',
      history_fence=p_data->'historyFence',progress_snapshot=p_data->'snapshot',progress_history=p_data->'history',
      consumed_ledger=p_data->'ledger',pending_items=p_data->'pending',held_for_later=p_data->'held',snapshot_hash=p_hash
      where id=p_id returning * into s;
  end if;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- Lock the draft as approval does. A stale revision cannot make another refresh.
create function public.retake_next_book_snapshot(p_snapshot uuid,p_draft uuid,p_actor uuid,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.next_book_snapshots; n public.next_book_snapshots; d public.workbook_drafts; w public.workbooks; r public.workbook_runs;
begin
  select * into s from public.next_book_snapshots where id=p_snapshot;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  select * into d from public.workbook_drafts where id=p_draft for no key update;
  if not found or d.parent_id<>s.parent_id or d.child_id<>s.child_id then return jsonb_build_object('status','refused','reason','draft-not-found'); end if;
  select * into r from public.workbook_runs where draft_id=d.id and snapshot_id in
    (select id from public.next_book_snapshots where trigger_id=s.trigger_id) order by created_at limit 1;
  if not found then return jsonb_build_object('status','refused','reason','draft-mismatch'); end if;
  if exists(select 1 from public.workbooks where id=d.id and status in ('approved','printed','shipped')) then
    return jsonb_build_object('status','refused','reason','already-approved');
  end if;
  select * into w from public.workbooks where id=s.workbook_id for key share;
  if not found or w.status<>'shipped' or w.printed_revision is distinct from s.printed_revision
    or exists(select 1 from public.workbooks newer join public.workbook_delivery_receipts delivery on delivery.workbook_id=newer.id
      where newer.child_id=s.child_id and newer.number>w.number) then
    return jsonb_build_object('status','refused','reason','source-changed');
  end if;
  perform 1 from public.workbook_scan_trigger_claims where id=s.trigger_id for update;
  if s.revision <> (select max(revision) from public.next_book_snapshots where trigger_id=s.trigger_id) then
    return jsonb_build_object('status','refused','reason','stale-revision');
  end if;
  insert into public.next_book_snapshots(trigger_id,parent_id,child_id,workbook_id,printed_revision,trigger_reason,trigger_at,revision,draft_id,receipt_ids)
    select s.trigger_id,s.parent_id,s.child_id,s.workbook_id,s.printed_revision,s.trigger_reason,s.trigger_at,s.revision+1,d.id,
      coalesce(array_agg(id order by accepted_at,id),'{}'::uuid[]) from public.workbook_scan_receipts
      where workbook_id=s.workbook_id and printed_revision=s.printed_revision;
  select * into n from public.next_book_snapshots where trigger_id=s.trigger_id and revision=s.revision+1;
  insert into public.workbook_audit(parent_id,child_id,run_id,draft_id,workbook_id,actor_id,actor_email,action,detail)
    values(s.parent_id,s.child_id,r.id,d.id,s.workbook_id,p_actor,p_email,'snapshot-retaken',jsonb_build_object('snapshotId',n.id,'revision',n.revision));
  return jsonb_build_object('status','ok','snapshot',to_jsonb(n));
end $$;

-- Serialize on the snapshot. Only a newly started run may receive this snapshot; a busy unrelated run is never adopted.
create function public.admit_next_book_run(p_snapshot uuid,p_plan_input jsonb,p_plan_hash text,p_consumed jsonb,p_held jsonb,
  p_by uuid,p_email text,p_max_attempts integer,p_stale_seconds integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.next_book_snapshots; answer jsonb; rid uuid;
begin
  select * into s from public.next_book_snapshots where id=p_snapshot for update;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  if s.run_id is not null then return jsonb_build_object('status','started','run',s.run_id); end if;
  if s.revision <> 1 then return jsonb_build_object('status','refused','reason','refresh-does-not-start-run'); end if;
  if s.frozen_at is null or p_plan_hash !~ '^[0-9a-f]{64}$' or p_plan_input is null
    or jsonb_typeof(p_consumed)<>'array' or jsonb_typeof(p_held)<>'array'
    or exists(select 1 from jsonb_array_elements(p_consumed) x where not (s.consumed_ledger @> jsonb_build_array(x)))
    or (select count(*)<>count(distinct x->>'key') from jsonb_array_elements(p_consumed) x) then
    return jsonb_build_object('status','refused','reason','invalid-plan');
  end if;
  answer:=public.start_workbook_run(s.child_id,p_by,p_email,p_max_attempts,p_stale_seconds);
  if answer->>'status'<>'started' then return answer; end if;
  rid:=(answer->>'run')::uuid;
  update public.workbook_runs set snapshot_id=s.id where id=rid;
  update public.next_book_snapshots set plan_input=p_plan_input,plan_hash=p_plan_hash,planner_consumed=p_consumed,planner_held=p_held,run_id=rid where id=s.id;
  return answer;
end $$;

revoke all on function public.claim_next_book_snapshot(uuid), public.save_next_book_snapshot(uuid,jsonb,text),
  public.retake_next_book_snapshot(uuid,uuid,uuid,text), public.admit_next_book_run(uuid,jsonb,text,jsonb,jsonb,uuid,text,integer,integer)
  from public,anon,authenticated;
grant execute on function public.claim_next_book_snapshot(uuid), public.save_next_book_snapshot(uuid,jsonb,text),
  public.retake_next_book_snapshot(uuid,uuid,uuid,text), public.admit_next_book_run(uuid,jsonb,text,jsonb,jsonb,uuid,text,integer,integer)
  to service_role;
