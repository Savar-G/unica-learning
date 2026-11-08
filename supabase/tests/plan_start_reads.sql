-- Hosted probe for public.due_plan_start_reads and public.note_plan_start_read_tried (#713, migrations plan_start_reread and
-- plan_start_read_tried). All rows are synthetic. The final exception rolls
-- everything back, so a run that reaches the end reports PROBE_OK and leaves nothing, except the sequence values it took. Run it with
-- the Supabase MCP for project cdjobwsyzndtltzfpyqa. No provider calls.
do $$
declare
  p uuid := gen_random_uuid(); fenced uuid := gen_random_uuid();
  c_none uuid := gen_random_uuid(); c_ended uuid := gen_random_uuid(); c_seen uuid := gen_random_uuid(); c_old uuid := gen_random_uuid();
  c_open uuid := gen_random_uuid(); c_paying uuid := gen_random_uuid(); c_fenced uuid := gen_random_uuid(); c_never uuid := gen_random_uuid();
  c_other uuid := gen_random_uuid(); c_super uuid := gen_random_uuid(); card_other uuid := gen_random_uuid(); card_super uuid := gen_random_uuid();
  card_none uuid := gen_random_uuid(); card_ended uuid := gen_random_uuid(); card_seen uuid := gen_random_uuid(); card_old uuid := gen_random_uuid();
  card_open uuid := gen_random_uuid(); card_paying uuid := gen_random_uuid(); card_fenced uuid := gen_random_uuid(); card_never uuid := gen_random_uuid();
  tag text := replace(p::text, '-', '');
  n integer; r text; ids uuid[];
  t0 timestamptz := '2026-11-01 00:00:00+00';
