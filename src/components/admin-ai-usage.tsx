// The AI cost reports use the existing admin frame and parts. Server links preserve the report and period.
// Native disclosures keep detailed records available without expanding the initial page.
import Link from "next/link";
import { Table } from "@/components/admin";
import { BarList, Empty, Pills, SectionHead, Tiles } from "@/components/admin-blocks";
import {
  ADMIN_AI_PATH, RANGES, buildStack, cad, cadCents, costShare, featureGroupOf, groupFeatures, niceTop, usd,
  type Period, type Stack, type UsageView, type UsageDetail,
} from "@/lib/admin-ai-usage";
import { AdminProviderReceipts } from "@/components/admin-provider-receipts";
import { AdminAiCostHistory } from "@/components/admin-ai-cost-history";
import type { HistoryView } from "@/lib/ai-cost-history";
import type { ProviderReceiptView } from "@/lib/openrouter-provider-receipts";
import { CHILD_COST_PATH } from "@/lib/child-unit-cost";
import { formatCalendarDate } from "@/lib/family-time";
import { workspaceActivityUrl, type WorkspaceReading } from "@/lib/openrouter-workspace";
import "./admin-ai-usage.css";
import "./admin-pages.css";

export { OPENROUTER_ACTIVITY_URL } from "@/lib/openrouter-workspace";

const calls = (n: number) => `${n.toLocaleString("en-CA")} ${n === 1 ? "call" : "calls"}`;
const dayShort = (day: string) => formatCalendarDate(day, { month: "short", day: "numeric" });
const SUBSCRIPTION_TEXT = "subscription, no per-call charge";

/** One colour for each model of the chart, in the stack's order (fixed slots, never cycled); the folded models are grey. */
const slotOf = (stack: Stack, model: string) => (model === "Other models" ? "other" : String(Math.min(6, stack.models.indexOf(model) + 1)));

