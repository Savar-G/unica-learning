-- Ad test (D-126): Meta and Google Search ads link to the home page with UTM tags (utm_source=meta or google).
-- When a visit lands from an ad or a tagged link (a utm_source other than flyer, or a gclid or fbclid in the address),
-- the browser makes one random visit ID for the tab and posts it once to /api/visit (src/app/api/visit/route.ts), which
-- writes one row here after the response. The same visit ID goes into parents.source (key visit_id) when the visitor
-- signs up, so a visit joins to a family. Flyer scans are counted in flyer_scans, not here.
-- ad_visits: one row per visit ID, with the UTM tags, the time, and only whether a Google (gclid) or Meta (fbclid)
--   click ID was there. No IP, no user agent, no cookie and no click ID value: the count needs no consent.
-- The server writes visits with the secret key; admins read them; parents and visitors get nothing.
-- Additive: no code on main reads this table, and /api/visit fails quietly until it exists.
create table public.ad_visits (
  id bigint generated always as identity primary key,
  visited_at timestamptz not null default now(),
  visit_id uuid not null unique,
  utm_source text check (utm_source is null or (char_length(utm_source) between 1 and 100 and utm_source !~ '[[:cntrl:]]')),
  utm_medium text check (utm_medium is null or (char_length(utm_medium) between 1 and 100 and utm_medium !~ '[[:cntrl:]]')),
  utm_campaign text check (utm_campaign is null or (char_length(utm_campaign) between 1 and 100 and utm_campaign !~ '[[:cntrl:]]')),
  utm_content text check (utm_content is null or (char_length(utm_content) between 1 and 100 and utm_content !~ '[[:cntrl:]]')),
  has_gclid boolean not null default false,
  has_fbclid boolean not null default false
);
create index ad_visits_source_time_idx on public.ad_visits (utm_source, visited_at);

alter table public.ad_visits enable row level security;
revoke all on table public.ad_visits from anon, authenticated;
grant select on table public.ad_visits to authenticated;
create policy "Admins read the ad visits" on public.ad_visits
  for select to authenticated using ((select public.is_admin()));
