-- First-book two-ways needs parent method review, including rows written by old code.
-- Keep the immutable package, observation, original event and correction history.
create function public.scan_two_ways_review_policy() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists (
    select 1 from public.workbook_questions q
    where q.parent_id=new.parent_id and q.workbook_id=new.workbook_id
      and q.page_id=new.page_id and q.package->>'id'=new.item_id
      and q.package->'item'->>'format'='two-ways'
      and q.package->'item'->>'scorable'='true'
      and q.package->'item'->>'parentChecked'='false'
  ) then
    new.expected:=new.expected||jsonb_build_object('method','parent','review','two-ways',
      'scoredRegions','[]'::jsonb,'mastery',jsonb_build_object('eligible',false,'reason','parent-checked'));
  end if;
  return new;
end $$;
revoke all on function public.scan_two_ways_review_policy() from public,anon,authenticated,service_role;
create trigger scan_two_ways_review_policy before insert or update on public.scan_marking_items
  for each row execute function public.scan_two_ways_review_policy();

-- The trigger applies the same policy to existing canonical records. Increment
-- their marking revision so old profile saves fail and normal recovery rebuilds.
with changed as (
  update public.scan_marking_items m set expected=m.expected
  where exists (
    select 1 from public.workbook_questions q
    where q.parent_id=m.parent_id and q.workbook_id=m.workbook_id and q.page_id=m.page_id
      and q.package->>'id'=m.item_id and q.package->'item'->>'format'='two-ways'
      and q.package->'item'->>'scorable'='true' and q.package->'item'->>'parentChecked'='false'
  ) and (m.expected->>'method' is distinct from 'parent' or m.expected->>'review' is distinct from 'two-ways'
    or m.expected->'mastery' is distinct from '{"eligible":false,"reason":"parent-checked"}'::jsonb
    or m.expected->'scoredRegions' is distinct from '[]'::jsonb)
  returning child_id,parent_id
)
insert into public.scan_marking_revisions(child_id,parent_id,revision)
  select distinct child_id,parent_id,1 from changed
  on conflict(child_id) do update set revision=scan_marking_revisions.revision+1;
