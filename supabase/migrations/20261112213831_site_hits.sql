-- Site traffic counter (docs/web-analytics.md): one row per page view of a public page, counted with no cookie and no
-- consent, so the admin Traffic tab shows every visit, not only visitors who accepted analytics.
-- The browser posts to /api/hit on each public page; a "visit" is one browser tab (a random id kept in sessionStorage
-- until the tab closes). A row keeps the path, the referrer's host, UTM tags (first page of the visit only), a coarse
-- device class, browser family and country/region from the host's geo headers. Never an IP, a user agent, a cookie, a
-- full referrer address or a query string.
-- The server writes with the secret key; admins read through the admin_site_traffic function; parents and anon get nothing.
-- Additive: nothing on main reads this table yet.
create table public.site_hits (
  id bigint generated always as identity primary key,
  hit_at timestamptz not null default now(),
  visit_id uuid not null,
  path text not null check (length(path) between 1 and 200 and path ~ '^/'),
  is_landing boolean not null default false,
  referrer_host text check (referrer_host is null or length(referrer_host) <= 100),
  utm_source text check (utm_source is null or length(utm_source) <= 100),
  utm_medium text check (utm_medium is null or length(utm_medium) <= 100),
  utm_campaign text check (utm_campaign is null or length(utm_campaign) <= 100),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  region text check (region is null or region ~ '^[A-Z0-9]{1,3}$'),
  device text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  browser text check (browser is null or length(browser) <= 30)
);
create index site_hits_hit_at_idx on public.site_hits (hit_at);
create index site_hits_visit_idx on public.site_hits (visit_id);

alter table public.site_hits enable row level security;
revoke all on table public.site_hits from anon, authenticated;
grant select on table public.site_hits to authenticated;
create policy "Admins read the site hits" on public.site_hits
  for select to authenticated using ((select public.is_admin()));

-- The Traffic tab's numbers in one call. p_days: the range of the breakdowns (1 = today, 7, 30; null = all time).
-- Days are Pacific days. p_with_tests: count test and team families in the signup funnel (the "Show test families"
-- switch). Visits are distinct visit ids; views are rows.
create function public.admin_site_traffic(p_days integer default 7, p_with_tests boolean default false)
returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  zone constant text := 'America/Vancouver';
  today date := (now() at time zone zone)::date;
  since timestamptz;
  out jsonb;
