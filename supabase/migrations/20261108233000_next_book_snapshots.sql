-- #476 (S12), D-308. Freeze the next-book snapshot of a delivered Book 1 and admit one draft run for it.
-- Additive only: one new table, one nullable column on workbook_runs, six service-only functions.
-- No scheduler, cron, worker or route is installed. The worker keeps its current plan until the planner owner reads
-- plan_input for a run whose snapshot_id is set.
--
-- One chain per delivered source workbook (revision 1 = the draft's snapshot, 2+ = D-308 refreshes). The Day 7 claim,
-- the backstop claim and the admin action all reach the same chain through the partial unique index
-- next_book_snapshots_chain. A backstop with no accepted scans (#628) writes one held row instead and queues nothing.
--
-- Lock order in every function: parent SHARE (assert_family_writable), then the draft NO KEY UPDATE (as approval
-- takes it), then the source book KEY SHARE and the per-book advisory lock, then the snapshot row FOR UPDATE, then
-- (admission only) start_workbook_run's child and run locks. Nothing here locks a snapshot row before a draft.

create table public.next_book_snapshots (
  id uuid primary key default gen_random_uuid(),
  -- Null only for an admin_prepare chain (no claim existed) and for a #628 held row (the backstop made no claim).
  trigger_id uuid references public.workbook_scan_trigger_claims(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  workbook_id uuid not null,
  number integer not null check (number > 0),
  printed_revision text not null check (printed_revision ~ '^[0-9a-f]{28}$'),
  trigger_reason text not null check (trigger_reason in ('day7_scanned','delivery_backstop','admin_prepare')),
  trigger_at timestamptz not null,
  -- The 30-minute preparation window starts here: the claim time for revision 1, the retake time for a refresh.
  prepare_from timestamptz not null,
  revision integer not null check (revision > 0),
  -- The draft a refresh belongs to. Null for revision 1, which comes before its run makes a draft.
  draft_id uuid references public.workbook_drafts(id) on delete cascade,
  receipt_ids uuid[] not null check (cardinality(receipt_ids) <= 5000),
  delivery_audit_id bigint,
  held_reason text check (held_reason = 'no-accepted-scans-at-backstop'),
  held_at timestamptz,
  actor_id uuid,
  actor_email text check (char_length(actor_email) <= 320),
  frozen_at timestamptz,
  scope jsonb,
  sources jsonb,
  history_fence jsonb,
  progress_snapshot jsonb,
  progress_history jsonb,
  consumed_ledger jsonb,
  pending_items jsonb,
  held_for_later jsonb,
  snapshot_hash text check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  plan_input jsonb,
  plan_hash text check (plan_hash ~ '^[0-9a-f]{64}$'),
  planner_consumed jsonb,
  planner_held jsonb,
  run_id uuid references public.workbook_runs(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  unique (trigger_id, revision),
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  foreign key (workbook_id, parent_id, child_id, number) references public.workbooks(id, parent_id, child_id, number) on delete cascade,
  check ((held_reason is null) = (held_at is null)),
  check (held_reason is null or (trigger_id is null and trigger_reason = 'delivery_backstop' and revision = 1
    and delivery_audit_id is not null and cardinality(receipt_ids) = 0 and frozen_at is null and run_id is null)),
  check (held_reason is not null or trigger_reason = 'admin_prepare' or trigger_id is not null),
  check (trigger_reason <> 'admin_prepare' or (trigger_id is null and actor_id is not null)),
  check ((revision = 1) = (draft_id is null)),
  check (revision = 1 or actor_id is not null),
  check (run_id is null or (revision = 1 and plan_hash is not null)),
  check (plan_hash is null or frozen_at is not null),
  check (num_nulls(frozen_at, scope, sources, history_fence, progress_snapshot, progress_history, consumed_ledger,
    pending_items, held_for_later, snapshot_hash) in (0, 10)),
  check (num_nulls(plan_input, plan_hash, planner_consumed, planner_held) in (0, 4)),
  check (frozen_at is null or (jsonb_typeof(consumed_ledger) = 'array' and jsonb_typeof(pending_items) = 'array'
    and jsonb_typeof(held_for_later) = 'array' and jsonb_typeof(scope) = 'object')),
  check (plan_hash is null or (jsonb_typeof(planner_consumed) = 'array' and jsonb_typeof(planner_held) = 'array'))
);
create index next_book_snapshots_parent on public.next_book_snapshots(parent_id);
create index next_book_snapshots_child on public.next_book_snapshots(child_id);
create index next_book_snapshots_draft on public.next_book_snapshots(draft_id) where draft_id is not null;
create index next_book_snapshots_run on public.next_book_snapshots(run_id) where run_id is not null;
-- One live chain per source workbook, whichever path reaches it first.
create unique index next_book_snapshots_chain on public.next_book_snapshots(workbook_id, revision) where held_reason is null;
-- One held record per #475 backstop hold.
create unique index next_book_snapshots_hold on public.next_book_snapshots(workbook_id, delivery_audit_id) where held_reason is not null;

alter table public.next_book_snapshots enable row level security;
revoke all on public.next_book_snapshots from public, anon, authenticated, service_role;
grant select on public.next_book_snapshots to authenticated, service_role;
create policy "Admins read next book snapshots" on public.next_book_snapshots for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.next_book_snapshots
  for each row execute function public.fence_family_write();
create trigger fence_child_delete_write before insert or update on public.next_book_snapshots
  for each row execute function public.fence_child_delete_write();

-- Identity never changes. A freeze, a plan and a run link are each written once. Cascades only delete.
create function public.guard_next_book_snapshot() returns trigger
language plpgsql set search_path = '' as $$
declare
  frozen text[] := array['frozen_at','scope','sources','history_fence','progress_snapshot','progress_history',
    'consumed_ledger','pending_items','held_for_later','snapshot_hash'];
  planned text[] := array['plan_input','plan_hash','planner_consumed','planner_held'];
begin
  if (to_jsonb(new) - frozen - planned - 'run_id') is distinct from (to_jsonb(old) - frozen - planned - 'run_id')
    or (old.frozen_at is not null and (new.frozen_at, new.scope, new.sources, new.history_fence, new.progress_snapshot,
        new.progress_history, new.consumed_ledger, new.pending_items, new.held_for_later, new.snapshot_hash)
      is distinct from (old.frozen_at, old.scope, old.sources, old.history_fence, old.progress_snapshot,
        old.progress_history, old.consumed_ledger, old.pending_items, old.held_for_later, old.snapshot_hash))
    or (old.plan_hash is not null and (new.plan_input, new.plan_hash, new.planner_consumed, new.planner_held)
      is distinct from (old.plan_input, old.plan_hash, old.planner_consumed, old.planner_held))
    or (old.run_id is not null and new.run_id is distinct from old.run_id) then
    raise exception 'next_book_snapshot_immutable' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.guard_next_book_snapshot() from public, anon, authenticated, service_role;
create trigger guard_next_book_snapshot before update on public.next_book_snapshots
  for each row execute function public.guard_next_book_snapshot();

alter table public.workbook_runs add column snapshot_id uuid references public.next_book_snapshots(id) on delete cascade;
create unique index workbook_runs_snapshot_once on public.workbook_runs(snapshot_id) where snapshot_id is not null;

-- Shared source check. Null when the book is still the shipped, delivered source this chain froze; else a reason.
create function public._next_book_source_problem(p_book uuid, p_revision text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare w public.workbooks;
begin
  select * into w from public.workbooks where id = p_book;
  if not found then return 'source-not-found'; end if;
  if w.number <> 1 then return 'unsupported-source-book'; end if;
  if w.status <> 'shipped' or w.printed_revision is null or w.printed_revision is distinct from p_revision then return 'source-changed'; end if;
  if exists(select 1 from public.child_deletions where child_id = w.child_id) then return 'child-unavailable'; end if;
  -- A later delivered book means the child moved on: this chain can no longer change the next book.
  if exists(select 1 from public.workbooks newer join public.workbook_delivery_receipts d on d.workbook_id = newer.id
      where newer.child_id = w.child_id and newer.number > w.number) then return 'source-changed'; end if;
  return null;
end $$;
revoke all on function public._next_book_source_problem(uuid, text) from public, anon, authenticated, service_role;

create function public._next_book_draft_locked(p_draft uuid, p_parent uuid, p_child uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare d record;
begin
  -- The same row lock approve_workbook_draft takes first: an approval and a refresh wait for each other.
  select id, parent_id, child_id into d from public.workbook_drafts where id = p_draft for no key update;
  if not found or d.parent_id <> p_parent or d.child_id <> p_child then return 'draft-not-found'; end if;
  if exists(select 1 from public.workbooks where id = p_draft and status in ('approved','printed','shipped')) then
    return 'already-approved';
  end if;
  return null;
end $$;
revoke all on function public._next_book_draft_locked(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- Revision 1 for a delivered Book 1. With p_trigger: the #475 claim (day7_scanned or delivery_backstop). Without it:
-- the admin action on p_book, which uses the book's claim when there is one and otherwise starts an admin_prepare chain.
-- Every path returns the one live chain; a lost response is retried with the same call.
create function public.claim_next_book_snapshot(p_trigger uuid, p_book uuid, p_actor uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.workbook_scan_trigger_claims; w public.workbooks; s public.next_book_snapshots; problem text; receipts uuid[];
begin
  if p_trigger is not null then
    select * into t from public.workbook_scan_trigger_claims where id = p_trigger;
    if not found or (p_book is not null and p_book <> t.workbook_id) then
      return jsonb_build_object('status','refused','reason','trigger-not-found');
    end if;
    p_book := t.workbook_id;
  elsif p_book is null or p_actor is null then
    return jsonb_build_object('status','refused','reason','invalid-request');
  end if;
  select * into w from public.workbooks where id = p_book;
  if not found then return jsonb_build_object('status','refused','reason','source-not-found'); end if;
  perform public.assert_family_writable(w.parent_id);
  if p_trigger is null and not exists(select 1 from public.admin_users where user_id = p_actor) then
    return jsonb_build_object('status','refused','reason','admin-required');
  end if;
  perform 1 from public.workbooks where id = p_book for key share;
  perform pg_advisory_xact_lock(hashtextextended('next-book-snapshot:' || p_book::text, 0));
  problem := public._next_book_source_problem(p_book, w.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  select * into s from public.next_book_snapshots where workbook_id = p_book and revision = 1 and held_reason is null;
  if found then return jsonb_build_object('status','ok','snapshot',to_jsonb(s)); end if;
  if t.id is null then
    select * into t from public.workbook_scan_trigger_claims where workbook_id = p_book;
  end if;
  if t.id is not null then
    if t.printed_revision is distinct from w.printed_revision or t.parent_id <> w.parent_id or t.child_id <> w.child_id then
      return jsonb_build_object('status','refused','reason','source-changed');
    end if;
    insert into public.next_book_snapshots(trigger_id, parent_id, child_id, workbook_id, number, printed_revision, trigger_reason,
      trigger_at, prepare_from, revision, receipt_ids, delivery_audit_id, actor_id, actor_email)
      values (t.id, t.parent_id, t.child_id, t.workbook_id, t.number, t.printed_revision, t.reason, t.claimed_at, t.claimed_at, 1,
        t.receipt_ids, t.delivery_audit_id, p_actor, p_email)
      on conflict (workbook_id, revision) where held_reason is null do nothing;
  else
    if not exists(select 1 from public.workbook_delivery_receipts where workbook_id = p_book) then
      return jsonb_build_object('status','refused','reason','missing-delivery');
    end if;
    select coalesce(array_agg(id order by accepted_at, id), '{}') into receipts from public.workbook_scan_receipts
      where workbook_id = p_book and printed_revision = w.printed_revision;
    if cardinality(receipts) = 0 then return jsonb_build_object('status','refused','reason','no-accepted-scans'); end if;
    insert into public.next_book_snapshots(trigger_id, parent_id, child_id, workbook_id, number, printed_revision, trigger_reason,
      trigger_at, prepare_from, revision, receipt_ids, actor_id, actor_email)
      values (null, w.parent_id, w.child_id, w.id, w.number, w.printed_revision, 'admin_prepare', clock_timestamp(), clock_timestamp(), 1,
        receipts, p_actor, p_email)
      on conflict (workbook_id, revision) where held_reason is null do nothing;
  end if;
  select * into s from public.next_book_snapshots where workbook_id = p_book and revision = 1 and held_reason is null;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- #628. The #475 backstop found no accepted scan and recorded a hold, not a claim. Record the chain as held; queue nothing.
-- A live chain (an admin chain, or a later claim) wins over the hold and is returned instead.
create function public.hold_next_book_snapshot(p_book uuid, p_delivery_audit bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.workbooks; h public.workbook_scan_backstop_holds; s public.next_book_snapshots; problem text;
begin
  select * into w from public.workbooks where id = p_book;
  if not found then return jsonb_build_object('status','refused','reason','source-not-found'); end if;
  perform public.assert_family_writable(w.parent_id);
  perform 1 from public.workbooks where id = p_book for key share;
  perform pg_advisory_xact_lock(hashtextextended('next-book-snapshot:' || p_book::text, 0));
  problem := public._next_book_source_problem(p_book, w.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  select * into s from public.next_book_snapshots where workbook_id = p_book and revision = 1 and held_reason is null;
  if found then return jsonb_build_object('status','ok','snapshot',to_jsonb(s)); end if;
  if exists(select 1 from public.workbook_scan_trigger_claims where workbook_id = p_book) then
    return jsonb_build_object('status','refused','reason','claimed');
  end if;
  select * into h from public.workbook_scan_backstop_holds where workbook_id = p_book and delivery_audit_id = p_delivery_audit;
  if not found or h.printed_revision is distinct from w.printed_revision then
    return jsonb_build_object('status','refused','reason','hold-not-found');
  end if;
  insert into public.next_book_snapshots(trigger_id, parent_id, child_id, workbook_id, number, printed_revision, trigger_reason,
    trigger_at, prepare_from, revision, receipt_ids, delivery_audit_id, held_reason, held_at)
    values (null, w.parent_id, w.child_id, w.id, w.number, w.printed_revision, 'delivery_backstop', h.backstop_at, h.held_at, 1,
      '{}', h.delivery_audit_id, h.reason, h.held_at)
    on conflict (workbook_id, delivery_audit_id) where held_reason is not null do nothing;
  select * into s from public.next_book_snapshots where workbook_id = p_book and delivery_audit_id = p_delivery_audit and held_reason is not null;
  return jsonb_build_object('status','held','snapshot',to_jsonb(s));
end $$;

-- The first successful freeze wins; a later caller gets it back unchanged. A refresh cannot freeze after approval.
create function public.save_next_book_snapshot(p_id uuid, p_data jsonb, p_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; problem text; at_time timestamptz; scope_kind text;
begin
  select * into s from public.next_book_snapshots where id = p_id;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  perform public.assert_family_writable(s.parent_id);
  if s.draft_id is not null then
    problem := public._next_book_draft_locked(s.draft_id, s.parent_id, s.child_id);
    if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  end if;
  select * into s from public.next_book_snapshots where id = p_id for update;
  if s.frozen_at is not null then return jsonb_build_object('status','ok','snapshot',to_jsonb(s)); end if;
  if s.held_reason is not null then return jsonb_build_object('status','refused','reason','held'); end if;
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  scope_kind := case when s.revision > 1 then 'refresh' when s.trigger_reason = 'day7_scanned' then 'day7' else 'backstop' end;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'frozenAt') is distinct from 'number'
    or jsonb_typeof(p_data->'scope') is distinct from 'object' or p_data->'scope'->>'kind' is distinct from scope_kind
    or jsonb_typeof(p_data->'sources') is distinct from 'object' or jsonb_typeof(p_data->'historyFence') is distinct from 'object'
    or jsonb_typeof(p_data->'snapshot') is distinct from 'object' or jsonb_typeof(p_data->'history') is distinct from 'object'
    or jsonb_typeof(p_data->'ledger') is distinct from 'array' or jsonb_typeof(p_data->'pending') is distinct from 'array'
    or jsonb_typeof(p_data->'held') is distinct from 'array'
    or p_data->'snapshot'->>'parentId' is distinct from s.parent_id::text or p_data->'snapshot'->>'childId' is distinct from s.child_id::text
    or p_data->'sources'->>'parentId' is distinct from s.parent_id::text or p_data->'sources'->>'childId' is distinct from s.child_id::text
    or p_data->'historyFence'->>'parentId' is distinct from s.parent_id::text or p_data->'historyFence'->>'childId' is distinct from s.child_id::text
    or exists(select 1 from jsonb_array_elements(p_data->'ledger') x where case
      when jsonb_typeof(x) <> 'object' or jsonb_typeof(x->'key') is distinct from 'string'
        or jsonb_typeof(x->'version') is distinct from 'number' then true
      else (x->>'version')::numeric < 1 or (x->>'version')::numeric <> trunc((x->>'version')::numeric) end)
    or (select count(*) <> count(distinct x->>'key') from jsonb_array_elements(p_data->'ledger') x) then
    return jsonb_build_object('status','refused','reason','invalid-snapshot');
  end if;
  at_time := to_timestamp((p_data->>'frozenAt')::numeric / 1000);
  -- The cutoff is the actual freeze time: not before the window opened, and not ahead of this database's clock.
  if at_time < s.prepare_from or at_time > clock_timestamp() + interval '1 minute' then
    return jsonb_build_object('status','refused','reason','invalid-snapshot');
  end if;
  update public.next_book_snapshots set frozen_at = at_time, scope = p_data->'scope', sources = p_data->'sources',
    history_fence = p_data->'historyFence', progress_snapshot = p_data->'snapshot', progress_history = p_data->'history',
    consumed_ledger = p_data->'ledger', pending_items = p_data->'pending', held_for_later = p_data->'held', snapshot_hash = p_hash
    where id = p_id returning * into s;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- Once per revision. The same plan again is a retry; another plan is a conflict. consumed must lie inside the ledger.
create function public.save_next_book_plan(p_snapshot uuid, p_plan_input jsonb, p_plan_hash text, p_consumed jsonb, p_held jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; problem text;
begin
  select * into s from public.next_book_snapshots where id = p_snapshot;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  perform public.assert_family_writable(s.parent_id);
  if s.draft_id is not null then
    problem := public._next_book_draft_locked(s.draft_id, s.parent_id, s.child_id);
    if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  end if;
  select * into s from public.next_book_snapshots where id = p_snapshot for update;
  if s.plan_hash is not null then
    if s.plan_hash is distinct from p_plan_hash or s.plan_input is distinct from p_plan_input
      or s.planner_consumed is distinct from p_consumed or s.planner_held is distinct from p_held then
      return jsonb_build_object('status','refused','reason','plan-conflict');
    end if;
    return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
  end if;
  if s.frozen_at is null then return jsonb_build_object('status','refused','reason','not-frozen'); end if;
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  if p_plan_hash is null or p_plan_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_plan_input) is distinct from 'object'
    or jsonb_typeof(p_consumed) is distinct from 'array' or jsonb_typeof(p_held) is distinct from 'array'
    or exists(select 1 from jsonb_array_elements(p_held) x where jsonb_typeof(x) <> 'object'
      or jsonb_typeof(x->'key') is distinct from 'string' or jsonb_typeof(x->'reason') is distinct from 'string') then
    return jsonb_build_object('status','refused','reason','invalid-plan');
  end if;
  -- Each consumed entry is exactly {key, version}, names one ledger entry at its frozen version, and appears once.
  if exists(select 1 from jsonb_array_elements(p_consumed) x where case when jsonb_typeof(x) <> 'object' then true
      else (select count(*) from jsonb_object_keys(x)) <> 2 or not (x ?& array['key','version'])
        or not exists(select 1 from jsonb_array_elements(s.consumed_ledger) l
          where l->'key' = x->'key' and l->'version' = x->'version') end)
    or (select count(*) <> count(distinct x->'key') from jsonb_array_elements(p_consumed) x) then
    return jsonb_build_object('status','refused','reason','consumed-outside-ledger');
  end if;
  update public.next_book_snapshots set plan_input = p_plan_input, plan_hash = p_plan_hash, planner_consumed = p_consumed, planner_held = p_held
    where id = p_snapshot returning * into s;
  return jsonb_build_object('status','ok','snapshot',to_jsonb(s));
end $$;

-- D-308 refresh: revision n+1 of the chain that made p_draft, before "Approve for print". Refused after approval, after a
-- source change, and for an older revision. A retried call for the same revision returns the revision it made.
create function public.retake_next_book_snapshot(p_snapshot uuid, p_draft uuid, p_actor uuid, p_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; n public.next_book_snapshots; latest integer; problem text; run uuid; receipts uuid[];
begin
  select * into s from public.next_book_snapshots where id = p_snapshot;
  if not found or s.held_reason is not null then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  if p_draft is null or p_actor is null then return jsonb_build_object('status','refused','reason','invalid-request'); end if;
  perform public.assert_family_writable(s.parent_id);
  if not exists(select 1 from public.admin_users where user_id = p_actor) then
    return jsonb_build_object('status','refused','reason','admin-required');
  end if;
  problem := public._next_book_draft_locked(p_draft, s.parent_id, s.child_id);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  select r.id into run from public.next_book_snapshots c join public.workbook_runs r on r.id = c.run_id
    where c.workbook_id = s.workbook_id and c.revision = 1 and c.held_reason is null and r.draft_id = p_draft;
  if run is null then return jsonb_build_object('status','refused','reason','draft-mismatch'); end if;
  perform 1 from public.workbooks where id = s.workbook_id for key share;
  perform pg_advisory_xact_lock(hashtextextended('next-book-snapshot:' || s.workbook_id::text, 0));
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  select max(revision) into latest from public.next_book_snapshots where workbook_id = s.workbook_id and held_reason is null;
  if latest = s.revision + 1 then
    select * into n from public.next_book_snapshots where workbook_id = s.workbook_id and revision = latest and held_reason is null;
    return jsonb_build_object('status','ok','snapshot',to_jsonb(n));
  end if;
  if latest <> s.revision then return jsonb_build_object('status','refused','reason','stale-revision'); end if;
  select * into s from public.next_book_snapshots where id = p_snapshot for update;
  if s.plan_hash is null then return jsonb_build_object('status','refused','reason','not-planned'); end if;
  select coalesce(array_agg(id order by accepted_at, id), '{}') into receipts from public.workbook_scan_receipts
    where workbook_id = s.workbook_id and printed_revision = s.printed_revision;
  insert into public.next_book_snapshots(trigger_id, parent_id, child_id, workbook_id, number, printed_revision, trigger_reason,
    trigger_at, prepare_from, revision, draft_id, receipt_ids, delivery_audit_id, actor_id, actor_email)
    values (s.trigger_id, s.parent_id, s.child_id, s.workbook_id, s.number, s.printed_revision, s.trigger_reason,
      s.trigger_at, clock_timestamp(), s.revision + 1, p_draft, receipts, s.delivery_audit_id, p_actor, p_email)
    returning * into n;
  insert into public.workbook_audit(parent_id, child_id, run_id, draft_id, workbook_id, actor_id, actor_email, action, detail)
    values (s.parent_id, s.child_id, run, p_draft, s.workbook_id, p_actor, p_email, 'snapshot-retaken',
      jsonb_build_object('snapshotId', n.id, 'revision', n.revision, 'from', s.id));
  return jsonb_build_object('status','ok','snapshot',to_jsonb(n));
end $$;

-- One run per chain, from revision 1's saved plan, through start_workbook_run's own rules (one active run per child,
-- stalled and busy answers, the family and plan fences). Only a run this call started receives the snapshot.
create function public.admit_next_book_run(p_snapshot uuid, p_by uuid, p_email text, p_max_attempts integer, p_stale_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.next_book_snapshots; answer jsonb; rid uuid; problem text;
begin
  select * into s from public.next_book_snapshots where id = p_snapshot;
  if not found then return jsonb_build_object('status','refused','reason','snapshot-not-found'); end if;
  perform public.assert_family_writable(s.parent_id);
  select * into s from public.next_book_snapshots where id = p_snapshot for update;
  if s.run_id is not null then return jsonb_build_object('status','started','run',s.run_id,'existing',true); end if;
  if s.held_reason is not null then return jsonb_build_object('status','refused','reason','held'); end if;
  if s.revision <> 1 then return jsonb_build_object('status','refused','reason','refresh-does-not-start-run'); end if;
  if s.plan_hash is null then return jsonb_build_object('status','refused','reason','not-planned'); end if;
  problem := public._next_book_source_problem(s.workbook_id, s.printed_revision);
  if problem is not null then return jsonb_build_object('status','refused','reason',problem); end if;
  if exists(select 1 from public.workbooks where child_id = s.child_id and number > s.number) then
    return jsonb_build_object('status','refused','reason','next-book-exists');
  end if;
  answer := public.start_workbook_run(s.child_id, p_by, p_email, p_max_attempts, p_stale_seconds);
  if answer->>'status' <> 'started' then return answer; end if;
  rid := (answer->>'run')::uuid;
  update public.workbook_runs set snapshot_id = s.id where id = rid;
  update public.next_book_snapshots set run_id = rid where id = s.id;
  insert into public.workbook_audit(parent_id, child_id, run_id, workbook_id, actor_id, actor_email, action, detail)
    values (s.parent_id, s.child_id, rid, s.workbook_id, p_by, p_email, 'snapshot-run-admitted',
      jsonb_build_object('snapshotId', s.id, 'planHash', s.plan_hash, 'reason', s.trigger_reason));
  return jsonb_build_object('status','started','run',rid,'existing',false);
end $$;

do $$ declare f text; begin
  foreach f in array array['public.claim_next_book_snapshot(uuid,uuid,uuid,text)', 'public.hold_next_book_snapshot(uuid,bigint)',
    'public.save_next_book_snapshot(uuid,jsonb,text)', 'public.save_next_book_plan(uuid,jsonb,text,jsonb,jsonb)',
    'public.retake_next_book_snapshot(uuid,uuid,uuid,text)', 'public.admit_next_book_run(uuid,uuid,text,integer,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
