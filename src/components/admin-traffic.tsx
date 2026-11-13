// The admin Traffic tab (docs/web-analytics.md): visits today, in the past 7 and 30 days and all time, then where they
// came from and how far they get, for the range picked above. Two counts sit side by side. "Visits" is the cookieless
// counter: every visit to a public page, with no cookie and no consent (src/lib/site-hits.ts). "Accepted analytics" is
// PostHog, which sees only visitors who accepted the cookie banner. Server component: no JavaScript; hover shows tips.
import type { ReactNode } from "react";
import { Funnel } from "@/components/admin-charts";
import { BarList, Empty, Pills, SectionHead, Tiles, type Bar } from "@/components/admin-blocks";
import { at, dayLabel } from "@/lib/admin-dashboard";
import type { PosthogTraffic, CountRow } from "@/lib/posthog-traffic";
import { consentGapNote, countryName, deviceName, provinceName, TRAFFIC_RANGES, type HitDay, type HitRow, type SiteTraffic } from "@/lib/site-traffic";
import type { TrafficPage } from "@/lib/traffic-store";
import "./admin-dashboard.css";
import "./admin-pages.css";
import "./admin-traffic.css";

const n = (v: number) => v.toLocaleString("en-CA");
const views = (v: number) => `${n(v)} page ${v === 1 ? "view" : "views"}`;

const bars = (rows: { label: string; visits: number }[], name: (l: string) => ReactNode = (l) => l): Bar[] =>
  rows.map((r) => ({ key: r.label, label: name(r.label), value: r.visits }));

