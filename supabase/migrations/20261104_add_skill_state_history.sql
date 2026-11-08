-- Applied to project "pagewise" (cdjobwsyzndtltzfpyqa) as migration add_skill_state_history, 2026-11-04.
-- The skill state history (#550, spec #544): one append-only row each time a BC standard's state changes for a child,
-- with the reason and the source of the evidence. Written by the rebuild that writes public.child_profiles
-- (src/lib/child-profile.ts). No row for a standard means Not started. The rule is src/lib/assessment/skill-state.ts.
--
-- Only the server writes, with the secret key. The service role may read the table and call
-- record_skill_state_changes; it has no direct insert, update, delete or truncate grant, and a trigger refuses every
-- update, from any role. Admins read. Parents and anon read nothing: no policy for them, and later only through the
-- parent view module on the server.
-- A family deletion removes the rows through the foreign keys (on delete cascade from the parent and the child), which
-- run as the table owner; there are no files. The family write fence covers new rows. The rows name no test, so a test
-- deletion leaves them; the next rebuild adds the change it causes.
-- Additive: one new table and one new service-only function that the code on main does not use.
--
-- id: orders one child's rows. The function holds the child's profile row, so for one child the order of the ids is the
--   order of the changes (changed_at alone can tie, and a transaction's start time can be out of order).
-- reason, evidence_source: why the state holds, and where that comes from.
create table public.skill_state_history (
  id bigint generated always as identity primary key,
  child_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  standard text not null check (char_length(standard) between 1 and 20),
  state text not null check (state in ('mastered', 'working_on', 'needs_review', 'not_started')),
  reason text not null check (reason in (
    'failed_review', 'secure_on_test', 'held_on_review', 'in_workbook', 'needs_attention_on_test',
    'above_school_grade', 'early_sign_on_test', 'developing_on_test', 'no_evidence'
  )),
  evidence_source text not null check (evidence_source in ('test', 'pages', 'workbook', 'none')),
  changed_at timestamptz not null default clock_timestamp(),
  constraint skill_state_history_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index skill_state_history_child_standard_idx on public.skill_state_history (child_id, standard, id desc);
create index skill_state_history_parent_idx on public.skill_state_history (parent_id);

alter table public.skill_state_history enable row level security;
revoke all on table public.skill_state_history from anon, authenticated, service_role;
grant select on table public.skill_state_history to service_role;
grant select on table public.skill_state_history to authenticated;
create policy "Admins read skill state history" on public.skill_state_history
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.skill_state_history
  for each row execute function public.fence_family_write();

-- Append only: no role changes a stored row.
create function public.refuse_skill_state_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'skill state history is append only' using errcode = '55000';
end $$;
revoke all on function public.refuse_skill_state_update() from public, anon, authenticated;
create trigger refuse_update before update on public.skill_state_history
  for each row execute function public.refuse_skill_state_update();

-- Adds one row for each state in p_states that differs from the standard's latest row (no row: not_started), in one
-- transaction, only while p_build is the child's stored build. The row lock on the profile holds off a newer build's
-- save and a second call, so two rebuilds never both add the same change, and a slower rebuild never writes over a newer
-- one. A family being deleted fails with 55000 family_unavailable. Returns how many rows it added, or null when p_build
-- is not the stored build (the newer build writes its own states).
create function public.record_skill_state_changes(p_child uuid, p_parent uuid, p_build uuid, p_states jsonb)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_added int;
begin
  if p_states is null or jsonb_typeof(p_states) <> 'array' or jsonb_array_length(p_states) > 1000 then
    raise exception 'skill_states_invalid: states must be an array of at most 1000' using errcode = '22023';
  end if;
  perform public.assert_family_writable(p_parent);
  perform 1 from public.child_profiles where child_id = p_child and parent_id = p_parent and build_token = p_build for update;
  if not found then
    return null;
  end if;
  with added as (
    insert into public.skill_state_history (child_id, parent_id, standard, state, reason, evidence_source)
    select p_child, p_parent, s.standard, s.state, s.reason, s.evidence
    from jsonb_to_recordset(p_states) as s(standard text, state text, reason text, evidence text)
    where s.state is distinct from coalesce((
      select h.state from public.skill_state_history h
      where h.child_id = p_child and h.standard = s.standard
      order by h.id desc limit 1
    ), 'not_started')
    returning 1
  )
  select count(*)::int into v_added from added;
  return v_added;
end $$;
revoke all on function public.record_skill_state_changes(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_skill_state_changes(uuid, uuid, uuid, jsonb) to service_role;
