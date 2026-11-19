import { BarList, Empty, Pills, SectionHead, Tiles } from "@/components/admin-blocks";
import { TAG_MAX } from "@/lib/ad-visits";
import { at } from "@/lib/admin-dashboard";
import { POST_SORTS, type socialDashboard } from "@/lib/social-dashboard";
import { DAILY_METRICS, SOCIAL_LABELS, type DailyMetric, type WeeklyValue } from "@/lib/social-metrics";
import "./admin-dashboard.css";
import "./admin-pages.css";
import "./admin-traffic.css";
import "./admin-social.css";

type Dashboard = ReturnType<typeof socialDashboard>;
type Post = Dashboard["posts"][number];

const METRICS: Record<DailyMetric, string> = {
  views: "Views", reach: "Reach / viewers", interactions: "Interactions",
  profile_visits: "Profile visits", link_clicks: "Link / CTA clicks", followers_gained: "Followers gained",
};
const NOTICE: Record<string, string> = {
  refreshed: "Refresh finished. See the outcome for each channel below.",
  cooldown: "A refresh was started in the last 10 minutes. Try again after the cooldown.",
  "refresh-failed": "The refresh could not finish. Try again in 10 minutes.",
  saved: "Tracking tags saved.",
  duplicate: "Another post already uses that content and campaign pair.",
  missing: "This post could not be found.",
  unavailable: "The tags could not be saved. Try again.",
  invalid: "Use up to 100 characters per tag. Campaign requires a content tag.",
};
const number = (value: number | null | undefined) => value == null ? "—" : value.toLocaleString("en-CA", { maximumFractionDigits: 1 });

function statusText(channel: Dashboard["channels"][number]) {
  if (channel.platform === "tiktok" || channel.platform === "linkedin") return "Not connected yet";
  if (!channel.configured) return "Not connected";
  const state = channel.status?.status;
  if (state === "failed") return "Refresh failed";
  if (state === "partial") return "Some metrics unavailable";
  if (state === "ok") return "Connected";
  return channel.account ? "Connected · awaiting refresh result" : "Ready for first refresh";
}

function WeekValue({ count }: { count: WeeklyValue }) {
  return <>{number(count?.value)}{count?.net && <small> net</small>}{count && count.days < 7 && <small> · {count.days}/7 days</small>}</>;
}