/** Daily bars: every visit, and beside it the visitors who accepted analytics, when PostHog is connected. */
function DailyChart({ days, accepted }: { days: HitDay[]; accepted: Map<string, number> | null }) {
  if (days.length < 2) return <Empty>The chart shows once two days have counted visits.</Empty>;
  const w = 720, h = 180, padL = 30, padB = 22, padT = 8;
  const top = Math.max(2, ...days.map((d) => d.visits), ...(accepted ? [...accepted.values()] : [0]));
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / top);
  const gw = (w - padL) / days.length;
  const bw = Math.max(2, Math.min(14, (gw - 4) / (accepted ? 2 : 1)));
  const every = Math.ceil(days.length / Math.max(2, Math.floor(w / 70)));
  return (
    <figure className="dash-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Visits per day">
        {[0, Math.ceil(top / 2), top].map((t) => <g key={t}><line x1={padL} x2={w} y1={y(t)} y2={y(t)} className="dash-grid" /><text x={padL - 6} y={y(t) + 4} className="dash-axis" textAnchor="end">{t}</text></g>)}
        {days.map((d, i) => {
          const x0 = padL + i * gw + (gw - bw * (accepted ? 2 : 1)) / 2;
          const a = accepted?.get(d.day) ?? 0;
          return (
            <g key={d.day}>
              {d.visits > 0 && <rect x={x0} y={y(d.visits)} width={bw - 1} height={y(0) - y(d.visits)} rx={1.5} className="dash-bar is-accounts"><title>{`${dayLabel(d.day)}: ${d.visits} visits, ${views(d.views)}`}</title></rect>}
              {accepted && a > 0 && <rect x={x0 + bw} y={y(a)} width={bw - 1} height={y(0) - y(a)} rx={1.5} className="dash-bar is-started"><title>{`${dayLabel(d.day)}: ${a} accepted analytics`}</title></rect>}
              {i % every === 0 && <text x={padL + i * gw + gw / 2} y={h - 6} className="dash-axis" textAnchor="middle">{dayLabel(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="dash-legend">
        <span><i className="is-accounts" />Visits</span>
        {accepted && <span><i className="is-started" />Accepted analytics</span>}
      </figcaption>
    </figure>
  );
}

function CampaignTable({ site }: { site: SiteTraffic }) {
  if (!site.campaigns.length) return <Empty>No visit from a tagged link in this range. Ads and tagged links show here with the signups they brought.</Empty>;
  return (
    <div className="adm-scroll" role="region" aria-label="Campaigns" tabIndex={0}>
      <table className="adm-table">
        <thead>
          <tr><th scope="col">Source</th><th scope="col">Medium</th><th scope="col">Campaign</th><th scope="col" className="adm-num">Visits</th><th scope="col" className="adm-num">Signups</th><th scope="col" className="adm-num">Signups per 100 visits</th></tr>
        </thead>
        <tbody>
          {site.campaigns.map((c) => (
            <tr key={`${c.source}|${c.medium}|${c.campaign}`}>
              <th scope="row">{c.source}</th>
              <td>{c.medium ?? "-"}</td>
              <td>{c.campaign ?? "-"}</td>
              <td className="adm-num">{n(c.visits)}</td>
              <td className="adm-num">{n(c.signups)}</td>
              <td className="adm-num">{c.visits > 0 ? (Math.round((1000 * c.signups) / c.visits) / 10).toLocaleString("en-CA") : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const List = ({ id, title, line, rows, name, empty = "Nothing counted in this range." }: { id: string; title: string; line?: string; rows: HitRow[]; name?: (l: string) => ReactNode; empty?: string }) => (
  <section className="ap-card" aria-labelledby={id}>
    <SectionHead id={id} title={title} line={line} />
    {rows.length ? <BarList label={title} bars={bars(rows, name)} /> : <Empty>{empty}</Empty>}
  </section>
);

function PosthogPanel({ p }: { p: PosthogTraffic }) {
  const list = (title: string, rows: CountRow[] | null, name?: (l: string) => string) => (
    <section className="ap-card" aria-labelledby={`ph-${title}`}>
      <SectionHead id={`ph-${title}`} title={title} />
      {rows === null ? <Empty>PostHog did not answer for this list.</Empty> : rows.length ? <BarList label={title} bars={rows.map((r) => ({ key: r.label, label: name ? name(r.label) : r.label, value: r.visitors }))} /> : <Empty>Nothing counted in this range.</Empty>}
    </section>
  );
  return (
    <>
      {p.errors.length > 0 && <p className="ab-needs" role="alert"><b>PostHog:</b> {p.errors.join("; ")}</p>}
      <div className="ap-split">
        {list("Sources", p.referrers)}
        {list("Campaigns", p.campaigns)}
        {list("Top pages", p.pages)}
        {list("Countries", p.countries, countryName)}
        {list("Devices", p.devices, (l) => deviceName(l))}
        {list("Browsers", p.browsers)}
      </div>
    </>
  );
}

export function TrafficView({ d }: { d: TrafficPage }) {
  const { site, posthog, range } = d;
  const href = (key: string) => `/admin/traffic?range=${key}`;
  const accepted = posthog?.daily ? new Map(posthog.daily.map((x) => [x.day, x.visitors])) : null;
  const ph = posthog?.windows ?? null;
  return (
    <>
      <Pills label="Range" pills={TRAFFIC_RANGES.map((r) => ({ key: r.key, href: href(r.key), label: r.label, current: r.key === range.key }))} />
      {d.siteError && <p className="ab-needs" role="alert"><b>Needs you:</b> {d.siteError}</p>}
      {site && (
        <>
          <section className="tr-section" aria-labelledby="tr-visits">
            <SectionHead id="tr-visits" title="Visits" line="Every visit to a public page, counted with no cookie, so it does not depend on the cookie banner. One visit is one browser tab, from open to close: a person on two devices counts twice." />
            <Tiles label="Visits" tiles={[
              { key: "today", label: "Today", value: n(site.windows.today.visits), sub: views(site.windows.today.views) },
              { key: "d7", label: "Past 7 days", value: n(site.windows.d7.visits), sub: views(site.windows.d7.views) },
              { key: "d30", label: "Past 30 days", value: n(site.windows.d30.visits), sub: views(site.windows.d30.views) },
              { key: "all", label: "All time", value: n(site.windows.all.visits), sub: views(site.windows.all.views) },
            ]} />
            {site.firstHit && <p className="adm-note ap-foot">First visit counted: {at(site.firstHit)}, Pacific time. Days are Pacific days. The team&apos;s own pages and the signed-in pages are not counted; a team member browsing the public site is.</p>}
          </section>

          <section className="tr-section" aria-labelledby="tr-accepted">
            <SectionHead id="tr-accepted" title="Accepted analytics (PostHog)" line="Visitors who accepted the cookie banner. PostHog knows one person across tabs and days, so these are people, not tabs." />
            {!d.posthogConfigured && (
              <p className="ab-needs" role="status"><b>Needs you:</b> PostHog is not connected. Add a read-only personal API key as POSTHOG_PERSONAL_API_KEY in Vercel to show these numbers. The visit counts above work without it.</p>
            )}
            {ph && (
              <>
                <Tiles label="Accepted analytics" tiles={[
                  { key: "today", label: "Today", value: n(ph.today.visitors), sub: views(ph.today.views) },
                  { key: "d7", label: "Past 7 days", value: n(ph.d7.visitors), sub: views(ph.d7.views) },
                  { key: "d30", label: "Past 30 days", value: n(ph.d30.visitors), sub: views(ph.d30.views) },
                  { key: "all", label: "All time", value: n(ph.all.visitors), sub: views(ph.all.views) },
                ]} />
                <p className="adm-note ap-foot">{consentGapNote(d.counterDays, ph.d30.visitors, site.windows.d30.visits)}</p>
              </>
            )}
            {d.posthogConfigured && posthog && !ph && <p className="ab-needs" role="alert"><b>PostHog:</b> {posthog.errors.join("; ") || "no answer"}</p>}
          </section>

          <section className="ap-card" aria-labelledby="tr-daily">
            <SectionHead id="tr-daily" title={`Per day: ${range.label.toLowerCase()}`} line="Visits per Pacific day." />
            <DailyChart days={site.daily} accepted={accepted} />
          </section>

          <section className="ap-card" aria-labelledby="tr-funnel">
            <SectionHead id="tr-funnel" title="How far they get" line={`${range.label}. Visits and signup page opens are browser tabs; accounts and tests are families (test families are ${d.withTests ? "counted" : "left out"}).`} />
            <h3 className="tr-sub">Visitors</h3>
            <Funnel steps={[
              { label: "Visits", value: site.funnel.visits },
              { label: "Opened the signup page", value: site.funnel.startOpen },
            ]} />
            <h3 className="tr-sub">Families</h3>
            <Funnel steps={[
              { label: "Made an account", value: site.funnel.accounts },
              { label: "Started the test", value: site.funnel.started },
              { label: "Finished the test", value: site.funnel.finished },
            ]} />
            <p className="adm-note ap-foot">Visits and families are counted apart: a family can sign up from a visit before this range or from another device, so the two lists do not join up.</p>
          </section>

          <section className="ap-card" aria-labelledby="tr-campaigns">
            <SectionHead id="tr-campaigns" title="What is working" line="Visits that came from a tagged link or ad (UTM tags), and the signups each one brought. Signups count families with the same source, medium and campaign." />
            <CampaignTable site={site} />
          </section>

          <div className="ap-split">
            <List id="tr-from" title="Where visits come from" line="The site a visit came from. Direct: typed in, a bookmark, or an app that hides it." rows={site.referrers} />
            <List id="tr-landing" title="Landing pages" line="The first page of each visit." rows={site.landingPages} />
            <List id="tr-pages" title="Top pages" line="Page views per page." rows={site.pages.map((r) => ({ label: r.label, visits: r.views ?? r.visits }))} />
            <List id="tr-device" title="Devices" rows={site.devices} name={deviceName} />
            <List id="tr-browser" title="Browsers" line="Instagram and Facebook app: a link opened inside the app." rows={site.browsers} />
            <List id="tr-country" title="Countries" line="From the host's location of the connection. No address is kept." rows={site.countries} name={countryName} />
            <List id="tr-region" title="Canadian provinces" rows={site.regions} name={provinceName} />
          </div>

          {!site.firstHit && <Empty>No visit counted yet. Visits appear here from the first one after this page shipped.</Empty>}
        </>
      )}

      {posthog && (
        <details className="adm-tech ap-setup">
          <summary>Accepted analytics, in detail (PostHog)</summary>
          <PosthogPanel p={posthog} />
        </details>
      )}
    </>
  );
}
