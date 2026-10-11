-- #78. Required before enabling deletion. Additive; no existing row is deleted by this migration.
-- Storage and Auth are separate services. Freeze a family, remove Storage first, then delete Auth.
-- The request survives the Auth cascade, so an interrupted final cleanup can resume.
alter table public.parents add column deletion_requested_at timestamptz;

create table public.family_deletions (
  parent_id uuid primary key,
  reason text not null check (reason in ('request', 'retention')),
  phase text not null default 'checking' check (phase in ('checking', 'deleting')),
  requested_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz
);
create table public.family_card_operations (
  id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  started_at timestamptz not null default now()
);
create index family_card_operations_parent_idx on public.family_card_operations(parent_id);
-- Remote mutations have no automatic lost-result retry. Records survive timeout and lease takeover.
create table public.family_payment_operations (
  parent_id uuid not null references public.family_deletions(parent_id) on delete cascade,
  kind text not null check (kind in ('session','intent')),
  object_id text not null check (length(object_id) between 1 and 255),
  customer_id text not null check (length(customer_id) between 1 and 255),
  origin_token uuid not null,
  outcome text check ((kind = 'session' and outcome in ('expired','complete')) or (kind = 'intent' and outcome in ('canceled','succeeded'))),
  started_at timestamptz not null default now(),
  primary key(parent_id,kind,object_id)
);
-- Only traversal through immutable canceled intents is retained, never a customer/card clear result.
create table public.family_payment_progress (
  parent_id uuid not null references public.family_deletions(parent_id) on delete cascade,
  customer_id text not null,
  head_id text,
  after_id text,
  done boolean not null default false,
  primary key(parent_id,customer_id)
);
-- A saved position prevents a repeatedly slow first family from blocking the rest of the daily queue.
create table public.family_deletion_schedule (
  singleton boolean primary key default true check (singleton),
  last_parent uuid
);
insert into public.family_deletion_schedule(singleton) values(true);
alter table public.family_deletions enable row level security;
alter table public.family_card_operations enable row level security;
alter table public.family_deletion_schedule enable row level security;
alter table public.family_payment_operations enable row level security;
alter table public.family_payment_progress enable row level security;
revoke all on public.family_deletions, public.family_card_operations, public.family_deletion_schedule from anon, authenticated;
grant all on public.family_deletions, public.family_card_operations, public.family_deletion_schedule to service_role;
revoke all on public.family_payment_operations, public.family_payment_progress from anon, authenticated;
grant all on public.family_payment_operations, public.family_payment_progress to service_role;

create function public.family_deletion_cursor() returns uuid
language sql security definer set search_path = '' as $$
  select last_parent from public.family_deletion_schedule where singleton;
$$;
create function public.advance_family_deletion_cursor(p uuid) returns void
language sql security definer set search_path = '' as $$
  update public.family_deletion_schedule set last_parent = p where singleton;
$$;
revoke all on function public.family_deletion_cursor(), public.advance_family_deletion_cursor(uuid) from public, anon, authenticated;
grant execute on function public.family_deletion_cursor(), public.advance_family_deletion_cursor(uuid) to service_role;

