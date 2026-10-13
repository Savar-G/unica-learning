// PROTOTYPE ONLY. Small server-rendered SVG charts: no chart library and no JavaScript. Hover shows <title> tips.
import { dayLabel } from "./data";

export function Spark({ values, tone = "ink" }: { values: number[]; tone?: "ink" | "leaf" | "sky" }) {
  const w = 96, h = 26, top = Math.max(1, ...values);
  if (values.length < 2) return null;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - (v / top) * (h - 4)}`).join(" ");
  return (
    <svg className={`pa-spark is-${tone}`} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <polyline points={`0,${h} ${pts} ${w},${h}`} className="pa-spark-fill" />
      <polyline points={pts} className="pa-spark-line" />
    </svg>
  );
}

export type SeriesKey = "accounts" | "started" | "finished" | "cards" | "emails";
export const SERIES_TEXT: Record<SeriesKey, string> = { accounts: "New accounts", started: "Tests started", finished: "Tests finished", cards: "Cards saved", emails: "Emails sent" };

/** Grouped daily bars. One group per day; each key a bar. */
export function DailyBars({ series, keys, height = 180, width = 720 }: { series: ({ day: string } & Record<SeriesKey, number>)[]; keys: SeriesKey[]; height?: number; width?: number }) {
  const w = width, h = height, padL = 26, padB = 22, padT = 8;
  const top = Math.max(2, ...series.flatMap((d) => keys.map((k) => d[k])));
  const ticks = [0, Math.ceil(top / 2), top];
  const gw = (w - padL) / Math.max(1, series.length);
  const bw = Math.max(2, Math.min(14, (gw - 4) / keys.length));
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / top);
  const every = Math.ceil(series.length / Math.max(2, Math.floor(w / 70)));
  return (
    <figure className="pa-chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Daily ${keys.map((k) => SERIES_TEXT[k]).join(", ")}`}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={w} y1={y(t)} y2={y(t)} className="pa-grid" /><text x={padL - 6} y={y(t) + 4} className="pa-axis" textAnchor="end">{t}</text></g>)}
        {series.map((d, i) => {
          const x0 = padL + i * gw + (gw - bw * keys.length) / 2;
          return (
            <g key={d.day}>
              {keys.map((k, j) => d[k] > 0 && (
                <rect key={k} x={x0 + j * bw} y={y(d[k])} width={bw - 1} height={y(0) - y(d[k])} rx={1.5} className={`pa-bar is-${k}`}>
                  <title>{`${dayLabel(d.day)}: ${d[k]} ${SERIES_TEXT[k].toLowerCase()}`}</title>
                </rect>
              ))}
              {i % every === 0 && <text x={padL + i * gw + gw / 2} y={h - 6} className="pa-axis" textAnchor="middle">{dayLabel(d.day)}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="pa-legend">{keys.map((k) => <span key={k}><i className={`is-${k}`} />{SERIES_TEXT[k]}</span>)}</figcaption>
    </figure>
  );
}

/** Horizontal funnel: each stage's bar is its share of the first stage, with the step's conversion. */
export function Funnel({ steps }: { steps: { label: string; value: number; href?: string }[] }) {
  const first = Math.max(1, steps[0]?.value ?? 1);
  return (
    <ol className="pa-funnel">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const conv = prev ? Math.round((s.value / prev) * 100) : null;
        return (
          <li key={s.label}>
            <span className="pa-funnel-label">{s.href ? <a href={s.href}>{s.label}</a> : s.label}</span>
            <span className="pa-funnel-track"><span className="pa-funnel-bar" style={{ width: `${Math.max(1.5, (s.value / first) * 100)}%` }} /></span>
            <b className="pa-funnel-n">{s.value}</b>
            <span className="pa-funnel-conv">{conv === null ? "" : prev === 0 ? "-" : `${conv}%`}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A grid of rows by days; each cell's shade is its count. */
export function Heat({ rows, days }: { rows: { label: string; counts: number[] }[]; days: string[] }) {
  const top = Math.max(1, ...rows.flatMap((r) => r.counts));
  return (
    <div className="pa-heat" style={{ gridTemplateColumns: `9.5em repeat(${days.length}, minmax(10px, 1fr))` }}>
      {rows.map((r) => (
        <div key={r.label} className="pa-heat-row">
          <span className="pa-heat-label">{r.label}</span>
          {r.counts.map((c, i) => <span key={days[i]} className="pa-heat-cell" style={{ opacity: c === 0 ? 1 : 0.25 + 0.75 * (c / top) }} data-on={c > 0 || undefined} title={`${dayLabel(days[i])}: ${c}`} />)}
        </div>
      ))}
      <div className="pa-heat-row">
        <span />
        {days.map((d, i) => <span key={d} className="pa-axis pa-heat-day">{i % Math.ceil(days.length / 6) === 0 ? dayLabel(d) : ""}</span>)}
      </div>
    </div>
  );
}

/** Six dots: how far a family got. */
export function Steps({ reached, total = 6, waitlist = false }: { reached: number; total?: number; waitlist?: boolean }) {
  return (
    <span className="pa-steps" aria-label={`Step ${reached} of ${total}${waitlist ? ", waitlist" : ""}`}>
      {Array.from({ length: total }, (_, i) => <i key={i} data-on={i < reached || undefined} data-wait={(waitlist && i === reached - 1) || undefined} />)}
    </span>
  );
}