function Chart({ stack }: { stack: Stack }) {
  const w = 720, h = 232, padL = 52, padR = 8, padT = 10, padB = 26;
  const top = niceTop(stack.maxUsd);
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / top);
  const gw = (w - padL - padR) / Math.max(1, stack.days.length);
  const bw = Math.max(3, Math.min(28, gw * 0.7));
  const every = Math.ceil(stack.days.length / Math.max(2, Math.floor((w - padL) / 64)));
  const ticks = [0, top / 2, top];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Daily AI cost in US dollars, stacked by model, ${stack.days.length} days`} className="ai-chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="ai-grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="ai-axis">{t === 0 ? "0" : `$${t < 1 ? t.toFixed(2) : t % 1 ? t.toFixed(1) : t}`}</text>
        </g>
      ))}
      {stack.days.map((d, i) => {
        const x = padL + i * gw + (gw - bw) / 2;
        let base = 0;
        return (
          <g key={d.day}>
            {d.segments.map((s) => {
              const y0 = y(base), y1 = y(base + s.costUsd);
              // A 2 px gap under each fill that sits on another; a thin segment stays drawn, at least 1.5 px high.
              const height = Math.max(1.5, y0 - y1 - (base === 0 ? 0 : 2));
              base += s.costUsd;
              return (
                <rect key={s.model} x={x} y={y1} width={bw} height={height} rx={2} className={`ai-seg is-c${slotOf(stack, s.model)}`}>
                  <title>{`${dayShort(d.day)}: ${s.model}, ${usd(s.costUsd)}`}</title>
                </rect>
              );
            })}
            {i % every === 0 && <text x={padL + i * gw + gw / 2} y={h - 8} textAnchor="middle" className="ai-axis">{dayShort(d.day)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function DailyChart({ view, period }: { view: UsageView; period: Period }) {
  const stack = buildStack(view.daily, period.days);
  if (stack.models.length === 0) return <Empty>No cost was recorded in this period. Calls on the subscription have no per-call cost.</Empty>;
  return (
    <figure className="ai-figure">
      <div className="ai-chart-wrap"><Chart stack={stack} /></div>
      <figcaption className="ai-legend">
        {stack.models.map((m) => <span key={m}><i className={`is-c${slotOf(stack, m)}`} aria-hidden="true" />{m}</span>)}
      </figcaption>
      <details className="ai-table">
        <summary>Show as a table</summary>
        <Table label="Cost by day" head={["Day", "Cost (USD)", "Calls"]} empty="No days.">
          {stack.days.map((d) => <tr key={d.day}><td>{dayShort(d.day)}</td><td className="adm-num">{usd(d.totalUsd)}</td><td className="adm-num">{d.calls.toLocaleString("en-CA")}</td></tr>)}
        </Table>
      </details>
    </figure>
  );
}

const workspaceUsd = (n: number) => `USD ${n > 0 && n < 1e-8 ? n.toString() : n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;

export function UsageDetails({ rows, more = false, id = "ai-details" }: { rows: readonly UsageDetail[] | null; more?: boolean; id?: string }) {
  if (rows === null) return <Empty>Detailed records are unavailable. Apply the reporting migration before using these breakdowns.</Empty>;
  const children = new Map<string, UsageDetail[]>();
  for (const row of rows) {
    const key = `${row.parentId ?? ""}:${row.childId ?? ""}`;
    children.set(key, [...children.get(key) ?? [], row]);
  }
  return <section className="ap-card" aria-labelledby={id}>
    <SectionHead id={id} title="Recorded detail by family and child" line="USD. Expand a child to see context, feature, model and API key. An unknown child stays unassigned. Subscription calls have no per-call charge. Estimates and unknown prices stay separate." />
    {more && <p className="ai-note">Only the first 5,000 grouped detail rows are shown. The overall summary includes all records.</p>}
    {!rows.length && <Empty>No detailed records in this scope. This does not mean no workspace spend.</Empty>}
    {[...children.entries()].map(([key, items]) => <details key={key} className="ai-table">
      <summary>{items[0].parentName} / {items[0].childName} ({items.reduce((s, r) => s + r.calls, 0)} recorded calls)</summary>
      <Table label={`${items[0].childName} usage`} head={["Context", "Feature", "Provider / model", "API key", "Cost basis", "Known cost", "Calls"]} empty="No records.">
        {items.map((r, i) => <tr key={i}><td>{r.context}</td><td>{featureGroupOf(r.feature).label} / {r.feature}</td><td>{r.provider} / {r.model}</td><td>{r.keyLabel}</td><td>{r.provider === "subscription" ? SUBSCRIPTION_TEXT : r.basis}</td><td>{r.provider === "subscription" ? "No per-call charge" : r.costUsd === null ? "Unknown" : usd(r.costUsd)}{r.unpricedCalls > 0 && <span className="ai-sub ai-block">{r.unpricedCalls} calls with unknown cost</span>}</td><td>{r.calls}</td></tr>)}
      </Table>
    </details>)}
  </section>;
}

export const AI_USAGE_REPORTS = [
  { key: "features", label: "Features" },
  { key: "models", label: "Models" },
  { key: "keys", label: "API keys" },
  { key: "families", label: "Families" },
  { key: "records", label: "Records" },
] as const;
export type AiUsageReport = (typeof AI_USAGE_REPORTS)[number]["key"];

export function parseAiUsageReport(value: string | string[] | undefined): AiUsageReport {
  const selected = Array.isArray(value) ? value[0] : value;
  return AI_USAGE_REPORTS.find((r) => r.key === selected)?.key ?? "features";
}

const reportHref = (range: Period["range"], report: AiUsageReport, historicalExport?: string) =>
  `${ADMIN_AI_PATH}?${new URLSearchParams({ range, report, ...(historicalExport === undefined ? {} : { historicalExport }) })}`;

function WorkspaceBreakdown({ workspace, dimension }: { workspace: WorkspaceReading; dimension: "models" | "keys" }) {
  if (!workspace.usage) return <Empty>Unica workspace usage is unavailable. The cost and request count are unknown.</Empty>;
  const rows = workspace.usage[dimension];
  const maximum = Math.max(0, ...rows.map((r) => r.costUsd));
  const list = (items: typeof rows) => <BarList label={dimension === "models" ? "Workspace models" : "Workspace keys"}
    max={maximum}
    bars={items.map((r) => ({ key: r.label, label: r.label, value: r.costUsd,
      text: <span title={workspaceUsd(r.costUsd)}>{usd(r.costUsd)}</span>, sub: `${r.requests.toLocaleString("en-CA")} requests` }))} />;
  return <>
    {list(rows.slice(0, 8))}
    {rows.length > 8 && <details className="ai-disclosure"><summary>Show all {rows.length} {dimension === "models" ? "models" : "API keys"}</summary>{list(rows.slice(8))}</details>}
    {dimension === "keys" && <p className="ai-note ai-after">Historical keys can serve several features. Key names do not establish feature or family costs.</p>}
  </>;
}

function Features({ view }: { view: UsageView }) {
  const groups = groupFeatures(view.byFeature);
  const maximum = Math.max(0, ...groups.map((g) => g.costUsd));
  return <>
    <SectionHead title="Recorded cost by feature" count={usd(view.totals.costUsd)} line="Partial app history. Select a feature for its retained records." />
    {groups.length === 0 ? <Empty>No feature calls are recorded in this period. Workspace charges can still exist.</Empty> :
      <div className="ai-features">
        {groups.map((g) => <details key={g.key} className="ai-feature">
          <summary>
            <span className="ai-feature-label">{g.label}</span>
            <span className="ai-feature-value">{usd(g.costUsd)}</span>
            <span className="ai-feature-calls">{calls(g.calls)}</span>
            <span className="ai-feature-track" aria-hidden="true"><i style={{ width: `${maximum > 0 ? 100 * g.costUsd / maximum : 0}%` }} /></span>
            <span className="ai-feature-open">View details</span>
          </summary>
          <div className="ai-feature-detail">
            <UsageDetails id={`ai-feature-detail-${g.key}`} rows={view.details?.filter((r) => featureGroupOf(r.feature).key === g.key) ?? null} more={view.detailsMore} />
            <p className="ai-note">Retained detail can cover less than this feature total. Older ledgers and subscription calls stay separate.</p>
          </div>
        </details>)}
      </div>}
  </>;
}

function Families({ view, period, rate }: { view: UsageView; period: Period; rate: number }) {
  const days = period.days.length;
  return <>
    <SectionHead title="Families by recorded app cost" count={`${view.families.length}${view.families.length === 200 ? "+" : ""}`}
      line="Partial app history, including testing. Unknown ownership stays unassigned." />
    <Table label="Families by AI cost" head={["Family", "Children", "AI cost", "Calls", "Top feature", "Plan per month", "Cost as % of plan"]} empty="No family AI records in this period.">
      {view.families.map((f) => {
        const share = costShare(f.costUsd, rate, f.revenueCents, days);
        return <tr key={f.parentId ?? "none"}>
          <td>{f.parentId ? <Link href={`/admin/parents/${f.parentId}`} prefetch={false}>{f.name || f.email || "Family"}</Link>
            : <><b>No family</b><span className="ai-sub ai-block">Records without a known family</span></>}</td>
          <td className="adm-num">{f.parentId ? f.children : "-"}</td>
          <td className="adm-num">{usd(f.costUsd)}<span className="ai-sub ai-block">{cad(f.costUsd, rate)} CAD</span></td>
          <td className="adm-num">{f.calls.toLocaleString("en-CA")}</td>
          <td>{f.topFeature ? featureGroupOf(f.topFeature).label : "-"}</td>
          <td className="adm-num">{f.revenueCents && f.revenueCents > 0 ? cadCents(f.revenueCents) : f.freeMonth ? "free month" : "-"}</td>
          <td className="adm-num">{share === null ? "-" : `${share.toLocaleString("en-CA")}%`}</td>
        </tr>;
      })}
    </Table>
    <details className="ai-disclosure"><summary>Family and child records</summary><UsageDetails rows={view.details ?? null} more={view.detailsMore} /></details>
    <details className="ai-disclosure"><summary>How plan comparisons are calculated</summary><p className="ai-note">Plan is the family&apos;s monthly price in CAD. The share compares the AI cost with that price for the same {days} days, at {rate.toFixed(2)} CAD per USD.</p></details>
  </>;
}

function ProviderRecords({ receipts, period }: { receipts: ProviderReceiptView | null; period: Period }) {
  return (
    <details className="ai-disclosure"><summary>Provider receipts</summary>
      <p className="ai-note">{receipts ? `${receipts.totals.receipts.toLocaleString("en-CA")} generations received in this period.` : "Provider receipts are unavailable. The cost is unknown."} A connection test does not establish genuine delivery.</p>
      <details className="ai-disclosure"><summary>Technical details</summary>
        <AdminProviderReceipts view={receipts} periodLabel={`${period.days[0]} to ${period.days.at(-1)}, Vancouver days`} />
      </details>
    </details>
  );
}

function Records({ view, receipts, period }: { view: UsageView; receipts: ProviderReceiptView | null; period: Period }) {
  const t = view.totals;
  return <>
    <SectionHead title="Recorded calls" line="Retained app records, including testing. These are not the full workspace history." />
    <Tiles label="Recorded call totals" tiles={[
      { key: "calls", label: "Recorded AI calls", value: t.calls.toLocaleString("en-CA") },
      { key: "subscription", label: "Subscription calls", value: t.subscriptionCalls.toLocaleString("en-CA"), sub: SUBSCRIPTION_TEXT },
      { key: "unpriced", label: "Calls with unknown cost", value: t.unpricedCalls.toLocaleString("en-CA") },
    ]} />
    <details className="ai-disclosure"><summary>Work context and cost basis</summary>
      <div className="ai-pair">
        <section className="ap-card"><SectionHead title="Recorded work context" /><BarList label="Context" bars={(view.byContext ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} /></section>
        <section className="ap-card"><SectionHead title="Recorded cost basis" /><BarList label="Cost basis" bars={(view.byBasis ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} /></section>
      </div>
    </details>
    <ProviderRecords receipts={receipts} period={period} />
    <details className="ai-disclosure"><summary>Technical details</summary>
      <SectionHead title="Recorded cost by API key" line="Safe labels only. Historical key identities can be unknown." />
      <BarList label="Recorded keys" bars={(view.byKey ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} />
      <UsageDetails rows={view.details ?? null} more={view.detailsMore} />
    </details>
  </>;
}

export function AiUsagePage({ view, period, rate, workspace, error, report = "features", receipts = null, history = null, historySelection }: {
  view: UsageView | null; period: Period; rate: number; workspace: WorkspaceReading; error?: string | null;
  report?: AiUsageReport; receipts?: ProviderReceiptView | null; history?: HistoryView | null; historySelection?: string;
}) {
  const usage = workspace.usage;
  const pills = RANGES.map((r) => ({ key: r.key, href: reportHref(r.key, report, historySelection), label: r.label, current: r.key === period.range }));
  return <div className="adm-ai">
    <div className="ai-top">
      <Pills label="Period" pills={pills} />
      <span className="ai-period">{period.days[0]} to {period.days.at(-1)} · Vancouver days</span>
    </div>
    <div className="ai-headline">
      <Tiles label="AI cost totals" tiles={[
        { key: "spent", label: "Workspace spend (USD)", value: usage ? <span title={workspaceUsd(usage.costUsd)}>{usd(usage.costUsd)}</span> : "Unknown", sub: "Unica Learning only" },
        { key: "requests", label: "Workspace requests", value: usage ? usage.requests.toLocaleString("en-CA") : "Unknown", sub: "All workspace keys" },
        { key: "app", label: "Recorded app cost", value: view ? usd(view.totals.costUsd) : "Unknown", sub: "Partial history" },
      ]} />
    </div>
    {!usage && <p className="ai-note" role="status">Unica workspace usage is unavailable. The cost and request count are unknown.{workspace.status === "no-key" ? " No management key is configured." : " The provider reads failed or did not reconcile."}</p>}
    {!view && <Empty>{error ?? "AI usage could not be read."}</Empty>}
    <nav className="ai-reports" aria-label="Cost reports">
      {AI_USAGE_REPORTS.map((r) => <Link key={r.key} href={reportHref(period.range, r.key, historySelection)} prefetch={false}
        aria-current={report === r.key ? "page" : undefined} scroll={false}>{r.label}</Link>)}
    </nav>
    <section className="ai-report" aria-label={AI_USAGE_REPORTS.find((r) => r.key === report)!.label}>
      {report === "features" && view && <Features view={view} />}
      {report === "models" && <>
        <SectionHead title="Workspace cost by model" line="OpenRouter charges for the selected period." />
        <WorkspaceBreakdown workspace={workspace} dimension="models" />
        {view && <details className="ai-disclosure"><summary>Recorded app costs by model</summary>
          <BarList label="Recorded models" bars={view.byModel.filter((m) => m.calls > 0).map((m) => ({
            key: `${m.provider}:${m.model}`, label: m.model, value: m.costUsd,
            text: m.provider === "subscription" ? SUBSCRIPTION_TEXT : usd(m.costUsd), sub: calls(m.calls),
          }))} />
        </details>}
      </>}
      {report === "keys" && <>
        <SectionHead title="Workspace cost by API key" line="OpenRouter charges for the selected period." />
        <WorkspaceBreakdown workspace={workspace} dimension="keys" />
      </>}
      {report === "families" && view && <Families view={view} period={period} rate={rate} />}
      {report === "records" && (view ? <Records view={view} receipts={receipts} period={period} /> :
        <ProviderRecords receipts={receipts} period={period} />)}
      {report === "records" && <AdminAiCostHistory view={history} range={period.range} selected={historySelection} />}
    </section>
    {view && (report === "features" || report === "models") && <details className="ai-disclosure"><summary>Recorded app costs by day</summary>
      <SectionHead title="Recorded app cost by day" count={`${period.days.length} days`} line="USD, Vancouver days, stacked by model." />
      <DailyChart view={view} period={period} />
    </details>}
    <details className="ai-disclosure ai-sources"><summary>About these costs</summary>
      <p className="ai-note">Workspace charges are the Unica Learning total reported by OpenRouter. These totals do not assign costs to a feature or child.</p>
      <p className="ai-note">These recorded app data are incomplete. They are not provider totals. All families, including test and admin families, are included. Local receipts must be imported before they appear.</p>
      <p className="ai-note">Workspace totals, recorded app data and provider receipts can include the same calls. Do not add these subtotals.</p>
      {view && view.totals.historyUsd > 0 && <p className="ai-note">{usd(view.totals.historyUsd)} comes from older ledgers, before the AI usage ledger started on 12 Nov 2026. Marking and explanations from that time have no family. Historical estimates are included only in the recorded app subtotal.</p>}
      <p className="ai-note">Subscription calls have no per-call charge. Unknown prices and ownership stay unknown.</p>
      <div className="ai-source-links">
        <Link className="ai-out" href={CHILD_COST_PATH} prefetch={false}>Cost per child</Link>
        <a className="ai-out" href={workspaceActivityUrl(period)} target="_blank" rel="noreferrer">Open Unica workspace activity</a>
      </div>
    </details>
  </div>;
}
