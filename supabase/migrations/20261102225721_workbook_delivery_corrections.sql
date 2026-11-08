-- #474 follow-up: retain the original receipt; append every explicit correction.
create table public.workbook_delivery_corrections (
  id uuid primary key,
  workbook_id uuid not null references public.workbook_delivery_receipts(workbook_id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  number integer not null,
  delivered_at timestamptz not null,
  previous_delivered_at timestamptz not null,
  local_time text not null check (local_time ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'),
  reason text not null check (char_length(reason) between 1 and 300 and reason ~ '[^[:space:]]'),
  recorded_at timestamptz not null default clock_timestamp(),
  actor_id uuid not null,
  audit_id bigint not null unique references public.workbook_audit(id) on delete cascade,
  previous_audit_id bigint not null references public.workbook_audit(id) on delete cascade,
  foreign key (workbook_id,parent_id,child_id,number) references public.workbooks(id,parent_id,child_id,number) on delete cascade,
  foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  check (delivered_at <= recorded_at)
);
create index workbook_delivery_corrections_book_idx on public.workbook_delivery_corrections(workbook_id,audit_id desc);
create index workbook_delivery_corrections_parent_idx on public.workbook_delivery_corrections(parent_id);
alter table public.workbook_delivery_corrections enable row level security;
revoke all on public.workbook_delivery_corrections from anon,authenticated;
grant select on public.workbook_delivery_corrections to authenticated;
grant select,insert,delete on public.workbook_delivery_corrections to service_role;
create policy delivery_corrections_read on public.workbook_delivery_corrections for select to authenticated
  using (parent_id=(select auth.uid()) or (select public.is_admin()));
create trigger fence_family_write before insert or update on public.workbook_delivery_corrections
  for each row execute function public.fence_family_write();
create trigger immutable_delivery_correction before update on public.workbook_delivery_corrections
  for each row execute function public.immutable_workbook_delivery();

create function public.correct_workbook_delivery(p_workbook uuid,p_child uuid,p_number integer,
  p_delivered timestamptz,p_local text,p_zone text,p_override boolean,p_reason text,p_request uuid,p_expected_audit bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.workbooks; r public.workbook_delivery_receipts; c public.workbook_delivery_corrections;
  v_previous timestamptz; v_previous_audit bigint; v_audit bigint; v_actor uuid:=auth.uid(); v_email text; v_at timestamptz;
begin
  if v_actor is null or not public.is_admin() then return jsonb_build_object('status','refused','reason','admin_required'); end if;
  select email into v_email from public.admin_users where user_id=v_actor;
  select * into w from public.workbooks where id=p_workbook;
  if not found then return jsonb_build_object('status','refused','reason','not_found'); end if;
  perform public.assert_family_writable(w.parent_id);
  perform 1 from public.children where id=w.child_id for no key update;
  select * into w from public.workbooks where id=p_workbook for update;
  if w.id is null then return jsonb_build_object('status','refused','reason','not_found'); end if;
  if p_child is distinct from w.child_id or p_number is distinct from w.number then
    return jsonb_build_object('status','refused','reason','identity_mismatch'); end if;
  if w.status<>'shipped' then return jsonb_build_object('status','refused','reason','not_shipped'); end if;
  select * into r from public.workbook_delivery_receipts where workbook_id=w.id;
  if not found then return jsonb_build_object('status','refused','reason','receipt_required'); end if;
  if p_request is null or p_expected_audit is null then return jsonb_build_object('status','refused','reason','invalid_correction'); end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 300 or p_reason !~ '[^[:space:]]' then
    return jsonb_build_object('status','refused','reason','correction_reason_required'); end if;
  if public._maya_normalize_zone(p_zone) is distinct from r.time_zone or p_override is distinct from r.zone_override then
    return jsonb_build_object('status','refused','reason','zone_changed'); end if;
  if p_local is null or p_delivered is null or not isfinite(p_delivered) or p_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
    return jsonb_build_object('status','refused','reason','invalid_time'); end if;
  if to_char(p_delivered at time zone (case when r.zone_override then public._maya_zone_at(r.time_zone,p_delivered) else r.time_zone end),'YYYY-MM-DD"T"HH24:MI')<>p_local
    or date_trunc('minute',p_delivered)<>p_delivered then
    return jsonb_build_object('status','refused','reason','invalid_time'); end if;
  v_at:=clock_timestamp();
  if p_delivered>v_at or p_delivered<w.shipped_at then return jsonb_build_object('status','refused','reason','invalid_delivery_time'); end if;
  -- A retry returns its existing append-only correction, even after a later correction.
  select * into c from public.workbook_delivery_corrections where id=p_request;
  if found then
    if c.workbook_id<>w.id or c.delivered_at<>p_delivered or c.local_time<>p_local or c.reason<>btrim(p_reason) or c.previous_audit_id<>p_expected_audit then
      return jsonb_build_object('status','refused','reason','correction_conflict'); end if;
    return jsonb_build_object('status','corrected');
  end if;
  select delivered_at,audit_id into v_previous,v_previous_audit from public.workbook_delivery_corrections where workbook_id=w.id order by audit_id desc limit 1;
  if not found then v_previous:=r.delivered_at; v_previous_audit:=r.audit_id; end if;
  if p_expected_audit<>v_previous_audit then return jsonb_build_object('status','refused','reason','stale_delivery'); end if;
  if p_delivered=v_previous then return jsonb_build_object('status','refused','reason','time_unchanged'); end if;
  insert into public.workbook_audit(parent_id,child_id,workbook_id,actor_id,actor_email,action,detail)
    values(w.parent_id,w.child_id,w.id,v_actor,v_email,'workbook-delivery-corrected',jsonb_build_object('number',w.number,
      'originalDeliveredAt',r.delivered_at,'previousDeliveredAt',v_previous,'deliveredAt',p_delivered,
      'timeZone',r.time_zone,'zoneOverride',r.zone_override,'reason',btrim(p_reason))) returning id into v_audit;
  insert into public.workbook_delivery_corrections(id,workbook_id,parent_id,child_id,number,delivered_at,previous_delivered_at,local_time,reason,recorded_at,actor_id,audit_id,previous_audit_id)
    values(p_request,w.id,w.parent_id,w.child_id,w.number,p_delivered,v_previous,p_local,btrim(p_reason),v_at,v_actor,v_audit,v_previous_audit);
  return jsonb_build_object('status','corrected');
exception when sqlstate '55000' then return jsonb_build_object('status','refused','reason','family_frozen');
end $$;
revoke all on function public.correct_workbook_delivery(uuid,uuid,integer,timestamptz,text,text,boolean,text,uuid,bigint) from public,anon,service_role;
grant execute on function public.correct_workbook_delivery(uuid,uuid,integer,timestamptz,text,text,boolean,text,uuid,bigint) to authenticated;
