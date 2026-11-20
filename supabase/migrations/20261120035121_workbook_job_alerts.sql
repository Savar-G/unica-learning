-- The scheduled check claims each job and reason once before sending to Slack.
create table public.workbook_job_alerts (
  child_id uuid not null references public.children(id) on delete cascade,
  job_type text not null,
  job_id uuid not null,
  reason text not null,
  primary key (job_type, job_id, reason)
);

create index workbook_job_alerts_child_idx on public.workbook_job_alerts (child_id);
alter table public.workbook_job_alerts enable row level security;
revoke all on table public.workbook_job_alerts from public, anon, authenticated, service_role;

create trigger fence_child_delete_write before insert or update on public.workbook_job_alerts
  for each row execute function public.fence_child_delete_write();

create function public.claim_workbook_job_alerts()
returns table (reason text, job_count integer)
language sql security definer set search_path = ''
as $$
  with jobs as (
    select 'generation' as job_type, id, child_id, runner, status, created_at, heartbeat_at, finished_at
    from public.workbook_runs where stopped_by_email is null
    union all
    select 'edit', id, child_id, runner, status, created_at, heartbeat_at, finished_at
    from public.workbook_edits
    union all
    select 'first_pages', id, child_id, runner, status, created_at, heartbeat_at, finished_at
    from public.workbook_first_pages
  ), classified as (
    select j.job_type, j.id, j.child_id, case
      -- Never send old terminal results when the new check starts.
      when j.status in ('failed', 'stale')
        and j.finished_at >= greatest(timestamptz '2026-11-20 03:51:21+00', now() - interval '24 hours')
        then case when j.status = 'failed' then 'failed' else 'stalled' end
      -- Match STALE_SECONDS in workbook-job.ts.
      when j.status = 'running' and coalesce(j.heartbeat_at, j.created_at) < now() - interval '6 minutes'
        then 'stalled'
      when j.status = 'queued' and greatest(j.heartbeat_at, j.created_at) <= now() - interval '30 minutes'
        and (j.runner = 'server' or not exists (
          -- Match the 90-second online window in workbook-worker.ts.
          select 1 from public.workbook_workers w
          where w.note is distinct from 'stopped' and w.seen_at >= now() - interval '90 seconds'
        )) then 'waiting'
      end as reason
    from jobs j
  ), claimed as (
    insert into public.workbook_job_alerts as a (child_id, job_type, job_id, reason)
    select c.child_id, c.job_type, c.id, c.reason
    from classified c
    join public.children ch on ch.id = c.child_id
    join public.parents p on p.id = ch.parent_id
    where c.reason is not null and p.deletion_requested_at is null
      and not exists (select 1 from public.child_deletions d where d.child_id = c.child_id)
      and not exists (
        select 1 from public.workbook_job_alerts sent
        where (sent.job_type, sent.job_id, sent.reason) = (c.job_type, c.id, c.reason)
      )
    order by c.child_id, c.job_type, c.id, c.reason
    on conflict do nothing
    returning a.reason
  )
  select c.reason, count(*)::integer from claimed c group by c.reason;
$$;

revoke all on function public.claim_workbook_job_alerts() from public, anon, authenticated;
grant execute on function public.claim_workbook_job_alerts() to service_role;
