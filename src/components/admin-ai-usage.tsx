// The admin page of AI usage and cost (D-330): a glance at where the AI cost comes from. Server rendered, no JavaScript:
// the period pills are links, the daily chart is one SVG with <title> tips, and a table view sits under it. The deep dive
// is OpenRouter's own activity page.
import Link from "next/link";
import { Table } from "@/components/admin";
import { BarList, Empty, Pills, SectionHead, Tiles, type Bar } from "@/components/admin-blocks";
import {
  ADMIN_AI_PATH, RANGES, buildStack, cad, cadCents, costShare, featureGroupOf, groupFeatures, niceTop, usd,
  type OpenRouterBilling, type Period, type Stack, type UsageView, type UsageDetail,
} from "@/lib/admin-ai-usage";
import { CHILD_COST_PATH } from "@/lib/child-unit-cost";
import { formatCalendarDate } from "@/lib/family-time";
import "./admin-ai-usage.css";
import "./admin-pages.css";

export const OPENROUTER_ACTIVITY_URL = "https://openrouter.ai/activity";

const calls = (n: number) => `${n.toLocaleString("en-CA")} ${n === 1 ? "call" : "calls"}`;
const dayShort = (day: string) => formatCalendarDate(day, { month: "short", day: "numeric" });
const SUBSCRIPTION_TEXT = "subscription, no per-call charge";
/** The most models in the ranked list; the rest fold into one line. */
const MODEL_LIST_MAX = 8;
/** A model's name without its settings ("codex/gpt-6.1-sol;reasoning=high" shows as "codex/gpt-6.1-sol"). */
const modelName = (m: string) => m.split(";")[0];

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

const maybeUsd = (v: number | null) => v === null ? "Unavailable" : usd(v);

function Billing({ billing, view }: { billing: OpenRouterBilling; view: UsageView | null }) {
  const a = billing.account;
  const m = billing.month;
  const covered = view?.lifetimeReceipts == null ? null : view.lifetimeReceipts.filter((r) => r.keyId === a.keyId).reduce((s, r) => s + r.costUsd, 0);
  const remainder = covered !== null && a.spentUsd !== null && covered <= a.spentUsd ? a.spentUsd - covered : null;
  return <>
    <section className="ap-card" aria-labelledby="ai-account">
      <SectionHead id="ai-account" title="OpenRouter account" line="Lifetime account totals. All keys and all work billed to this one account, including testing. These amounts overlap the key and app records below. Do not add them." />
      <Tiles label="Account billing" tiles={[
        { key: "spent", label: "Account lifetime spent", value: maybeUsd(a.spentUsd) },
        { key: "credits", label: "Total credits", value: maybeUsd(a.creditsUsd) },
        { key: "balance", label: "Credit balance", value: maybeUsd(a.balanceUsd) },
      ]} />
      <p className="ai-note">Checked at {billing.checkedAt} (UTC). Account selected by {a.source === "billing" ? "the dedicated billing key" : a.source === "main" ? "the main server key" : "no key"}. Other accounts and providers are not included.</p>
      {a.status !== "ok" && <p className="ai-check-none">{a.status === "no-key" ? "No account billing key is configured." : a.status === "partial" ? "The account response is partial. Missing fields remain unavailable." : "Account billing is unavailable. The request failed or returned no valid totals."}</p>}
      <dl className="ai-check">
        <div><dt>Identified account receipts, lifetime</dt><dd>{maybeUsd(covered)}</dd></div>
        <div><dt>Unreconciled / unassigned account spend</dt><dd>{maybeUsd(remainder)}</dd></div>
      </dl>
      <p className="ai-note">Coverage uses provider receipts with the exact billing key identity only, across all dates and all families. Receipts for other keys have no verified account link. The remainder includes testing, other keys and work with no detailed records. It has no assigned feature, model, family or child. It is not proof of lost records. The provider and app are separate snapshots.</p>
    </section>
    <section className="ap-card" aria-labelledby="ai-keys">
      <SectionHead id="ai-keys" title="Configured API keys: this month" line={`OpenRouter calendar month in UTC, from ${billing.checkedAt.slice(0, 7)}-01 through the check time. All work on each configured server key. Independent of the app date range and family filter.`} />
      {typeof m !== "object" || m === null ? <p className="ai-check-none">{m === "no-key" ? "No server usage keys are configured." : "Key usage is unavailable."}</p> : <>
        <p>{m.answered < m.asked ? "Partial key subtotal" : "Configured key subtotal"}: <b>{usd(m.monthUsd)}</b>. {m.answered} of {m.asked} keys answered.</p>
        <Table label="Key month usage" head={["API key label / identity", "Month usage (USD)"]} empty="No key readings.">
          {(m.keys ?? []).map((k) => <tr key={k.label}><td>{k.label}</td><td>{maybeUsd(k.monthUsd)}</td></tr>)}
        </Table>
      </>}
      <p className="ai-note">Each distinct key counts once. Account totals already include these charges. Keys may belong to different accounts. App records also contain other providers, historical cost and estimates, with different date and family scopes. No difference is treated as proven missing usage.</p>
    </section>
  </>;
}

