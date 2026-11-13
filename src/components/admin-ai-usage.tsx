// The admin page of AI usage and cost (D-330): a glance at where the AI cost comes from. Server rendered, no JavaScript:
// the period pills are links, the daily chart is one SVG with <title> tips, and a table view sits under it. The deep dive
// is OpenRouter's own activity page.
import Link from "next/link";
import { Table } from "@/components/admin";
import { BarList, Empty, Pills, SectionHead, Tiles, type Bar } from "@/components/admin-blocks";
import {
  ADMIN_AI_PATH, RANGES, buildStack, cad, cadCents, checkLine, costShare, featureGroupOf, groupFeatures, niceTop, usd,
  type OpenRouterCheck, type Period, type Stack, type UsageView,
} from "@/lib/admin-ai-usage";
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

function Check({ check, recordedUsd, rate }: { check: OpenRouterCheck | "no-key" | null; recordedUsd: number | null; rate: number }) {
  if (check === "no-key") return <p className="ai-check-none">No OpenRouter key is set on this server, so there is nothing to check against.</p>;
  if (check === null) return <p className="ai-check-none">OpenRouter did not answer.</p>;
  if (recordedUsd === null) return <p className="ai-check-none">The recorded cost for this month could not be read.</p>;
  const c = checkLine(check, recordedUsd);
  return (
    <>
      <dl className="ai-check">
        <div><dt>OpenRouter says</dt><dd>{usd(c.openRouterUsd)}</dd></div>
        <div><dt>We recorded</dt><dd>{usd(c.recordedUsd)}</dd></div>
        <div className={c.notRecordedUsd > 0.005 ? "is-gap" : undefined}><dt>Not recorded</dt><dd>{usd(Math.max(0, c.notRecordedUsd))}</dd></div>
      </dl>
      <p className="ai-note">
        This month, all families, test families included. OpenRouter says {cad(c.openRouterUsd, rate)} CAD at {rate.toFixed(2)}.
        {check.answered < check.asked && <> Only {check.answered} of {check.asked} keys answered, so OpenRouter&apos;s number is partial.</>}
        {c.notRecordedUsd < -0.005 && <> We recorded more than OpenRouter says: history from older ledgers is in our number, and OpenRouter counts the calendar month in UTC.</>}
      </p>
    </>
  );
}

export function AiUsagePage({ view, period, rate, check, monthRecordedUsd, error }: {
  view: UsageView | null; period: Period; rate: number; check: OpenRouterCheck | "no-key" | null; monthRecordedUsd: number | null; error?: string | null;
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
        <a className="ai-out" href={OPENROUTER_ACTIVITY_URL} target="_blank" rel="noreferrer">Open OpenRouter activity</a>
      </div>
      <Tiles label="Totals" tiles={[
        { key: "cost", label: "Total cost", value: usd(t.costUsd), sub: `${cad(t.costUsd, rate)} CAD at ${rate.toFixed(2)}` },
        { key: "calls", label: "AI calls", value: t.calls.toLocaleString("en-CA"), sub: t.unpricedCalls > 0 ? `${t.unpricedCalls.toLocaleString("en-CA")} with no cost reported` : "every paid call has a cost" },
        { key: "sub", label: "Subscription calls", value: t.subscriptionCalls.toLocaleString("en-CA"), sub: SUBSCRIPTION_TEXT },
      ]} />
      {t.historyUsd > 0 && (
        <p className="ai-note">{usd(t.historyUsd)} of this comes from older ledgers, from before the AI usage ledger started on 12 Nov 2026. Marking and explanations from that time have no family, so they show on the &ldquo;no family&rdquo; line.</p>
      )}

      <section className="ap-card" aria-labelledby="ai-month">
        <SectionHead id="ai-month" title="OpenRouter against our ledger" line="A check, not a report: the difference is cost the ledger did not record." />
        <Check check={check} recordedUsd={monthRecordedUsd} rate={rate} />
      </section>

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