-- All family writes share this row lock. The deletion claim takes the exclusive lock, then commits a
-- permanent fence. A write that won first completes before eligibility is rechecked; one that loses fails.
create function public.assert_family_writable(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare deleting timestamptz;
begin
  select deletion_requested_at into deleting from public.parents where id = p for share;
  if not found or deleting is not null then raise exception 'family_unavailable' using errcode = '55000'; end if;
end $$;
revoke all on function public.assert_family_writable(uuid) from public, anon, authenticated;

create function public.fence_family_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p uuid; a uuid; assessment_parent uuid;
begin
  if tg_op = 'UPDATE' and to_jsonb(old)->>'parent_id' is not null then
    perform public.assert_family_writable((to_jsonb(old)->>'parent_id')::uuid);
  end if;
  p := (to_jsonb(new)->>'parent_id')::uuid;
  a := (to_jsonb(new)->>'assessment_id')::uuid;
  if p is not null then perform public.assert_family_writable(p); end if;
  if a is not null then
    select parent_id into assessment_parent from public.assessments where id = a;
    if p is not null and p is distinct from assessment_parent then raise exception 'family_scope' using errcode = '55000'; end if;
    perform public.assert_family_writable(assessment_parent);
  end if;
  return new;
end $$;
revoke all on function public.fence_family_write() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['children','assessments','answers','assessment_facts','fact_answers',
    'work_reviews','reports','email_log','sign_in_links','card_setups','waitlist_joins','family_card_operations'] loop
    execute format('create trigger fence_family_write before insert or update on public.%I for each row execute function public.fence_family_write()', t);
  end loop;
end $$;

-- Service-role Storage writes also pass this trigger. RLS alone cannot fence a service-role upload.
create function public.fence_work_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.bucket_id = 'shown-work' then
    perform public.assert_family_writable(split_part(old.name, '/', 1)::uuid);
  end if;
  if new.bucket_id = 'shown-work' then
    perform public.assert_family_writable(split_part(new.name, '/', 1)::uuid);
  end if;
  return new;
end $$;
revoke all on function public.fence_work_upload() from public, anon, authenticated;
create trigger fence_work_upload before insert or update on storage.objects
  for each row execute function public.fence_work_upload();

-- A crash during a Stripe operation leaves a hold. Never expire it by time: an external request may still
-- complete. The runbook requires reconciliation before an operator removes an abandoned hold.
create function public.begin_family_card_operation(p uuid, token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_family_writable(p);
  insert into public.family_card_operations(id, parent_id) values(token, p);
end $$;
create function public.end_family_card_operation(token uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.family_card_operations where id = token;
$$;

create function public.family_retention_due(p uuid) returns boolean
language sql security definer set search_path = '' set timezone = 'UTC' as $$
  select not exists(select 1 from public.admin_users where user_id = p)
    and not exists(select 1 from public.card_setups where parent_id = p and card_saved_at is not null)
    and not exists(select 1 from public.family_card_operations where parent_id = p)
    and (select max(activity.at) + interval '12 months' <= now() from (
      select greatest(started_at, completed_at, last_answer_at) as at from public.assessments where parent_id = p
      union all select answer.created_at from public.answers answer
        join public.assessments a on a.id = answer.assessment_id where a.parent_id = p
      union all select f.started_at from public.assessment_facts f
        join public.assessments a on a.id = f.assessment_id where a.parent_id = p
      union all select f.created_at from public.fact_answers f
        join public.assessments a on a.id = f.assessment_id where a.parent_id = p
    ) activity);
$$;

-- Session RPC for an explicit request. Membership is checked with this token at the instant of the write.
-- Lock membership too: a concurrent revocation must finish before, or wait until after, this request.
create function public.request_family_deletion(p uuid, confirmation text) returns text
language plpgsql security definer set search_path = '' as $$
declare mail text;
begin
  perform 1 from public.admin_users where user_id = auth.uid() for share;
  if not found then raise exception 'not_authorized' using errcode = '42501'; end if;
  if exists(select 1 from public.admin_users where user_id = p) then return 'protected'; end if;
  select email into mail from public.parents where id = p for update;
  if not found then return 'missing'; end if;
  if confirmation is distinct from mail then return 'confirmation'; end if;
  if exists(select 1 from public.family_card_operations where parent_id = p) then return 'busy'; end if;
  update public.parents set deletion_requested_at = coalesce(deletion_requested_at, now()) where id = p;
  insert into public.family_deletions(parent_id, reason) values(p, 'request')
    on conflict(parent_id) do update set reason = 'request';
  return 'requested';
end $$;
revoke all on function public.request_family_deletion(uuid,text) from public, anon;
grant execute on function public.request_family_deletion(uuid,text) to authenticated;

-- Keyset paging covers the full eligible set without a response-cap dependency. Pending work is included even
-- when Auth has already disappeared. No caller-provided clock can force early deletion.
create function public.family_deletion_candidates(after_id uuid, page_size integer default 100)
returns table(parent_id uuid) language sql security definer set search_path = '' as $$
  select id from (
    select p.id from public.parents p where public.family_retention_due(p.id)
    union select d.parent_id from public.family_deletions d
  ) eligible where after_id is null or id > after_id order by id limit least(greatest(page_size,1),100);
$$;

create function public.claim_family_deletion(p uuid, token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions; exists_parent boolean;
begin
  perform 1 from public.parents where id = p for update;
  exists_parent := found;
  select * into q from public.family_deletions where parent_id = p for update;
  if not found then
    if not exists_parent or not coalesce(public.family_retention_due(p),false) then return jsonb_build_object('state','excluded'); end if;
    update public.parents set deletion_requested_at = now() where id = p;
    insert into public.family_deletions(parent_id,reason) values(p,'retention') returning * into q;
  end if;
  if q.lease_until > now() and q.lease_token is distinct from token then return jsonb_build_object('state','busy'); end if;
  update public.family_deletions set lease_token = token, lease_until = now() + interval '5 minutes' where parent_id = p;
  return jsonb_build_object('state','ready','reason',q.reason,'phase',q.phase);
end $$;

create function public.check_family_payment_lease(p uuid, token uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions;
begin
  select * into q from public.family_deletions where parent_id = p for update;
  if not found or q.phase <> 'checking' or q.lease_token is distinct from token or q.lease_until <= now()
    or exists(select 1 from public.family_card_operations where parent_id = p) then
    raise exception 'payment_lease_unavailable' using errcode = '55000';
  end if;
end $$;
revoke all on function public.check_family_payment_lease(uuid,uuid) from public, anon, authenticated;

create function public.pending_family_payment_operations(p uuid, token uuid, after_id text, page_size integer default 100)
returns table(kind text, object_id text, customer_id text) language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  return query select o.kind,o.object_id,o.customer_id from public.family_payment_operations o
    where o.parent_id = p and o.outcome is null and (after_id is null or o.kind || ':' || o.object_id > after_id)
    order by o.kind || ':' || o.object_id limit least(greatest(page_size,1),100);
end $$;
create function public.begin_family_payment_operation(p uuid, token uuid, resource_kind text, resource_id text, customer text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  if exists(select 1 from public.family_payment_operations where parent_id = p and kind = resource_kind and object_id = resource_id) then return false; end if;
  insert into public.family_payment_operations(parent_id,kind,object_id,customer_id,origin_token) values(p,resource_kind,resource_id,customer,token);
  return true;
end $$;
-- Only the current owning worker can attest that it never invoked the remote mutation.
-- A lost remote response is not a not-started outcome. A reclaimed lease cannot erase another origin.
create function public.abandon_family_payment_operation(p uuid, token uuid, resource_kind text, resource_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  delete from public.family_payment_operations where parent_id = p and kind = resource_kind and object_id = resource_id
    and origin_token = token and outcome is null;
  return found;
end $$;
create function public.finish_family_payment_operation(p uuid, token uuid, resource_kind text, resource_id text, resource_state text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  if resource_state is null or (resource_kind = 'session' and resource_state not in ('expired','complete'))
    or (resource_kind = 'intent' and resource_state not in ('canceled','succeeded')) then
    raise exception 'payment_state_unresolved' using errcode = '55000';
  end if;
  if exists(select 1 from public.family_payment_operations where parent_id = p and kind = resource_kind and object_id = resource_id
    and outcome is not null and outcome <> resource_state) then raise exception 'payment_terminal_state_changed' using errcode = '55000'; end if;
  update public.family_payment_operations set outcome = resource_state where parent_id = p and kind = resource_kind and object_id = resource_id;
end $$;
create function public.read_family_payment_progress(p uuid, token uuid, customer text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  return (select jsonb_build_object('head',head_id,'after',after_id,'done',done)
    from public.family_payment_progress where parent_id = p and customer_id = customer);
end $$;
create function public.save_family_payment_progress(p uuid, token uuid, customer text, head_id text, after_id text, finished boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_family_payment_lease(p,token);
  if exists(select 1 from public.family_payment_operations where parent_id = p and customer_id = customer and outcome is null) then
    raise exception 'payment_operation_unresolved' using errcode = '55000';
  end if;
  insert into public.family_payment_progress(parent_id,customer_id,head_id,after_id,done) values(p,customer,head_id,after_id,finished)
    on conflict(parent_id,customer_id) do update set head_id = excluded.head_id, after_id = excluded.after_id, done = excluded.done;
end $$;
revoke all on function public.pending_family_payment_operations(uuid,uuid,text,integer),
  public.begin_family_payment_operation(uuid,uuid,text,text,text), public.finish_family_payment_operation(uuid,uuid,text,text,text),
  public.abandon_family_payment_operation(uuid,uuid,text,text),
  public.read_family_payment_progress(uuid,uuid,text), public.save_family_payment_progress(uuid,uuid,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.pending_family_payment_operations(uuid,uuid,text,integer),
  public.begin_family_payment_operation(uuid,uuid,text,text,text), public.finish_family_payment_operation(uuid,uuid,text,text,text),
  public.abandon_family_payment_operation(uuid,uuid,text,text),
  public.read_family_payment_progress(uuid,uuid,text), public.save_family_payment_progress(uuid,uuid,text,text,text,boolean) to service_role;

-- Payment reconciliation can cancel only a retention check, never a committed deletion or explicit request.
create function public.decide_family_deletion(p uuid, token uuid, keep_family boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions;
begin
  perform 1 from public.parents where id = p for update;
  select * into q from public.family_deletions where parent_id = p for update;
  if not found or q.lease_token is distinct from token or q.lease_until <= now() then return false; end if;
  if exists(select 1 from public.family_payment_operations where parent_id = p and outcome is null)
    or exists(select 1 from public.family_card_operations where parent_id = p) then return false; end if;
  if keep_family then
    if q.reason <> 'retention' or q.phase <> 'checking' then return false; end if;
    delete from public.family_deletions where parent_id = p;
    update public.parents set deletion_requested_at = null where id = p;
  else
    update public.family_deletions set phase = 'deleting' where parent_id = p;
  end if;
  return true;
end $$;

create function public.renew_family_deletion(p uuid, token uuid) returns boolean
language sql security definer set search_path = '' as $$
  with renewed as (
    update public.family_deletions set lease_until = now() + interval '5 minutes'
    where parent_id = p and lease_token = token and lease_until > now() and phase = 'deleting' returning 1
  ) select exists(select 1 from renewed);
$$;
create function public.release_family_deletion(p uuid, token uuid) returns void
language sql security definer set search_path = '' as $$
  update public.family_deletions set lease_until = null, lease_token = null where parent_id = p and lease_token = token;
$$;
create function public.complete_family_deletion(p uuid, token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from auth.users where id = p) or exists(select 1 from public.parents where id = p)
    or exists(select 1 from public.family_payment_operations where parent_id = p and outcome is null)
    or exists(select 1 from storage.objects where bucket_id = 'shown-work' and split_part(name,'/',1) = p::text) then return false; end if;
  delete from public.family_deletions where parent_id = p and lease_token = token and phase = 'deleting';
  return found;
end $$;

revoke all on function public.begin_family_card_operation(uuid,uuid), public.end_family_card_operation(uuid),
  public.family_retention_due(uuid), public.family_deletion_candidates(uuid,integer),
  public.claim_family_deletion(uuid,uuid), public.decide_family_deletion(uuid,uuid,boolean),
  public.renew_family_deletion(uuid,uuid), public.release_family_deletion(uuid,uuid),
  public.complete_family_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.begin_family_card_operation(uuid,uuid), public.end_family_card_operation(uuid),
  public.family_retention_due(uuid), public.family_deletion_candidates(uuid,integer),
  public.claim_family_deletion(uuid,uuid), public.decide_family_deletion(uuid,uuid,boolean),
  public.renew_family_deletion(uuid,uuid), public.release_family_deletion(uuid,uuid),
  public.complete_family_deletion(uuid,uuid) to service_role;