export function UsageDetails({ rows, more = false }: { rows: readonly UsageDetail[] | null; more?: boolean }) {
  if (rows === null) return <Empty>Detailed records are unavailable. Apply the reporting migration before using these breakdowns.</Empty>;
  const children = new Map<string, UsageDetail[]>();
  for (const row of rows) {
    const key = `${row.parentId ?? ""}:${row.childId ?? ""}`;
    children.set(key, [...children.get(key) ?? [], row]);
  }
  return <section className="ap-card" aria-labelledby="ai-details">
    <SectionHead id="ai-details" title="Recorded detail by family and child" line="USD. Expand a child to see context, feature, model and API key. An unknown child stays unassigned. Subscription calls have no per-call charge. Estimates and unknown prices stay separate." />
    {more && <p className="ai-note">Only the first 5,000 grouped detail rows are shown. The overall summary includes all records.</p>}
    {!rows.length && <Empty>No detailed records in this scope. This does not mean no account spend.</Empty>}
    {[...children.entries()].map(([key, items]) => <details key={key} className="ai-table">
      <summary>{items[0].parentName} / {items[0].childName} ({items.reduce((s, r) => s + r.calls, 0)} recorded calls)</summary>
      <Table label={`${items[0].childName} usage`} head={["Context", "Feature", "Provider / model", "API key", "Cost basis", "Known cost", "Calls"]} empty="No records.">
        {items.map((r, i) => <tr key={i}><td>{r.context}</td><td>{featureGroupOf(r.feature).label} / {r.feature}</td><td>{r.provider} / {r.model}</td><td>{r.keyLabel}</td><td>{r.provider === "subscription" ? SUBSCRIPTION_TEXT : r.basis}</td><td>{r.provider === "subscription" ? "No per-call charge" : r.costUsd === null ? "Unknown" : usd(r.costUsd)}{r.unpricedCalls > 0 && <span className="ai-sub ai-block">{r.unpricedCalls} calls with unknown cost</span>}</td><td>{r.calls}</td></tr>)}
      </Table>
    </details>)}
  </section>;
}

export function AiUsagePage({ billing, ...props }: {
  view: UsageView | null; period: Period; rate: number; billing: OpenRouterBilling; error?: string | null;
}) {
  return <div className="adm-ai"><Billing billing={billing} view={props.view} /><RecordedUsagePage {...props} /></div>;
}

