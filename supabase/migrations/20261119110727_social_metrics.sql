-- #913. Aggregate provider insights only. Provider imports never overwrite an admin's tracking tags.
create table public.social_accounts (
  platform text primary key,
  account_id text not null,
  name text not null,
  read_at timestamptz not null
);

create table public.social_posts (
  platform text not null references public.social_accounts(platform),
  post_id text not null,
  permalink text not null,
  published_at timestamptz not null,
  format text not null,
  caption text not null,
  utm_content text,
  utm_campaign text,
  primary key (platform, post_id)
);
-- Untagged posts are common. Only tracking pairs need to be unique.
create unique index social_posts_tag_key on public.social_posts (utm_content, (coalesce(utm_campaign, '')))
  where utm_content is not null;
create index social_posts_published_idx on public.social_posts (published_at desc);

create table public.social_post_snapshots (
  platform text not null,
  post_id text not null,
  read_at timestamptz not null,
  views bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  saves bigint,
  shares bigint,
  follows bigint,
  watch_seconds double precision,
  watch_percent double precision,
  raw jsonb not null,
  primary key (platform, post_id, read_at),
  foreign key (platform, post_id) references public.social_posts(platform, post_id)
);

create table public.social_daily_snapshots (
  platform text not null references public.social_accounts(platform),
  day date not null,
  read_at timestamptz not null,
  followers bigint,
  followers_gained bigint,
  views bigint,
  reach bigint,
  interactions bigint,
  profile_visits bigint,
  link_clicks bigint,
  raw jsonb not null,
  primary key (platform, day, read_at)
);

create table public.social_audience_snapshots (
  platform text not null references public.social_accounts(platform),
  read_at timestamptz not null,
  dimension text not null,
  label text not null,
  value double precision not null,
  unit text not null,
  primary key (platform, read_at, dimension, label)
);

create table public.social_refreshes (
  started_at timestamptz primary key
);

create table public.social_refresh_results (
  started_at timestamptz not null references public.social_refreshes(started_at),
  platform text not null,
  status text not null,
  message text,
  primary key (started_at, platform)
);

