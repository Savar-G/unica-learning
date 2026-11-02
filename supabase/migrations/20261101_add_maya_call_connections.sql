-- Maya's voice calls (#326, spec #297): when the child and Maya joined and left a voice call's room, one row per event.
-- Maya's voice worker (worker/maya-voice) writes them with its secret key as they happen; when the call ends, the call
-- module (src/lib/maya-call.ts) counts the seconds the child and Maya were both connected from them and stores that in
-- maya_calls.connected_seconds (a column kept for it since add_maya_calls, with voice and speech_to_text). The minutes
-- ledger (#329) will count from the same rows. Signs of mishearing (number confirmations and "no, I said" corrections)
-- are the existing maya_calls.mishearing_confirmations and mishearing_corrections, from the call's outcome. No audio is
-- stored anywhere: the rows hold an event kind and two times.
--
-- Only the server writes, with the secret key, and only appends: the service role may insert and read, never update or
-- delete. Admins read. Parents read nothing yet: the parent's notes (#333) add their own read. A row names its call
-- and that call's own family (one foreign key on the three columns), so it can never point at another family's call,
-- and only a voice call takes rows (trigger). A family deletion removes the rows through the foreign keys (on delete
-- cascade from the call, the parent and the child); there are no files. The family write fence covers new rows.
--
-- at: the worker's clock (a server); refused when more than a minute ahead of the database's clock or a day behind it.
-- Additive: one new table, one new unique index on maya_calls (its id is already unique), one new trigger function.
create unique index maya_calls_id_family_key on public.maya_calls (id, parent_id, child_id);

create table public.maya_call_connections (
  id bigint generated always as identity primary key,
  call_id uuid not null,
  parent_id uuid not null references public.parents (id) on delete cascade,
  child_id uuid not null,
  kind text not null check (kind in ('agent_joined', 'agent_left', 'child_joined', 'child_left')),
  at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint maya_call_connections_call_fkey foreign key (call_id, parent_id, child_id)
    references public.maya_calls (id, parent_id, child_id) on delete cascade,
  constraint maya_call_connections_child_fkey foreign key (child_id, parent_id)
    references public.children (id, parent_id) on delete cascade,
  constraint maya_call_connections_at_check check (at <= recorded_at + interval '1 minute' and at >= recorded_at - interval '1 day')
);
create index maya_call_connections_call_idx on public.maya_call_connections (call_id, at);
create index maya_call_connections_parent_idx on public.maya_call_connections (parent_id);
create index maya_call_connections_child_idx on public.maya_call_connections (child_id, parent_id);

alter table public.maya_call_connections enable row level security;
revoke all on table public.maya_call_connections from anon, authenticated, service_role;
grant select, insert on table public.maya_call_connections to service_role;
grant select on table public.maya_call_connections to authenticated;
create policy "Admins read Maya call connections" on public.maya_call_connections
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.maya_call_connections
  for each row execute function public.fence_family_write();

-- Only a voice call has connections.
create function public.maya_call_connection_voice() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.maya_calls c where c.id = new.call_id and c.mode = 'voice') then
    raise exception 'maya_call_not_voice' using errcode = '55000';
  end if;
  return new;
end $$;
revoke all on function public.maya_call_connection_voice() from public, anon, authenticated;
create trigger maya_call_connection_voice before insert on public.maya_call_connections
  for each row execute function public.maya_call_connection_voice();