begin
  insert into auth.users(id, email) values (p, p::text || '@example.invalid'), (fenced, fenced::text || '@example.invalid');
  insert into public.parents(id, name, email, postal) values
    (p, 'Probe parent', p::text || '@example.invalid', 'V6B 1A1'), (fenced, 'Probe fenced', fenced::text || '@example.invalid', 'V6B 1A1');
  insert into public.children(id, parent_id, first_name, grade, province) values
    (c_none, p, 'Probe none', 3, 'BC'), (c_ended, p, 'Probe ended', 3, 'BC'), (c_seen, p, 'Probe seen', 3, 'BC'), (c_old, p, 'Probe old', 3, 'BC'),
    (c_open, p, 'Probe open', 3, 'BC'), (c_paying, p, 'Probe paying', 3, 'BC'), (c_never, p, 'Probe never', 3, 'BC'), (c_fenced, fenced, 'Probe fenced', 3, 'BC'),
    (c_other, p, 'Probe other', 3, 'BC'), (c_super, p, 'Probe super', 3, 'BC');
  insert into public.card_setups(id, parent_id, child_id, plan, price, stripe_customer_id, card_saved_at, workbook_welcome_enabled) values
    (card_none, p, c_none, 'one', 79.99, 'cus_probe_none_' || tag, now(), false),
    (card_ended, p, c_ended, 'one', 79.99, 'cus_probe_ended_' || tag, now(), false),
    (card_seen, p, c_seen, 'one', 79.99, 'cus_probe_seen_' || tag, now(), false),
    (card_old, p, c_old, 'one', 79.99, 'cus_probe_old_' || tag, now(), false),
    (card_open, p, c_open, 'one', 79.99, 'cus_probe_open_' || tag, now(), false),
    (card_paying, p, c_paying, 'one', 79.99, 'cus_probe_paying_' || tag, now(), false),
    (card_never, p, c_never, 'one', 79.99, 'cus_probe_never_' || tag, now(), false),
    (card_fenced, fenced, c_fenced, 'one', 79.99, 'cus_probe_fenced_' || tag, now(), false),
    (card_other, p, c_other, 'one', 79.99, 'cus_probe_other_' || tag, now(), false),
    (card_super, p, c_super, 'one', 79.99, 'cus_probe_super_' || tag, now(), false);
  -- Plan starts. c_never has none at all.
  insert into public.plan_starts(card_setup_id, generation, parent_id, start_key, payment_method_id, state, started_at, finished_at, subscription_id) values
    (card_none, 1, p, 'key_none_' || tag, 'pm_probe', 'started', now() - interval '2 minutes', now() - interval '1 minute', 'sub_none'),
    (card_ended, 1, p, 'key_ended1_' || tag, 'pm_probe', 'started', now() - interval '90 days', now() - interval '90 days', 'sub_ended1'),
    (card_ended, 2, p, 'key_ended2_' || tag, 'pm_probe', 'started', now() - interval '2 minutes', now() - interval '1 minute', 'sub_ended2'),
    (card_seen, 1, p, 'key_seen_' || tag, 'pm_probe', 'started', now() - interval '2 hours', now() - interval '2 hours', 'sub_seen'),
    (card_old, 1, p, 'key_old_' || tag, 'pm_probe', 'started', now() - interval '41 days', now() - interval '41 days', 'sub_old'),
    (card_open, 1, p, 'key_open1_' || tag, 'pm_probe', 'started', now() - interval '20 days', now() - interval '20 days', 'sub_open1'),
    (card_paying, 1, p, 'key_paying_' || tag, 'pm_probe', 'started', now() - interval '2 minutes', now() - interval '1 minute', 'sub_paying'),
    (card_fenced, 1, fenced, 'key_fenced_' || tag, 'pm_probe', 'started', now() - interval '2 minutes', now() - interval '1 minute', 'sub_fenced'),
    -- c_other's only start found another plan running; c_super's newer `other` start supersedes an older `started` one. No rows.
    (card_other, 1, p, 'key_other_' || tag, 'pm_probe', 'other', now() - interval '2 minutes', now() - interval '1 minute', 'sub_other'),
    (card_super, 1, p, 'key_super1_' || tag, 'pm_probe', 'started', now() - interval '3 days', now() - interval '3 days', 'sub_super1'),
    (card_super, 2, p, 'key_super2_' || tag, 'pm_probe', 'other', now() - interval '2 minutes', now() - interval '1 minute', 'sub_super2');
  insert into public.plan_starts(card_setup_id, generation, parent_id, start_key, payment_method_id, started_at) values
    (card_open, 2, p, 'key_open2_' || tag, 'pm_probe', now() - interval '1 minute');

  set local role service_role;
  -- Rows: an ended row last read before its restart finished; a not_started row read after its start; old rows; an open row.
  perform public.save_child_plan_state('cus_probe_ended_' || tag, 'ended', null, t0, null, false, t0, 'evt_ended', public.take_plan_read_order());
  perform public.save_child_plan_state('cus_probe_seen_' || tag, 'not_started', null, null, null, false, null, null, public.take_plan_read_order());
  perform public.save_child_plan_state('cus_probe_old_' || tag, 'ended', null, t0, null, false, t0, 'evt_old', public.take_plan_read_order());
  perform public.save_child_plan_state('cus_probe_open_' || tag, 'ended', null, t0, null, false, t0, 'evt_open', public.take_plan_read_order());
  perform public.save_child_plan_state('cus_probe_paying_' || tag, 'paying', t0 + interval '30 days', null, 7999, false, t0, 'evt_paying', public.take_plan_read_order());
  perform public.save_child_plan_state('cus_probe_never_' || tag, 'ended', null, t0, null, false, t0, 'evt_never', public.take_plan_read_order());
  reset role;
  update public.child_plan_states set read_at = now() - interval '10 minutes' where child_id = c_ended;
  update public.child_plan_states set read_at = now() - interval '1 hour' where child_id = c_seen;
  update public.child_plan_states set read_at = now() - interval '30 days' where child_id in (c_old, c_open, c_never, c_paying);
  -- A fenced family is left out.
  update public.parents set deletion_requested_at = now() where id = fenced;

  set local role service_role;
  select array_agg(d.child_id) into ids from public.due_plan_start_reads(1000) d where d.parent_id in (p, fenced);
  -- Neither was tried yet, so the order is by child id.
  if ids is distinct from (select array_agg(x order by x) from unnest(array[c_none, c_ended]) x) then raise exception 'due children were %', ids; end if;
  -- An `other` start is never read, alone or after an older started one.
  if exists (select 1 from public.due_plan_start_reads(1000) d where d.child_id in (c_other, c_super)) then raise exception 'an other start was due'; end if;
  select count(*) into n from public.due_plan_start_reads(1000) d where d.child_id = c_none and d.kind is null and d.event_at is null and d.customer = 'cus_probe_none_' || tag and d.parent_id = p;
  if n <> 1 then raise exception 'the child with no row is not named as one'; end if;
  select count(*) into n from public.due_plan_start_reads(1000) d where d.child_id = c_ended and d.kind = 'ended' and d.event_at = t0;
  if n <> 1 then raise exception 'the ended row does not carry its kind and event time'; end if;
  -- The old start rows stay out of due_plan_reads.
  if exists (select 1 from public.due_plan_reads(1000) d where d.child_id in (c_none, c_ended, c_seen)) then raise exception 'due_plan_reads took a start row'; end if;

  -- A row read after its start but not for 24 hours is due again, inside the 40 days.
  reset role;
  update public.child_plan_states set read_at = now() - interval '25 hours' where child_id = c_seen;
  set local role service_role;
  if not exists (select 1 from public.due_plan_start_reads(1000) d where d.child_id = c_seen and d.kind = 'not_started') then raise exception 'a not_started row unread for a day was not due'; end if;

  -- The start note moves a child behind, a child with no row too; a start never tried comes first.
  perform public.note_plan_start_read_tried(c_none);
  select array_agg(d.child_id) into ids from public.due_plan_start_reads(1000) d where d.parent_id = p;
  if ids is distinct from array[c_seen, c_ended, c_none] and ids is distinct from array[c_ended, c_seen, c_none] then raise exception 'a tried start did not go behind: %', ids; end if;
  perform public.note_plan_start_read_tried(c_seen);
  perform pg_sleep(0.01);
  perform public.note_plan_start_read_tried(c_ended);
  select array_agg(d.child_id) into ids from public.due_plan_start_reads(1000) d where d.parent_id = p;
  if ids is distinct from array[c_none, c_seen, c_ended] then raise exception 'the starts did not take turns: %', ids; end if;
  -- The row's own note does not change the start order.
  perform public.note_plan_read_tried(c_none);
  select array_agg(d.child_id) into ids from public.due_plan_start_reads(1000) d where d.parent_id = p;
  if ids is distinct from array[c_none, c_seen, c_ended] then raise exception 'the row note moved a start: %', ids; end if;
  -- The note writes only the newest record, and only when it is started.
  perform public.note_plan_start_read_tried(c_open);
  perform public.note_plan_start_read_tried(c_super);
  reset role;
  if (select read_tried_at from public.plan_starts where card_setup_id = card_ended and generation = 1) is not null then raise exception 'an older record was noted'; end if;
  if (select read_tried_at from public.plan_starts where card_setup_id = card_ended and generation = 2) is null then raise exception 'the newest record was not noted'; end if;
  if exists (select 1 from public.plan_starts where card_setup_id in (card_open, card_super) and read_tried_at is not null) then raise exception 'a record that is not the newest started one was noted'; end if;
  set local role service_role;
  -- A stored read takes a child off the list.
  r := public.save_child_plan_state('cus_probe_ended_' || tag, 'paying', t0 + interval '30 days', null, 7999, false, t0, 'plan-read:probe-ended', public.take_plan_read_order());
  if r <> 'stored' then raise exception 'reopen answered %', r; end if;
  -- With no row, the read stores at the Unix start time, so no Stripe event reads as older.
  r := public.save_child_plan_state('cus_probe_none_' || tag, 'free_month', now() + interval '30 days', null, 7999, false, 'epoch', 'plan-read:probe-none', public.take_plan_read_order());
  if r <> 'stored' then raise exception 'fill answered %', r; end if;
  select array_agg(d.child_id) into ids from public.due_plan_start_reads(1000) d where d.parent_id = p;
  if ids is distinct from array[c_seen] then raise exception 'stored rows stayed due: %', ids; end if;
  -- The open kinds now belong to due_plan_reads, after 24 hours.
  if exists (select 1 from public.due_plan_reads(1000) d where d.child_id in (c_none, c_ended)) then raise exception 'a fresh row was due in due_plan_reads'; end if;
  -- A start-backed ended answer stores and leaves the list until a day passes.
  r := public.save_child_plan_state('cus_probe_seen_' || tag, 'ended', null, t0, null, false, t0, 'plan-read:probe-seen', public.take_plan_read_order());
  if r <> 'stored' then raise exception 'ended read answered %', r; end if;
  if exists (select 1 from public.due_plan_start_reads(1000) d where d.parent_id = p) then raise exception 'a read row stayed due'; end if;
  reset role;

  -- A family being deleted is not noted.
  set local role service_role;
  begin
    perform public.note_plan_start_read_tried(c_fenced);
    raise exception 'a fenced family was noted';
  exception when sqlstate '55000' then null;
  end;
  reset role;

  -- Parents and anon cannot call them.
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.due_plan_start_reads(1);
    raise exception 'a parent read the due start rows';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.note_plan_start_read_tried(c_none);
    raise exception 'a parent noted a start';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role anon;
  begin
    perform public.due_plan_start_reads(1);
    raise exception 'anon read the due start rows';
  exception when insufficient_privilege then null;
  end;
  reset role;

  raise exception 'PROBE_OK';
end $$;
