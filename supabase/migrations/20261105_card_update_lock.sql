-- One writer of a child's card at a time (#554, review round 2 of PR #593). Two races left the wrong card at Stripe: an older
-- return that overtook a newer one and then failed, and a plan start that read the old card before an update finished. The
-- row now holds the newest card and a lock that every Stripe write of a child's card takes.
--
-- payment_method_id: the Stripe id of the newest card a return recorded. An id, never card data. needs_repair: that card may
-- not be on the Customer and every chargeable subscription yet. It is set when the card is recorded and cleared only by a
-- finished write, so a crash at any step leaves it set, and the next return, update or plan start writes the newest card.
-- lock_token, lock_expires_at: the holder. The code starts no Stripe write near the expiry, so an expired lock means its
-- holder's writes can no longer land, and another writer may take it.
--
-- A plan start on a child with no card update yet makes a row with no session and no card, so the two session columns may
-- now be null.
--
-- Additive. claim_card_update and finish_card_update stay, for a deployment of the older head of this pull request; the code
-- on main never called them. Only the server writes, through these functions. Admins read. Parents and anon read nothing.
alter table public.child_card_updates
  alter column session_id drop not null,
  alter column session_created_at drop not null,
  add column payment_method_id text check (char_length(payment_method_id) between 1 and 255),
  add column needs_repair boolean not null default false,
  add column lock_token uuid,
  add column lock_expires_at timestamptz,
  add constraint child_card_updates_session_whole check ((session_id is null) = (session_created_at is null)),
  add constraint child_card_updates_repair_has_card check (not needs_repair or payment_method_id is not null),
  add constraint child_card_updates_lock_whole check ((lock_token is null) = (lock_expires_at is null));

-- Records the session's card when it is the child's newest, then takes the lock. The record happens even when the lock is
-- busy, so the holder sees the newer card before it lets go. Answers as jsonb, in one of these states:
--   no_match: not this parent's card setup; nothing written.
--   clean: a return with nothing to write (session, recorded). Its card, or a newer one, is already everywhere.
--   busy: another writer holds the lock (session, recorded).
--   taken: this caller holds the lock (token, session, payment_method, needs_repair, recorded).
-- recorded is true when this call made p_session the newest. With no p_session (a plan start) the lock is always wanted, so
-- the answer is never clean. Stripe's times are whole seconds, so two sessions of the same second take the order of their ids.
create function public.take_card_lock(
  p_card uuid,
  p_seconds integer,
  p_parent uuid default null,
  p_session text default null,
  p_session_created_at timestamptz default null,
  p_payment_method text default null
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_parent uuid;
  v_row public.child_card_updates;
  v_recorded boolean := false;
  v_token uuid;
begin
  if p_seconds is null or p_seconds not between 60 and 600 then
    raise exception 'card_lock_seconds' using errcode = '22023';
  end if;
  if p_session is not null and (p_session_created_at is null or p_payment_method is null) then
    raise exception 'card_lock_session' using errcode = '22023';
  end if;
  select c.child_id, c.parent_id into v_child, v_parent from public.card_setups c
    where c.id = p_card and (p_parent is null or c.parent_id = p_parent);
  if not found then
    return jsonb_build_object('state', 'no_match');
  end if;
  insert into public.child_card_updates (child_id, parent_id) values (v_child, v_parent) on conflict (child_id) do nothing;
  select * into strict v_row from public.child_card_updates s where s.child_id = v_child for update;
  if p_session is not null then
    if v_row.session_id is null
      or p_session_created_at > v_row.session_created_at
      or (p_session_created_at = v_row.session_created_at and p_session collate "C" > v_row.session_id collate "C") then
      update public.child_card_updates s set
        session_id = p_session, session_created_at = p_session_created_at, payment_method_id = p_payment_method,
        applied_at = null, needs_repair = true, updated_at = now()
        where s.child_id = v_child returning * into v_row;
      v_recorded := true;
    elsif v_row.session_id = p_session and v_row.payment_method_id is null then
      -- A row from before this migration: its session is known, its card only now.
      update public.child_card_updates s set
        payment_method_id = p_payment_method, needs_repair = (s.applied_at is null), updated_at = now()
        where s.child_id = v_child returning * into v_row;
    end if;
    if not v_row.needs_repair then
      return jsonb_build_object('state', 'clean', 'session', v_row.session_id, 'recorded', false);
    end if;
  end if;
  if v_row.lock_token is not null and v_row.lock_expires_at > now() then
    return jsonb_build_object('state', 'busy', 'session', v_row.session_id, 'recorded', v_recorded);
  end if;
  v_token := gen_random_uuid();
  update public.child_card_updates s set lock_token = v_token, lock_expires_at = now() + make_interval(secs => p_seconds), updated_at = now()
    where s.child_id = v_child;
  return jsonb_build_object(
    'state', 'taken', 'token', v_token, 'session', v_row.session_id, 'payment_method', v_row.payment_method_id,
    'needs_repair', v_row.needs_repair, 'recorded', v_recorded
  );
end $$;
revoke all on function public.take_card_lock(uuid, integer, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.take_card_lock(uuid, integer, uuid, text, timestamptz, text) to service_role;

-- The holder's step after a write of p_session's card (p_session is null when the row had no card). Answers as jsonb:
--   lost: this token no longer holds the lock; nothing written.
--   newer: another session is the newest now (session, payment_method): write that card and call again. The lock stays.
--   done: p_wrote, and p_session still is the newest. The row is clean and the lock is free, in one step, so a card recorded
--     after this finds a free lock, and one recorded before this answers newer. No card can fall between the two.
--   unchanged: not p_wrote, and p_session still is the newest. Nothing written; the lock stays.
create function public.finish_card_lock(p_card uuid, p_token uuid, p_session text, p_wrote boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
  v_row public.child_card_updates;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card;
  if not found then
    return jsonb_build_object('state', 'lost');
  end if;
  select * into v_row from public.child_card_updates s where s.child_id = v_child for update;
  if not found or v_row.lock_token is distinct from p_token then
    return jsonb_build_object('state', 'lost');
  end if;
  if v_row.session_id is distinct from p_session then
    return jsonb_build_object('state', 'newer', 'session', v_row.session_id, 'payment_method', v_row.payment_method_id);
  end if;
  if not p_wrote then
    return jsonb_build_object('state', 'unchanged');
  end if;
  update public.child_card_updates s set
    needs_repair = false, lock_token = null, lock_expires_at = null, updated_at = now(),
    applied_at = case when s.session_id is null then null else coalesce(s.applied_at, now()) end
    where s.child_id = v_child;
  return jsonb_build_object('state', 'done');
end $$;
revoke all on function public.finish_card_lock(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.finish_card_lock(uuid, uuid, text, boolean) to service_role;

-- A holder that stops without a finished write lets go. needs_repair stays as it is. Answers whether this token held the lock.
create function public.release_card_lock(p_card uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_child uuid;
begin
  select c.child_id into v_child from public.card_setups c where c.id = p_card;
  if not found then
    return false;
  end if;
  update public.child_card_updates s set lock_token = null, lock_expires_at = null, updated_at = now()
    where s.child_id = v_child and s.lock_token = p_token;
  return found;
end $$;
revoke all on function public.release_card_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_card_lock(uuid, uuid) to service_role;
