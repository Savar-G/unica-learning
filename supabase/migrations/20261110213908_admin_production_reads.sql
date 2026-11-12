-- Production page reads (D-315), additive. Review of #835 and #837: the page and the sidebar badge read each source
-- (runs, stored workbooks, saved cards, started plans) as its own list cut at 500 rows, so a child's rows could be cut
-- apart (a saved card read, its stored book not) and the child got a wrong stage. The page also read each current
-- run's details with one to five requests per run.
--
-- admin_production_runs and admin_production_books return only the rows the stage rules (src/lib/admin-production.ts)
-- read, for every child: the stored workbooks and runs from the child's "floor" up, where the floor is the child's
-- highest stored book number, or the lowest active run's number when that is lower, or 0 when the child has no stored
-- book. So the read is complete per child and grows with the number of children, not with their history. The site
-- filters (test families), orders and pages the result like a table.
--
-- admin_latest_draft_revisions and admin_run_activity read the details of many current runs in one request each: the
-- latest revision's check counts and render problems per draft (never the whole content), and the saved-work times per
-- running run.
--
-- All four run with the caller's rights (row level security applies) and return nothing to a caller who is not an admin.

create or replace function public.admin_production_runs() returns setof public.workbook_runs
  language sql stable security invoker set search_path = ''
as $$
  with top as (select w.child_id, max(w.number) as n from public.workbooks w group by w.child_id),
  live as (select r.child_id, min(r.number) as n from public.workbook_runs r where r.status in ('queued', 'running') group by r.child_id)
  select r.* from public.workbook_runs r
  left join top t on t.child_id = r.child_id
  left join live l on l.child_id = r.child_id
  where (select public.is_admin())
    and r.number >= least(coalesce(t.n, 0), coalesce(l.n, t.n, 0))
$$;

create or replace function public.admin_production_books() returns setof public.workbooks
  language sql stable security invoker set search_path = ''
as $$
  with top as (select w.child_id, max(w.number) as n from public.workbooks w group by w.child_id),
  live as (select r.child_id, min(r.number) as n from public.workbook_runs r where r.status in ('queued', 'running') group by r.child_id)
  select w.* from public.workbooks w
  join top t on t.child_id = w.child_id
  left join live l on l.child_id = w.child_id
  where (select public.is_admin())
    and w.number >= least(t.n, coalesce(l.n, t.n))
$$;

create or replace function public.admin_latest_draft_revisions(p_drafts uuid[])
returns table (draft_id uuid, revision integer, counts jsonb, render_problems jsonb)
  language sql stable security invoker set search_path = ''
as $$
  select d.id, x.revision, x.counts, x.render_problems
  from (select distinct unnest(p_drafts) as id) d
  cross join lateral (
    select v.revision, v.content -> 'counts' as counts, v.render_problems
    from public.workbook_draft_revisions v
    where v.draft_id = d.id
    order by v.revision desc
    limit 1
  ) x
  where (select public.is_admin())
$$;

create or replace function public.admin_run_activity(p_runs uuid[])
returns table (run_id uuid, page_times timestamptz[], last_call_at timestamptz, last_solve_at timestamptz, plan_at timestamptz,
  resumed_at timestamptz)
  language sql stable security invoker set search_path = ''
as $$
  select r.id,
    coalesce((select (array_agg(p.created_at order by p.created_at))[1:1000] from public.workbook_run_pages p where p.run_id = r.id), '{}'),
    (select max(c.created_at) from public.workbook_run_calls c where c.run_id = r.id),
    (select max(s.created_at) from public.workbook_run_solves s where s.run_id = r.id),
    (select min(f.created_at) from public.workbook_run_frames f where f.run_id = r.id),
    (select max(a.at) from public.workbook_audit a where a.run_id = r.id and a.action = 'run-resumed')
  from (select distinct unnest(p_runs) as id) r
  where (select public.is_admin())
$$;

revoke execute on function public.admin_production_runs(), public.admin_production_books(),
  public.admin_latest_draft_revisions(uuid[]), public.admin_run_activity(uuid[]) from public, anon;
grant execute on function public.admin_production_runs(), public.admin_production_books(),
  public.admin_latest_draft_revisions(uuid[]), public.admin_run_activity(uuid[]) to authenticated;
