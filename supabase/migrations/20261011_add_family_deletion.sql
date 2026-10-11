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
alter table public.family_deletions enable row level security;
alter table public.family_card_operations enable row level security;
revoke all on public.family_deletions, public.family_card_operations from anon, authenticated;
grant all on public.family_deletions, public.family_card_operations to service_role;

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
    and (select max(greatest(started_at, completed_at, last_answer_at)) + interval '12 months'
      <= now() from public.assessments where parent_id = p);
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

-- Payment reconciliation can cancel only a retention check, never a committed deletion or explicit request.
create function public.decide_family_deletion(p uuid, token uuid, keep_family boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare q public.family_deletions;
begin
  perform 1 from public.parents where id = p for update;
  select * into q from public.family_deletions where parent_id = p for update;
  if not found or q.lease_token is distinct from token or q.lease_until <= now() then return false; end if;
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