function Connections({ dashboard }: { dashboard: Dashboard }) {
  const { channels, combined } = dashboard;
  const active = channels.filter((channel) => channel.account || channel.configured);
  const latest = dashboard.latestRefresh;
  return (
    <section className="tr-section" aria-labelledby="social-channels">
      <SectionHead id="social-channels" title="Channels"
        line="Last 7 full Pacific days compared with the 7 before. Reach adds daily counts. Providers can report on different schedules."
        actions={<form method="post" action="/api/admin/social/refresh"><button type="submit" className="btn adm-btn" disabled={!channels.some((channel) => channel.configured)}>Refresh now</button></form>} />
      {latest && <p className="adm-note">Last refresh started {at(latest)} Pacific.</p>}
      <ul className="social-connections" aria-label="Channel connections">
        {channels.map((channel) => (
          <li key={channel.platform}>
            <strong>{channel.label}</strong>
            <span>{statusText(channel)}</span>
            {channel.account && <span>Last saved {at(channel.account.read_at)}</span>}
            {channel.status?.message && <span className="social-provider-message">{channel.status.message}</span>}
          </li>
        ))}
      </ul>
      {active.length > 0 && (
        <div className="adm-scroll" role="region" aria-label="Weekly channel comparison" tabIndex={0}>
          <table className="adm-table social-weeks">
            <thead>
              <tr><th scope="col">Measure</th><th scope="col">Combined</th>{active.map((channel) => <th scope="col" key={channel.platform}>{channel.label}</th>)}</tr>
            </thead>
            <tbody>
              {DAILY_METRICS.map((metric) => (
                <tr key={metric}>
                  <th scope="row">{METRICS[metric]}</th>
                  <td>{(["current", "previous"] as const).map((period) => {
                    const count = combined(period, metric);
                    return <span className="social-period" key={period}>
                      <small>{period === "current" ? "Last 7" : "Prior 7"}</small> {number(count?.value)}
                      {count?.net && <small> incl. net</small>}
                      {count && (count.days < active.length * 7) && <small> · {count.days}/{active.length * 7} channel-days</small>}
                    </span>;
                  })}</td>
                  {active.map((channel) => <td key={channel.platform}>
                    <span className="social-period"><small>Last 7</small> <WeekValue count={channel.current[metric]} /></span>
                    <span className="social-period"><small>Prior 7</small> <WeekValue count={channel.previous[metric]} /></span>
                  </td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Funnel({ dashboard }: { dashboard: Dashboard }) {
  const { combined, funnel } = dashboard;
  const steps = [
    { label: "Views", value: combined("current", "views")?.value },
    { label: "Profile visits", value: combined("current", "profile_visits")?.value },
    { label: "Link / CTA clicks", value: combined("current", "link_clicks")?.value },
    { label: "Tagged site visits", value: funnel.visits },
    { label: "Math checks started", value: funnel.checks },
    { label: "Saved cards", value: funnel.cards },
  ];
  return (
    <section className="ap-card" aria-labelledby="social-funnel">
      <SectionHead id="social-funnel" title="Social funnel" line="Last 7 full Pacific days. Platform counts and tagged site activity cover different groups. Facebook reports clicks on Page contact info and action buttons together." />
      <BarList label="Social funnel" bars={steps.map((step) => ({ key: step.label, label: step.label, value: step.value ?? 0, text: number(step.value) }))} />
    </section>
  );
}

function Snapshot({ read }: { read: Post["at48h"] }) {
  if (!read) return <span aria-label="No snapshot">—</span>;
  const metrics = [
    ["Views", read.views], ["Reach", read.reach], ["Likes", read.likes], ["Comments", read.comments],
    ["Saves", read.saves], ["Shares", read.shares], ["Follows", read.follows],
  ] as const;
  return (
    <>
      <div className="adm-note">Read {at(read.read_at)}</div>
      <dl className="social-read">
        {metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{number(value)}</dd></div>)}
        <div><dt>Avg. watch</dt><dd>{read.watch_seconds == null ? "—" : `${number(read.watch_seconds)} s`}</dd></div>
        <div><dt>Avg. viewed</dt><dd>{read.watch_percent == null ? "—" : `${number(read.watch_percent)}%`}</dd></div>
      </dl>
    </>
  );
}

function PostTable({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="ap-card" aria-labelledby="social-posts">
      <SectionHead id="social-posts" title="Posts" count={dashboard.posts.length}
        line="Each milestone uses the closest read within 24 hours of its target. Sorting uses the 7-day read when available, then the 48-hour read. A dash means the value is unavailable." />
      <Pills label="Sort posts" pills={Object.entries(POST_SORTS).map(([key, label]) => ({
        key, label, href: `/admin/social?sort=${key}#social-posts`, current: dashboard.sort === key,
      }))} />
      {dashboard.posts.length === 0 ? <Empty>Posts appear here after the first successful refresh.</Empty> : (
        <div className="adm-scroll" role="region" aria-label="Post performance" tabIndex={0}>
          <table className="adm-table social-posts">
            <thead><tr><th scope="col">Post</th><th scope="col">At about 48 hours</th><th scope="col">At about 7 days</th><th scope="col">Site results since publication</th></tr></thead>
            <tbody>
              {dashboard.posts.map((post) => {
                const channel = dashboard.channels.find((item) => item.platform === post.platform)?.label ?? post.platform;
                return (
                  <tr key={post.key}>
                    <th scope="row"><a href={post.permalink} target="_blank" rel="noreferrer">{post.caption || `${channel} ${post.format.toLowerCase()}`}</a>
                      <p className="adm-note">{channel} · {post.format} · {at(post.published_at)}</p>
                    </th>
                    <td><Snapshot read={post.at48h} /></td>
                    <td><Snapshot read={post.at7d} /></td>
                    <td>
                      {post.attribution
                        ? <dl className="social-read">
                          <div><dt>Visits</dt><dd>{number(post.attribution.visits)}</dd></div>
                          <div><dt>Signups</dt><dd>{number(post.attribution.signups)}</dd></div>
                          <div><dt>Math checks</dt><dd>{number(post.attribution.checks)}</dd></div>
                          <div><dt>Saved cards</dt><dd>{number(post.attribution.cards)}</dd></div>
                        </dl>
                        : <p className="adm-note">Add tracking tags to see site results.</p>}
                      <details>
                        <summary>{post.utm_content ? "Edit tracking tags" : "Add tracking tags"}</summary>
                        <form className="social-tags" method="post" action="/api/admin/social/tag">
                          <input type="hidden" name="platform" value={post.platform} />
                          <input type="hidden" name="post" value={post.post_id} />
                          <label>Content <input name="content" defaultValue={post.utm_content ?? ""} maxLength={TAG_MAX} /></label>
                          <label>Campaign <input name="campaign" defaultValue={post.utm_campaign ?? ""} maxLength={TAG_MAX} /></label>
                          <button type="submit" className="btn adm-btn">Save tags</button>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const AUDIENCE_DIMENSIONS: Record<string, string> = { age: "Age", country: "Country", "traffic source": "Traffic source" };

function Audience({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="tr-section" aria-labelledby="social-audience">
      <SectionHead id="social-audience" title="YouTube audience" line="The latest available breakdowns from the past 30 days." />
      <div className="ap-split">
        {Object.entries(AUDIENCE_DIMENSIONS).map(([dimension, label]) => {
          const rows = dashboard.audience.filter((row) => row.platform === "youtube" && row.dimension === dimension)
            .sort((a, b) => b.value - a.value).slice(0, 10);
          return <div className="ap-card" key={dimension}>
            <h3 className="tr-sub">{label}</h3>
            {rows.length > 0 ? <BarList label={label} bars={rows.map((row) => ({
              key: row.label, label: row.label, value: row.value, text: `${number(row.value)}${row.unit === "percent" ? "%" : ""}`,
            }))} /> : <Empty>No data available for this breakdown.</Empty>}
          </div>;
        })}
      </div>
      {(["instagram", "facebook"] as const).map((platform) => {
        const rows = dashboard.audience.filter((row) => row.platform === platform);
        if (!rows.length) return null;
        return <div className="ap-card" key={platform}>
          <h3 className="tr-sub">{SOCIAL_LABELS[platform]} audience</h3>
          <BarList label={`${SOCIAL_LABELS[platform]} audience`} bars={rows.sort((a, b) => b.value - a.value).slice(0, 15).map((row) => ({
            key: `${row.dimension}/${row.label}`, label: `${AUDIENCE_DIMENSIONS[row.dimension] ?? row.dimension} · ${row.label}`,
            value: row.value, text: `${number(row.value)} ${row.unit}`,
          }))} />
        </div>;
      })}
    </section>
  );
}

export function SocialView({ dashboard, notice }: { dashboard: Dashboard; notice: unknown }) {
  const message = typeof notice === "string" && Object.hasOwn(NOTICE, notice) ? NOTICE[notice] : null;
  const email = dashboard.email;
  return (
    <>
      {message && <p className="ab-needs" role="status">{message}</p>}
      <Connections dashboard={dashboard} />
      <Funnel dashboard={dashboard} />
      <PostTable dashboard={dashboard} />
      <Audience dashboard={dashboard} />
      <section className="tr-section" aria-labelledby="social-email">
        <SectionHead id="social-email" title="Email" line="Messages sent in the last 7 full Pacific days, with delivery outcomes and recorded clicks so far." />
        {email ? <Tiles label="Email outcomes" tiles={[
          { key: "sent", label: "Sent", value: number(email.sent) },
          { key: "delivered", label: "Delivered", value: number(email.delivered) },
          { key: "failed", label: "Failed", value: number(email.failed) },
          { key: "clicks", label: "Clicks", value: number(email.clicks) },
        ]} /> : <Empty>Email counts could not load.</Empty>}
      </section>
    </>
  );
}
