-- Family emails are parent-owned but their kept bodies can contain a deleted child's data.
-- Preserve the delivery ledger and unrelated sibling copies. Remove an affected body's whole audit copy.
alter table public.email_log add column copy_redacted boolean not null default false;

create function public.mark_child_email_copies() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.email_log l set copy_redacted=true
    where l.parent_id=new.parent_id and l.child_id is null and (
      coalesce(l.call_ids,'{}'::uuid[]) && array(select id from public.maya_calls where parent_id=new.parent_id and child_id=new.child_id)
      or exists(select 1 from public.email_copies e where e.email_log_id=l.id and e.parent_id=new.parent_id
        and (position(new.child_id::text in coalesce(e.text_body,'')||coalesce(e.html_body,''))>0
          or (l.kind in ('maya_daily','maya_weekly') and exists(
            select 1 from public.children k, lateral unnest(array[k.first_name] || coalesce(k.former_names,'{}'::text[])) names(name)
            where k.id=new.child_id and k.parent_id=new.parent_id and char_length(names.name)>0
              and position(lower(names.name) in lower(coalesce(e.subject,'')||coalesce(e.text_body,'')||coalesce(e.html_body,'')))>0))))
    );
  return new;
end $$;
create trigger mark_child_email_copies before insert on public.child_deletions
  for each row execute function public.mark_child_email_copies();

create function public.fence_redacted_email_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.email_log l where l.id=new.email_log_id and l.copy_redacted) then
    raise exception 'child_unavailable' using errcode='55000';
  end if;
  return new;
end $$;
create trigger fence_redacted_email_copy before insert or update on public.email_copies
  for each row execute function public.fence_redacted_email_copy();

create or replace function public.complete_child_deletion(p uuid,c uuid,token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_child_deletion_lease(p,c,token);
  if not public.confirm_child_copies(p,c,token) then return false; end if;
  if exists(select 1 from public.child_delete_roots(p,c) root join storage.objects o on o.bucket_id=root.bucket
    and starts_with(lower(o.name),root.prefix || '/')) then return false; end if;
  delete from public.email_copies e using public.email_log l
    where e.parent_id=p and e.email_log_id=l.id and l.parent_id=p and l.copy_redacted;
  delete from public.children where parent_id=p and id=c;
  return found;
end $$;
revoke all on function public.mark_child_email_copies(), public.fence_redacted_email_copy() from public,anon,authenticated,service_role;