do $$
declare t text;
begin
  foreach t in array array['social_accounts', 'social_posts', 'social_post_snapshots', 'social_daily_snapshots',
                           'social_audience_snapshots', 'social_refreshes', 'social_refresh_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
    execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- The cron and button share one cooldown. The transaction lock makes admission atomic across instances.
create function public.claim_social_refresh(p_started_at timestamptz)
returns boolean language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social_refresh', 0));
  if exists (select 1 from public.social_refreshes where started_at > p_started_at - interval '10 minutes') then
    return false;
  end if;
  insert into public.social_refreshes values (p_started_at);
  return true;
end $$;

create function public.save_social_pull(
  p_platform text, p_account_id text, p_name text, p_read_at timestamptz,
  p_posts jsonb, p_post_reads jsonb, p_days jsonb, p_audience jsonb
) returns void language plpgsql set search_path = '' as $$
begin
  insert into public.social_accounts values (p_platform, p_account_id, p_name, p_read_at)
  on conflict (platform) do update set account_id = excluded.account_id, name = excluded.name, read_at = excluded.read_at;

  insert into public.social_posts (platform, post_id, permalink, published_at, format, caption)
  select p_platform, post_id, permalink, published_at, format, caption
  from jsonb_populate_recordset(null::public.social_posts, p_posts)
  on conflict (platform, post_id) do update set permalink = excluded.permalink,
    published_at = excluded.published_at, format = excluded.format, caption = excluded.caption;

  insert into public.social_post_snapshots
  select p_platform, post_id, p_read_at, views, reach, likes, comments, saves, shares, follows, watch_seconds, watch_percent, raw
  from jsonb_populate_recordset(null::public.social_post_snapshots, p_post_reads)
  on conflict do nothing;

  insert into public.social_daily_snapshots
  select p_platform, day, p_read_at, followers, followers_gained, views, reach, interactions, profile_visits, link_clicks, raw
  from jsonb_populate_recordset(null::public.social_daily_snapshots, p_days)
  on conflict do nothing;

  insert into public.social_audience_snapshots
  select p_platform, p_read_at, dimension, label, value, unit
  from jsonb_populate_recordset(null::public.social_audience_snapshots, p_audience)
  on conflict do nothing;
end $$;

revoke execute on function public.claim_social_refresh(timestamptz),
  public.save_social_pull(text, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.claim_social_refresh(timestamptz),
  public.save_social_pull(text, text, text, timestamptz, jsonb, jsonb, jsonb, jsonb) to service_role;

create view public.social_latest_days with (security_invoker = true) as
  select distinct on (platform, day) *
  from public.social_daily_snapshots order by platform, day, read_at desc;

create view public.social_latest_audience with (security_invoker = true) as
  select s.* from public.social_audience_snapshots s
  join public.social_accounts a using (platform, read_at);

create view public.social_post_milestone_reads with (security_invoker = true) as
  select s.*
  from public.social_posts p
  join public.social_post_snapshots s using (platform, post_id)
  where s.read_at between p.published_at + interval '24 hours' and p.published_at + interval '72 hours'
     or s.read_at between p.published_at + interval '144 hours' and p.published_at + interval '192 hours';

revoke all on public.social_latest_days, public.social_latest_audience, public.social_post_milestone_reads from public, anon, authenticated;
grant select on public.social_latest_days, public.social_latest_audience, public.social_post_milestone_reads to authenticated;

create index social_ad_visit_tags on public.ad_visits (utm_content, (coalesce(utm_campaign, '')), visited_at)
  where utm_content is not null;
create index social_parent_tags on public.parents ((source->>'utm_content'), (coalesce(source->>'utm_campaign', '')), created_at);

-- Return counts only. The definer lets the admin aggregate across families after the explicit admin check.
-- A null tag never joins. An empty campaign matches links with no campaign.
create function public.admin_social_attribution(p_day date)
returns table (
  platform text, post_id text, visits bigint, signups bigint, checks bigint, cards bigint,
  week_visits bigint, week_signups bigint, week_checks bigint, week_cards bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  p_since timestamptz := public.pacific_day_start(p_day - 7);
  until_at timestamptz := public.pacific_day_start(p_day);
begin
  if (select public.is_admin()) is not true then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
  select s.platform, s.post_id, v.visits, f.signups, f.checks, f.cards,
    v.week_visits, f.week_signups, f.week_checks, f.week_cards
  from public.social_posts s
  cross join lateral (
    select count(*) as visits, count(*) filter (where a.visited_at >= p_since and a.visited_at < until_at) as week_visits
    from public.ad_visits a
    where a.utm_content = s.utm_content and coalesce(a.utm_campaign, '') = coalesce(s.utm_campaign, '')
      and a.visited_at >= s.published_at
  ) v
  cross join lateral (
    select count(*) as signups, count(*) filter (where p.created_at >= p_since and p.created_at < until_at) as week_signups,
      count(*) filter (where c.started), count(*) filter (where d.saved),
      count(*) filter (where c.started_this_week), count(*) filter (where d.saved_this_week)
    from public.parents p
    cross join lateral (
      select count(*) > 0 as started,
        count(*) filter (where a.started_at >= p_since and a.started_at < until_at) > 0 as started_this_week
      from public.assessments a where a.parent_id = p.id and a.started_at is not null
    ) c
    cross join lateral (
      select count(*) > 0 as saved,
        count(*) filter (where a.card_saved_at >= p_since and a.card_saved_at < until_at) > 0 as saved_this_week
      from public.card_setups a where a.parent_id = p.id and a.card_saved_at is not null
    ) d
    where p.source->>'utm_content' = s.utm_content
      and coalesce(p.source->>'utm_campaign', '') = coalesce(s.utm_campaign, '')
      and p.created_at >= s.published_at
      and not exists (select 1 from public.admin_users u where u.user_id = p.id)
      and not exists (select 1 from public.test_accounts t where t.parent_id = p.id)
  ) f(signups, week_signups, checks, cards, week_checks, week_cards)
  where s.utm_content is not null;
end $$;
revoke execute on function public.admin_social_attribution(date) from public, anon, authenticated;
grant execute on function public.admin_social_attribution(date) to authenticated;

-- Delivery outcomes and recorded clicks for messages sent during the last seven full Pacific days.
create function public.admin_social_email(p_day date)
returns table (sent bigint, delivered bigint, failed bigint, clicks bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  since_at timestamptz := public.pacific_day_start(p_day - 7);
  until_at timestamptz := public.pacific_day_start(p_day);
begin
  if (select public.is_admin()) is not true then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return query
  with messages as (
    select l.email_id, l.clicks as clicks from public.email_log l where l.sent_at >= since_at and l.sent_at < until_at
    union all
    select r.email_id, r.email_clicks from public.reports r where r.emailed_at >= since_at and r.emailed_at < until_at
    union all
    select c.email_id, 0 from public.reports r
    left join public.email_copies c on c.report_id = r.id and c.report_email = 'alert'
    where r.alerted_at >= since_at and r.alerted_at < until_at
    union all
    select e.email_id, 0 from public.workbook_emails e where e.sent_at >= since_at and e.sent_at < until_at
    union all
    select e.email_provider_id, 0 from public.plan_starts e where e.email_sent_at >= since_at and e.email_sent_at < until_at
    union all
    select e.email_id, 0 from public.email_sends e where e.outcome = 'sent' and e.created_at >= since_at and e.created_at < until_at
  ), outcomes as (
    select e.email_id, bool_or(e.type = 'delivered') as delivered,
      bool_or(e.type in ('failed', 'bounced', 'suppressed')) as failed
    from public.email_events e where e.email_id in (select m.email_id from messages)
    group by e.email_id
  )
  select count(*), count(*) filter (where o.delivered), count(*) filter (where o.failed), coalesce(sum(m.clicks), 0)
  from messages m left join outcomes o using (email_id);
end $$;
revoke execute on function public.admin_social_email(date) from public, anon, authenticated;
grant execute on function public.admin_social_email(date) to authenticated;
