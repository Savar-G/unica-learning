-- S1: no model dispatch. Browser roles cannot access objects, including by signed URL.
create table public.scan_limits (
  singleton boolean primary key default true check (singleton),
  per_ten_minutes int not null default 20 check (per_ten_minutes > 0),
  per_day int not null default 60 check (per_day > 0),
  concurrent_uploads int not null default 2 check (concurrent_uploads > 0),
  active_jobs int not null default 1 check (active_jobs > 0),
  queued_jobs int not null default 8 check (queued_jobs >= 0),
  input_bytes bigint not null default 20971520 check (input_bytes between 1 and 20971520),
  output_bytes bigint not null default 20971520 check (output_bytes between 1 and 20971520),
  decoded_pixels bigint not null default 48000000 check (decoded_pixels between 1 and 48000000),
  family_bytes bigint not null default 2147483648 check (family_bytes > 0)
);
insert into public.scan_limits default values;
alter table public.scan_limits enable row level security;
revoke all on public.scan_limits from anon, authenticated;
grant all on public.scan_limits to service_role;

create table public.scan_photos (
  id uuid primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  child_id uuid not null,
  page_id uuid,
  workbook_id uuid,
  printed_revision text,
  state text not null default 'reserved' check (state in ('reserved','processing','pending','saved','deleted','expired','rejected')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  lease_until timestamptz not null default (now() + interval '10 minutes'),
  terminal_at timestamptz,
  reserved_bytes bigint not null check (reserved_bytes >= 0),
  stored_bytes bigint not null default 0 check (stored_bytes >= 0),
  width int, height int,
  constraint scan_child_family foreign key (child_id,parent_id) references public.children(id,parent_id) on delete cascade,
  constraint scan_page_family foreign key (page_id,workbook_id,parent_id) references public.workbook_pages(id,workbook_id,parent_id) on delete cascade,
  check (state not in ('pending','saved') or (page_id is not null and printed_revision is not null and width > 0 and height > 0))
);
create index scan_photos_family on public.scan_photos(parent_id,created_at);
create unique index scan_one_active_page on public.scan_photos(page_id) where state in ('processing','pending','saved');
alter table public.scan_photos enable row level security;
revoke all on public.scan_photos from anon, authenticated;
grant all on public.scan_photos to service_role;
grant select (id,parent_id,child_id,page_id,workbook_id,printed_revision,state,created_at,expires_at,width,height) on public.scan_photos to authenticated;
create policy scan_family_read on public.scan_photos for select to authenticated using (parent_id = (select auth.uid()));
create policy scan_admin_read on public.scan_photos for select to authenticated using ((select public.is_admin()));
create trigger fence_family_write before insert or update on public.scan_photos for each row execute function public.fence_family_write();

-- Family lock makes retries and admission across devices atomic. Caller identity comes from verified server Auth.
create function public.admit_scan_photo(p_parent uuid,p_child uuid,p_id uuid,p_bytes bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare l public.scan_limits; r public.scan_photos; n int; b bigint;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into l from public.scan_limits where singleton;
  select * into r from public.scan_photos where id=p_id;
  if found then
    if r.parent_id=p_parent and r.child_id=p_child then return r.state; end if;
    return 'refused';
  end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > l.input_bytes then return 'size'; end if;
  if not exists(select 1 from public.workbooks where parent_id=p_parent and child_id=p_child and status='shipped') then return 'page'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '10 minutes';
  if n>=l.per_ten_minutes then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and created_at>now()-interval '1 day';
  if n>=l.per_day then return 'frequency'; end if;
  select count(*) into n from public.scan_photos where parent_id=p_parent and state in ('reserved','processing') and lease_until>now();
  if n>=l.concurrent_uploads or n>=l.active_jobs+l.queued_jobs then return 'busy'; end if;
  select coalesce(sum(reserved_bytes+stored_bytes),0) into b from public.scan_photos where parent_id=p_parent;
  if b+l.output_bytes>l.family_bytes then return 'quota'; end if;
  insert into public.scan_photos(id,parent_id,child_id,reserved_bytes) values(p_id,p_parent,p_child,l.output_bytes);
  return 'reserved';
end $$;

create function public.start_scan_photo(p_parent uuid,p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; l public.scan_limits; n int;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return 'refused'; end if;
  if r.state<>'reserved' then return r.state; end if;
  if r.lease_until<=now() then return 'expired'; end if;
  select * into l from public.scan_limits where singleton;
  select count(*) into n from public.scan_photos where parent_id=p_parent and state='processing' and lease_until>now();
  if n>=l.active_jobs then return 'busy'; end if;
  update public.scan_photos set state='processing' where id=p_id;
  return 'started';
end $$;

-- Freeze the page identity before object creation. Shipped workbook content cannot be edited by the workbook API.
create function public.identify_scan_photo(p_parent uuid,p_id uuid,p_token text,p_width int,p_height int) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos; pg record;
begin
  perform public.assert_family_writable(p_parent);
  perform pg_advisory_xact_lock(hashtextextended('scan:' || p_parent::text,0));
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found or r.state<>'processing' or r.lease_until<=now() then return 'refused'; end if;
  select p.id,p.workbook_id,w.approved_at,w.printed_at into pg from public.workbook_pages p join public.workbooks w on w.id=p.workbook_id
    where p.qr_token=p_token and p.parent_id=p_parent and w.child_id=r.child_id and w.status='shipped';
  if not found then return 'page'; end if;
  if exists(select 1 from public.scan_photos where page_id=pg.id and state in ('pending','saved')) then return 'duplicate'; end if;
  begin
    update public.scan_photos set page_id=pg.id,workbook_id=pg.workbook_id,
      printed_revision=coalesce(pg.printed_at,pg.approved_at)::text,width=p_width,height=p_height where id=p_id;
  exception when unique_violation then return 'duplicate'; end;
  return 'identified';
end $$;

create function public.finish_scan_photo(p_parent uuid,p_id uuid,p_bytes bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found or r.state<>'processing' or r.lease_until<=now() or r.expires_at<=now() or r.page_id is null
    or p_bytes<1 or p_bytes>r.reserved_bytes then return 'refused'; end if;
  if not exists(select 1 from storage.objects where bucket_id='scan-photos' and name=p_parent::text||'/'||p_id::text||'/photo.jpg') then return 'refused'; end if;
  begin
    update public.scan_photos set state='pending',stored_bytes=p_bytes,reserved_bytes=0 where id=p_id;
  exception when unique_violation then return 'duplicate'; end;
  return 'pending';
end $$;

create function public.change_scan_photo(p_parent uuid,p_id uuid,p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.scan_photos;
begin
  perform public.assert_family_writable(p_parent);
  select * into r from public.scan_photos where id=p_id and parent_id=p_parent for update;
  if not found then return 'refused'; end if;
  if r.state in ('deleted','expired','rejected') then return r.state; end if;
  if p_action='save' and r.state in ('pending','saved') and r.expires_at>now() and r.created_at>now()-interval '24 hours' then
    update public.scan_photos set state='saved' where id=p_id; return 'saved';
  elsif p_action in ('delete','reject') then
    update public.scan_photos set state=case when p_action='delete' then 'deleted' else 'rejected' end,terminal_at=now() where id=p_id;
    return case when p_action='delete' then 'deleted' else 'rejected' end;
  end if;
  return 'refused';
end $$;

create function public.recover_scan_photo(p_parent uuid,p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  select (metadata->>'size')::bigint into n from storage.objects
    where bucket_id='scan-photos' and name=p_parent::text||'/'||p_id::text||'/photo.jpg';
  if n is null then return 'waiting'; end if;
  return public.finish_scan_photo(p_parent,p_id,n);
end $$;

-- Only after Storage confirms absence can reservations and stored bytes be released.
create function public.reconcile_scan_cleanup(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.scan_photos s set reserved_bytes=0,stored_bytes=0
    where id=p_id and state in ('deleted','expired','rejected') and not exists
      (select 1 from storage.objects o where o.bucket_id='scan-photos' and o.name like s.parent_id::text||'/'||s.id::text||'/%');
  return found;
end $$;

create function public.expire_scan_photos() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.scan_photos s set state='expired',terminal_at=now()
    where state not in ('deleted','expired','rejected') and
      (expires_at<=now() or (state<>'saved' and created_at<=now()-interval '24 hours') or (state in ('reserved','processing') and lease_until<=now()))
      and exists(select 1 from public.parents p where p.id=s.parent_id and p.deletion_requested_at is null);
end $$;

do $$ declare f regprocedure; begin
  for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
    ('admit_scan_photo','start_scan_photo','identify_scan_photo','finish_scan_photo','change_scan_photo','recover_scan_photo','reconcile_scan_cleanup','expire_scan_photos') loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scan-photos','scan-photos',false,20971520,array['image/jpeg']);
create policy scan_no_browser_access on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id<>'scan-photos') with check (bucket_id<>'scan-photos');

-- Row lock serializes even secret-key object writes with terminal deletion. Only the admitted exact path exists.
create function public.fence_scan_object() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.bucket_id='scan-photos' then raise exception 'scan_objects_immutable'; end if;
  if new.bucket_id='scan-photos' then
    perform public.assert_family_writable(split_part(new.name,'/',1)::uuid);
    perform 1 from public.scan_photos where parent_id=split_part(new.name,'/',1)::uuid
      and id=split_part(new.name,'/',2)::uuid and new.name=parent_id::text||'/'||id::text||'/photo.jpg'
      and state='processing' and page_id is not null and lease_until>now() and expires_at>now() for share;
    if not found then raise exception 'scan_revision_unavailable'; end if;
  end if;
  return new;
end $$;
revoke all on function public.fence_scan_object() from public,anon,authenticated;
create trigger fence_scan_object before insert or update on storage.objects for each row execute function public.fence_scan_object();

create or replace function public.fence_work_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.bucket_id in ('shown-work','workbook-pages','scan-photos') then
    perform public.assert_family_writable(split_part(old.name,'/',1)::uuid);
  end if;
  if new.bucket_id in ('shown-work','workbook-pages','scan-photos') then
    perform public.assert_family_writable(split_part(new.name,'/',1)::uuid);
  end if;
  return new;
end $$;
create or replace function public.complete_family_deletion(p uuid,token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from auth.users where id=p) or exists(select 1 from public.parents where id=p)
    or exists(select 1 from public.family_payment_operations where parent_id=p and outcome is null)
    or exists(select 1 from storage.objects where bucket_id in ('shown-work','workbook-pages','scan-photos') and split_part(name,'/',1)=p::text) then return false; end if;
  delete from public.family_deletions where parent_id=p and lease_token=token and phase='deleting';
  return found;
end $$;
-- Terminal expiry is independent from family retention. Physical removal has a separate retry schedule.
select cron.schedule('scan-photo-expiry','*/5 * * * *','select public.expire_scan_photos()');