begin
  if not (select public.is_admin()) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'p_days out of range' using errcode = '22023';
  end if;
  since := case when p_days is null then '-infinity'::timestamptz
                else ((today - (p_days - 1))::timestamp at time zone zone) end;

  with
  hits as materialized (
    select h.*, (h.hit_at at time zone zone)::date as day from public.site_hits h where h.hit_at >= since
  ),
  landings as (select * from hits where is_landing),
  windows as (
    select jsonb_build_object(
      'today', jsonb_build_object(
        'visits', count(distinct visit_id) filter (where day = today), 'views', count(*) filter (where day = today)),
      'd7', jsonb_build_object(
        'visits', count(distinct visit_id) filter (where day > today - 7), 'views', count(*) filter (where day > today - 7)),
      'd30', jsonb_build_object(
        'visits', count(distinct visit_id) filter (where day > today - 30), 'views', count(*) filter (where day > today - 30)),
      'all', jsonb_build_object('visits', count(distinct visit_id), 'views', count(*))
    ) as j
    from (select visit_id, (hit_at at time zone zone)::date as day from public.site_hits) w
  ),
  first_hit as (select min(hit_at) as t from public.site_hits),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'visits', coalesce(v.visits, 0), 'views', coalesce(v.views, 0)) order by d.day), '[]'::jsonb) as j
    from (
      select generate_series(
        greatest(case when p_days is null then (select (t at time zone zone)::date from first_hit) else today - (p_days - 1) end, today - 89),
        today, interval '1 day')::date as day
    ) d
    left join (select day, count(distinct visit_id) as visits, count(*) as views from hits group by day) v on v.day = d.day
  ),
  pages as (
    select coalesce(jsonb_agg(jsonb_build_object('label', path, 'views', views, 'visits', visits) order by views desc, path), '[]'::jsonb) as j
    from (select path, count(*) as views, count(distinct visit_id) as visits from hits group by path order by views desc, path limit 10) t
  ),
  landing_pages as (
    select coalesce(jsonb_agg(jsonb_build_object('label', path, 'visits', n) order by n desc, path), '[]'::jsonb) as j
    from (select path, count(distinct visit_id) as n from landings group by path order by n desc, path limit 10) t
  ),
  referrers as (
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'visits', n) order by n desc, k), '[]'::jsonb) as j
    from (select coalesce(referrer_host, 'Direct or unknown') as k, count(distinct visit_id) as n from landings group by 1 order by n desc, k limit 10) t
  ),
  campaigns as (
    select coalesce(jsonb_agg(jsonb_build_object('source', c.utm_source, 'medium', c.utm_medium, 'campaign', c.utm_campaign, 'visits', c.n, 'signups', s.n) order by c.n desc, c.utm_source), '[]'::jsonb) as j
    from (
      select utm_source, utm_medium, utm_campaign, count(distinct visit_id) as n
      from landings where utm_source is not null
      group by utm_source, utm_medium, utm_campaign order by n desc limit 12
    ) c
    left join lateral (
      select count(*) as n from public.parents p
      where p.created_at >= since
        and lower(p.source ->> 'utm_source') = lower(c.utm_source)
        and coalesce(lower(p.source ->> 'utm_campaign'), '') = coalesce(lower(c.utm_campaign), '')
        and (p_with_tests or (
          not exists (select 1 from public.admin_users u where u.user_id = p.id)
          and not exists (select 1 from public.test_accounts t where t.parent_id = p.id)))
    ) s on true
  ),
  devices as (
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'visits', n) order by n desc, k), '[]'::jsonb) as j
    from (select coalesce(device, 'Unknown') as k, count(distinct visit_id) as n from landings group by 1) t
  ),
  browsers as (
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'visits', n) order by n desc, k), '[]'::jsonb) as j
    from (select coalesce(browser, 'Unknown') as k, count(distinct visit_id) as n from landings group by 1 order by n desc, k limit 8) t
  ),
  countries as (
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'visits', n) order by n desc, k), '[]'::jsonb) as j
    from (select coalesce(country, 'Unknown') as k, count(distinct visit_id) as n from landings group by 1 order by n desc, k limit 8) t
  ),
  regions as (
    select coalesce(jsonb_agg(jsonb_build_object('label', k, 'visits', n) order by n desc, k), '[]'::jsonb) as j
    from (select coalesce(region, 'Unknown') as k, count(distinct visit_id) as n from landings where country = 'CA' group by 1 order by n desc, k limit 13) t
  ),
  eligible as (
    select p.id, p.created_at from public.parents p
    where p.created_at >= since
      and (p_with_tests or (
        not exists (select 1 from public.admin_users u where u.user_id = p.id)
        and not exists (select 1 from public.test_accounts t where t.parent_id = p.id)))
  ),
  funnel as (
    select jsonb_build_object(
      'visits', (select count(distinct visit_id) from hits),
      'start_open', (select count(distinct visit_id) from hits where path = '/start'),
      'accounts', (select count(*) from eligible),
      'started', (select count(distinct a.parent_id) from public.assessments a join eligible e on e.id = a.parent_id where a.created_at >= since),
      'finished', (select count(distinct a.parent_id) from public.assessments a join eligible e on e.id = a.parent_id where a.created_at >= since and a.status = 'completed')
    ) as j
  )
  select jsonb_build_object(
    'windows', (select j from windows),
    'daily', (select j from daily),
    'pages', (select j from pages),
    'landing_pages', (select j from landing_pages),
    'referrers', (select j from referrers),
    'campaigns', (select j from campaigns),
    'devices', (select j from devices),
    'browsers', (select j from browsers),
    'countries', (select j from countries),
    'regions', (select j from regions),
    'funnel', (select j from funnel),
    'first_hit', (select t from first_hit)
  ) into out;
  return out;
end;
$$;
revoke execute on function public.admin_site_traffic(integer, boolean) from public, anon;
grant execute on function public.admin_site_traffic(integer, boolean) to authenticated;