function RecordedUsagePage({ view, period, rate, error }: {
  view: UsageView | null; period: Period; rate: number; error?: string | null;
}) {
  const pills = RANGES.map((r) => ({ key: r.key, href: r.key === "30d" ? ADMIN_AI_PATH : `${ADMIN_AI_PATH}?range=${r.key}`, label: r.label, current: r.key === period.range }));
  if (!view) return (
    <>
      <Pills label="Period" pills={pills} />
      <Empty>{error ?? "AI usage could not be read."}</Empty>
    </>
  );
  const t = view.totals;
  const groups = groupFeatures(view.byFeature);
  const featureBars: Bar[] = groups.map((g) => ({ key: g.key, label: g.label, value: g.costUsd, text: <>{usd(g.costUsd)} <span className="ai-sub">{calls(g.calls)}</span></> }));
  const usedModels = view.byModel.filter((m) => m.calls > 0);
  const lineOf = (m: (typeof usedModels)[number]): Bar => ({
    key: m.model, label: <span title={m.model}>{modelName(m.model)}</span>, value: m.costUsd,
    text: m.provider === "subscription" ? <>{SUBSCRIPTION_TEXT} <span className="ai-sub">{calls(m.calls)}</span></> : <>{usd(m.costUsd)} <span className="ai-sub">{calls(m.calls)}</span></>,
  });
  const rest = usedModels.slice(MODEL_LIST_MAX);
  const modelBars: Bar[] = [
    ...usedModels.slice(0, MODEL_LIST_MAX).map(lineOf),
    ...(rest.length ? [{ key: "rest", label: `${rest.length} more models`, value: rest.reduce((s, m) => s + m.costUsd, 0),
      text: <>{usd(rest.reduce((s, m) => s + m.costUsd, 0))} <span className="ai-sub">{calls(rest.reduce((s, m) => s + m.calls, 0))}</span></> }] : []),
  ];
  const days = period.days.length;
  return (
    <div className="adm-ai">
      <div className="ai-top">
        <Pills label="Period" pills={pills} />
        <span>
          <Link className="ai-out" href={CHILD_COST_PATH} prefetch={false}>Cost per child</Link>
          {" · "}
          <a className="ai-out" href={OPENROUTER_ACTIVITY_URL} target="_blank" rel="noreferrer">Open OpenRouter activity</a>
        </span>
      </div>
      <Tiles label="Totals" tiles={[
        { key: "cost", label: "Recorded app cost", value: usd(t.costUsd), sub: `${cad(t.costUsd, rate)} CAD at ${rate.toFixed(2)}` },
        { key: "calls", label: "Recorded AI calls", value: t.calls.toLocaleString("en-CA"), sub: t.unpricedCalls > 0 ? `${t.unpricedCalls.toLocaleString("en-CA")} with no cost reported` : "costs known for these recorded calls only" },
        { key: "sub", label: "Subscription calls", value: t.subscriptionCalls.toLocaleString("en-CA"), sub: SUBSCRIPTION_TEXT },
      ]} />
      {t.historyUsd > 0 && (
        <p className="ai-note">{usd(t.historyUsd)} of this comes from older ledgers, from before the AI usage ledger started on 12 Nov 2026. Marking and explanations from that time have no family, so they show on the &ldquo;no family&rdquo; line.</p>
      )}

      <p className="ai-note">Recorded app scope: {period.days[0]} to {period.days.at(-1)}, Vancouver days. All families, including test and admin families. The global Show test families switch does not change this page. These records are incomplete. Local receipts must be imported before they appear. Historical estimates are included only in the recorded app subtotal.</p>
      <div className="ai-pair">
        <section className="ap-card"><SectionHead title="Recorded work context" /><BarList label="Context" bars={(view.byContext ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} /></section>
        <section className="ap-card"><SectionHead title="Recorded cost basis" /><BarList label="Cost basis" bars={(view.byBasis ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} /></section>
      </div>
      <section className="ap-card"><SectionHead title="Recorded cost by API key" line="Safe labels and one-way identities only. Historical key identities remain unknown." /><BarList label="Recorded keys" bars={(view.byKey ?? []).map((r) => ({ key: r.label, label: r.label, value: r.costUsd, text: `${usd(r.costUsd)} / ${calls(r.calls)}` }))} /></section>
      <UsageDetails rows={view.details ?? null} more={view.detailsMore} />

      <section className="ap-card" aria-labelledby="ai-daily">
        <SectionHead id="ai-daily" title="Cost by day" count={`${days} days`} line="USD, Vancouver days, stacked by model." />
        <DailyChart view={view} period={period} />
      </section>

      <div className="ai-pair">
        <section className="ap-card" aria-labelledby="ai-feature">
          <SectionHead id="ai-feature" title="Cost by feature" />
          {featureBars.length ? <BarList label="Cost by feature" bars={featureBars} /> : <Empty>No AI calls in this period.</Empty>}
        </section>
        <section className="ap-card" aria-labelledby="ai-model">
          <SectionHead id="ai-model" title="Cost by model" />
          {modelBars.length ? <BarList label="Cost by model" bars={modelBars} /> : <Empty>No AI calls in this period.</Empty>}
        </section>
      </div>

      <section aria-labelledby="ai-families">
        <SectionHead id="ai-families" title="Families by AI cost" count={`${view.families.length}${view.families.length === 200 ? "+" : ""}`}
          line={`Plan is the family's monthly price in CAD; the share compares the AI cost with that price for the same ${days} days.`} />
        <Table label="Families by AI cost" head={["Family", "Children", "AI cost", "Calls", "Top feature", "Plan per month", "Cost as % of plan"]} empty="No family used AI in this period.">
          {view.families.map((f) => {
            const share = costShare(f.costUsd, rate, f.revenueCents, days);
            return (
              <tr key={f.parentId ?? "none"}>
                <td>{f.parentId
                  ? <Link href={`/admin/parents/${f.parentId}`} prefetch={false}>{f.name || f.email || "Family"}</Link>
                  : <><b>No family</b><span className="ai-sub ai-block">team tools, tests, sample runs and history without a family</span></>}</td>
                <td className="adm-num">{f.parentId ? f.children : "-"}</td>
                <td className="adm-num">{usd(f.costUsd)}<span className="ai-sub ai-block">{cad(f.costUsd, rate)} CAD</span></td>
                <td className="adm-num">{f.calls.toLocaleString("en-CA")}</td>
                <td>{f.topFeature ? featureGroupOf(f.topFeature).label : "-"}</td>
                <td className="adm-num">{f.revenueCents && f.revenueCents > 0 ? cadCents(f.revenueCents) : f.freeMonth ? "free month" : "-"}</td>
                <td className="adm-num">{share === null ? "-" : `${share.toLocaleString("en-CA")}%`}</td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}
