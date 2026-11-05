-- Card update order (#554, review of PR #593): one row per child with the newest card update its return took, so a browser
-- history entry or a second tab cannot put an older card back as the plan's default.
--
-- session_id and session_created_at name the Stripe Checkout Session. applied_at is when its card reached Stripe; it is
-- null while that write has not finished, so a return of the same session can try again after a failure.
--
-- Only the server writes, through claim_card_update and finish_card_update, with the secret key. Admins read. Parents and
-- anon read nothing: no policy for them. A family deletion removes the row through the foreign keys (on delete cascade from
-- the parent and the child); there are no files. The family write fence covers new rows and updates. It holds no card data.
-- Additive: one new table and two new service-only functions that the code on main does not use.
create table public.child_card_updates (
  child_id uuid primary key,
  parent_id uuid not null references public.parents (id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 255),
  session_created_at timestamptz not null,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint child_card_updates_child_fkey foreign key (child_id, parent_id) references public.children (id, parent_id) on delete cascade
);
create index child_card_updates_parent_idx on public.child_card_updates (parent_id);

alter table public.child_card_updates enable row level security;
revoke all on table public.child_card_updates from anon, authenticated, service_role;
grant select on table public.child_card_updates to service_role;
grant select on table public.child_card_updates to authenticated;
create policy "Admins read child card updates" on public.child_card_updates
  for select to authenticated using ((select public.is_admin()));

create trigger fence_family_write before insert or update on public.child_card_updates
  for each row execute function public.fence_family_write();

-- One atomic step for one return from Stripe, before any Stripe write. The card setup must be this parent's; with none it
-- writes nothing and answers 'no_match'. A session newer than the row's takes the row and answers 'apply'. Stripe's times
-- are whole seconds, so two sessions of the same second take the order of their ids, and one is always the newest. The
-- row's own session answers 'apply' only while its write has not finished. Every other session answers 'stale'.
create function public.claim_card_update(p_parent uuid, p_card uuid, p_session text, p_session_created_at timestamptz)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card and c.parent_id = p_parent;
  if not found then
    return 'no_match';
  end if;
  insert into public.child_card_updates as t (child_id, parent_id, session_id, session_created_at)
    values (v_child, p_parent, p_session, p_session_created_at)
    on conflict (child_id) do update set
      session_id = excluded.session_id, session_created_at = excluded.session_created_at, applied_at = null, updated_at = now()
    where excluded.session_created_at > t.session_created_at
      or (excluded.session_created_at = t.session_created_at and excluded.session_id collate "C" > t.session_id collate "C");
  if found then
    return 'apply';
  end if;
  return case when exists (select 1 from public.child_card_updates s where s.child_id = v_child and s.session_id = p_session and s.applied_at is null)
    then 'apply' else 'stale' end;
end $$;
revoke all on function public.claim_card_update(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.claim_card_update(uuid, uuid, text, timestamptz) to service_role;

-- After the Stripe write. Marks the session's write as finished when the session still holds the row, and answers the
-- session that holds the row now, or null with no row. An answer that is not p_session means a newer return took the row
-- while this write was on its way, and this write may have landed after the newer one.
create function public.finish_card_update(p_parent uuid, p_card uuid, p_session text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_latest text;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card and c.parent_id = p_parent;
  if not found then
    return null;
  end if;
  update public.child_card_updates set applied_at = now(), updated_at = now()
    where child_id = v_child and session_id = p_session and applied_at is null;
  select s.session_id into v_latest from public.child_card_updates s where s.child_id = v_child;
  return v_latest;
end $$;
revoke all on function public.finish_card_update(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finish_card_update(uuid, uuid, text) to service_role;
