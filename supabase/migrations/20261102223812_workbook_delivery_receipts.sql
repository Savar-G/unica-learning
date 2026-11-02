-- #474 / S11a. Delivery is separate from shipment and billing. No historical backfill.
alter table public.workbooks add constraint workbooks_delivery_identity_key unique (id, parent_id, child_id, number);
create table public.workbook_delivery_receipts (
  workbook_id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  number integer not null,
  delivered_at timestamptz not null,
  local_time text not null check (local_time ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  time_zone text not null,
  zone_override boolean not null,
  recorded_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  audit_id bigint not null unique references public.workbook_audit(id) on delete cascade,
  foreign key (workbook_id, parent_id, child_id, number) references public.workbooks(id, parent_id, child_id, number) on delete cascade,
  foreign key (child_id, parent_id) references public.children(id, parent_id) on delete cascade,
  check (delivered_at <= recorded_at)
);
create index workbook_delivery_parent_idx on public.workbook_delivery_receipts(parent_id);
create index workbook_delivery_child_idx on public.workbook_delivery_receipts(child_id, number);
alter table public.workbook_delivery_receipts enable row level security;
revoke all on public.workbook_delivery_receipts from anon, authenticated;
grant select on public.workbook_delivery_receipts to authenticated;
grant all on public.workbook_delivery_receipts to service_role;
create policy delivery_read on public.workbook_delivery_receipts for select to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_delivery_receipts
  for each row execute function public.fence_family_write();
create function public.immutable_workbook_delivery() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Delivery receipts cannot change' using errcode = '55000'; end $$;
revoke all on function public.immutable_workbook_delivery() from public, anon, authenticated, service_role;
create trigger immutable_delivery before update on public.workbook_delivery_receipts
  for each row execute function public.immutable_workbook_delivery();

-- Use the live admin session. Neither actor identity nor audit time comes from the browser.
create function public.confirm_workbook_delivery(p_workbook uuid, p_child uuid, p_number integer,
  p_delivered timestamptz, p_local text, p_zone text, p_override boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare w public.workbooks; r public.workbook_delivery_receipts; v_audit bigint;
  v_actor uuid := auth.uid(); v_email text; v_zone text; v_at timestamptz := clock_timestamp();
begin
  if v_actor is null or not public.is_admin() then return jsonb_build_object('status','refused','reason','admin_required'); end if;
  select email into v_email from public.admin_users where user_id = v_actor;
  select * into w from public.workbooks where id = p_workbook;
  if not found then return jsonb_build_object('status','refused','reason','not_found'); end if;
  -- Same order as shipment: family fence, child, workbook. The fence also covers retries.
  perform public.assert_family_writable(w.parent_id);
  perform 1 from public.children where id = w.child_id for no key update;
  select * into w from public.workbooks where id = p_workbook for update;
  if w.id is null then return jsonb_build_object('status','refused','reason','not_found'); end if;
  if p_child is distinct from w.child_id or p_number is distinct from w.number then
    return jsonb_build_object('status','refused','reason','identity_mismatch'); end if;
  if w.status <> 'shipped' then return jsonb_build_object('status','refused','reason','not_shipped'); end if;
  v_zone := public._maya_normalize_zone(p_zone);
  if v_zone is null or p_override is null or p_local is null or p_delivered is null
    or not isfinite(p_delivered) or p_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    return jsonb_build_object('status','refused','reason','invalid_time'); end if;
  -- Check the exact local input against the shared dated zone rules, including old hosted tzdata.
  if to_char(p_delivered at time zone (case when p_override then public._maya_zone_at(v_zone,p_delivered) else v_zone end), 'YYYY-MM-DD"T"HH24:MI') <> p_local
    or date_trunc('minute',p_delivered) <> p_delivered then
    return jsonb_build_object('status','refused','reason','invalid_time'); end if;
  if p_delivered > v_at or p_delivered < w.shipped_at then
    return jsonb_build_object('status','refused','reason','invalid_delivery_time'); end if;
  select * into r from public.workbook_delivery_receipts where workbook_id = p_workbook;
  if found then
    if r.delivered_at is distinct from p_delivered or r.time_zone <> v_zone or r.zone_override <> p_override or r.local_time <> p_local then
      return jsonb_build_object('status','refused','reason','delivery_conflict'); end if;
    return jsonb_build_object('status','confirmed','receipt',to_jsonb(r));
  end if;
  insert into public.workbook_audit(parent_id,child_id,workbook_id,actor_id,actor_email,action,detail)
    values(w.parent_id,w.child_id,w.id,v_actor,v_email,'workbook-delivered',jsonb_build_object('number',w.number,'deliveredAt',p_delivered,'timeZone',v_zone))
    returning id into v_audit;
  insert into public.workbook_delivery_receipts(workbook_id,parent_id,child_id,number,delivered_at,local_time,time_zone,zone_override,recorded_at,actor_id,audit_id)
    values(w.id,w.parent_id,w.child_id,w.number,p_delivered,p_local,v_zone,p_override,v_at,v_actor,v_audit) returning * into r;
  return jsonb_build_object('status','confirmed','receipt',to_jsonb(r));
exception when sqlstate '55000' then return jsonb_build_object('status','refused','reason','family_frozen');
end $$;
revoke all on function public.confirm_workbook_delivery(uuid,uuid,integer,timestamptz,text,text,boolean) from public, anon, service_role;
grant execute on function public.confirm_workbook_delivery(uuid,uuid,integer,timestamptz,text,text,boolean) to authenticated;
