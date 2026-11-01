-- Maya's wording history (#375, D-196): one row per child, holding which of Maya's wordings the child heard and when,
-- so a later call prefers the wordings the child has not heard lately (src/lib/maya/variety.ts). `heard` is a jsonb
-- object from wording id (`<template key>#<index>` or `phrase:<group>.<index>`) to the time the child last heard it, in
-- ms since 1970. Only the newest p_max wordings are kept (MAX_WORDINGS in src/lib/maya/wording-history.ts).
-- The store is src/lib/maya-wording-history-store.ts.
--
-- Only the server reads and writes, with the secret key. The service role may read the table and call
-- record_maya_wordings; it has no direct insert, update or delete grant, so every write is the atomic merge below.
-- Admins read (to look into a call's wording). Parents and anon read nothing: no grant, and no policy for them.
-- A family deletion removes the row through the foreign keys (on delete cascade from the parent and the child); there
-- are no files. The family write fence covers new rows and updates.
-- Additive: one new table and one new service-only function that the code on main does not use.
create table public.maya_wording_history (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  updated_at timestamptz not null default now(),
  heard jsonb not null default '{}'::jsonb check (jsonb_typeof(heard) = 'object' and pg_column_size(heard) < 500000),
  constraint maya_wording_history_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index maya_wording_history_parent_idx on public.maya_wording_history (parent_id);

alter table public.maya_wording_history enable row level security;
revoke all on table public.maya_wording_history from anon, authenticated, service_role;
grant select on table public.maya_wording_history to service_role;
grant select on table public.maya_wording_history to authenticated;
create policy "Admins read Maya wording history" on public.maya_wording_history
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_wording_history
  for each row execute function public.fence_family_write();

-- Adds what one call said to the child's history, in one transaction under the row's lock, so two calls of the same
-- child that end together both keep their wordings: the insert makes the row if there is none (a second insert waits
-- for the first and does nothing), then `for update` holds the row while the merge reads and writes it. Each wording
-- keeps its newest time; then only the newest p_max are kept, ties by id (as mergeHistory does). A child that is gone
-- writes nothing and returns null; otherwise it returns how many wordings the row keeps.
create function public.record_maya_wordings(p_child uuid, p_heard jsonb, p_max int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid;
  v_merged jsonb;
begin
  if p_heard is null or jsonb_typeof(p_heard) <> 'object' then
    raise exception 'maya_wordings_invalid: heard must be an object' using errcode = '22023';
  end if;
  if p_max is null or p_max < 1 or p_max > 5000 then
    raise exception 'maya_wordings_invalid: max must be 1 to 5000' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(p_heard) e where jsonb_typeof(e.value) <> 'number' or char_length(e.key) not between 1 and 200) then
    raise exception 'maya_wordings_invalid: each wording id is 1 to 200 characters and each time a number' using errcode = '22023';
  end if;
  select c.parent_id into v_parent from public.children c where c.id = p_child;
  if not found then
    return null;
  end if;
  insert into public.maya_wording_history (child_id, parent_id) values (p_child, v_parent) on conflict (child_id) do nothing;
  perform 1 from public.maya_wording_history where child_id = p_child for update;
  select coalesce(jsonb_object_agg(t.id, t.at), '{}'::jsonb) into v_merged from (
    select u.id, max(u.at) as at
    from (
      select e.key as id, (e.value #>> '{}')::numeric as at from public.maya_wording_history h, jsonb_each(h.heard) e where h.child_id = p_child
      union all
      select e.key, (e.value #>> '{}')::numeric from jsonb_each(p_heard) e
    ) u
    group by u.id
    order by max(u.at) desc, u.id collate "C" asc
    limit p_max
  ) t;
  update public.maya_wording_history set heard = v_merged, updated_at = now() where child_id = p_child;
  return (select count(*)::int from jsonb_object_keys(v_merged));
end $$;
revoke all on function public.record_maya_wordings(uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.record_maya_wordings(uuid, jsonb, int) to service_role;
