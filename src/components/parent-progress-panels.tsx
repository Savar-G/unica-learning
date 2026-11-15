"use client";

import { useState } from "react";
import type { ProgressNumbers } from "@/lib/parent-view";
import type { ChartPoint, Period } from "@/lib/progress-series";
import type { TopicBarView, TopicWord } from "@/lib/skill-map-view";

// The Progress tab (#1004, Option A v9): Week · Month · All time, four tiles, the "Skills mastered over time" line and
// the math topics. The line has one point per week on Week and one per month on Month and All time, never one per day
// (src/lib/progress-series.ts says why). No "starting test vs this month" chart, and no counts beside the topics.

const PERIODS: { key: Period; label: string }[] = [{ key: "week", label: "Week" }, { key: "month", label: "Month" }, { key: "all", label: "All time" }];

/** The line, drawn in a box of `width` by `height`; the page draws a small one and a wide one and shows the one that fits. */
function Chart({ points, width, height, className }: { points: ChartPoint[]; width: number; height: number; className: string }) {
  const L = 28, R = 24, T = 14, B = 30;
  const max = Math.max(4, ...points.map((p) => p.value));
  const x = (i: number) => L + (i * (width - L - R)) / Math.max(1, points.length - 1);
  const y = (v: number) => T + (height - T - B) * (1 - v / max);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join("");
  const last = points.length - 1;
  // Label every point of a short line; on a long one every few, and always the first and the last.
  const step = Math.ceil(points.length / (width > 500 ? 12 : 6));
  const labelled = (i: number) => i === last || (i % step === 0 && last - i >= step / 2) || i === 0;
  return (
    <svg className={className} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {[0, max].map((t) => (
        <g key={t}>
          <line x1={L} x2={width - R} y1={y(t)} y2={y(t)} stroke="#efeee9" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      {points.length > 1 && <path d={`${path}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill="#e7f6ee" />}
      <path d={path} fill="none" stroke="#16a06a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={i === last ? 5 : 3} fill={i === last ? "#16a06a" : "#fff"} stroke="#16a06a" strokeWidth="2" />)}
      {points.map((p, i) => labelled(i) && <text key={`l${i}`} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}>{p.label}</text>)}
    </svg>
  );
}

const WORD_TONE: Record<TopicWord, "g" | "s" | "a"> = { Strong: "g", "Getting there": "s", "Needs help": "a" };

function Topic({ topic }: { topic: TopicBarView }) {
  const tone = WORD_TONE[topic.word];
  return (
    <li>
      <div className="pp-topic-row"><b>{topic.name}</b><span className={`is-${tone}`}>{topic.word}</span></div>
      {/* The bar is the share of the topic's skills mastered; a topic with none shows a small stub, so it reads as a bar. */}
      <div className="pp-track" aria-hidden="true"><i className={`is-${tone}`} style={{ width: `${Math.max(8, Math.round(topic.share * 100))}%` }} /></div>
    </li>
  );
}

export function ProgressPanels({ name, progress }: { name: string; progress: ProgressNumbers }) {
  const [period, setPeriod] = useState<Period>("week");
  const { summary, weekDaysDone, bookDaysDone, workbookNumber, startedOn, monthName, topics } = progress;
  const p = summary[period];
  const span = period === "week" ? "this week" : period === "month" ? "this month" : `since ${startedOn ?? `${name} started`}`;
  const heading = period === "week" ? "This week" : period === "month" ? monthName : `Since ${name} started`;
  const tiles: { key: string; label: string; value: string; arrow: boolean; sub: string; hot?: boolean }[] = [
    { key: "mastered", label: "Skills mastered", value: String(summary.mastered), arrow: p.gain > 0, sub: p.gain > 0 ? `+${p.gain} ${span}` : `none new ${span}`, hot: true },
    { key: "up", label: "Moved up", value: String(p.movedUp), arrow: p.movedUp > 0, sub: "skills went up a level" },
    { key: "help", label: "Needs help", value: String(summary.needsHelp), arrow: false, sub: "practised again next" },
    period === "week"
      ? { key: "days", label: "Days done", value: `${weekDaysDone ?? 0} of 5`, arrow: false, sub: "this week" }
      : { key: "days", label: "Days done", value: String(bookDaysDone ?? 0), arrow: false, sub: workbookNumber === null ? "in the workbook" : `in Workbook ${workbookNumber}` },
  ];
  const unit = period === "week" ? "per week" : "per month";
  const alt = `Skills mastered over time, ${unit}: ${p.points.map((pt) => `${pt.label} ${pt.value}`).join(", ")}`;
  return (
    <>
      <div className="pp-seg" role="group" aria-label="Time period">
        {PERIODS.map(({ key, label }) => <button key={key} type="button" aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}
      </div>
      <div className="pa-sh"><h2>{heading}</h2></div>
      <div className="pp-tiles">
        {tiles.map((t) => (
          <div key={t.key} className={`pp-tile${t.hot ? " is-hot" : ""}`}>
            <span className="pp-k">{t.label}</span>
            <span className="pp-v">{t.value}{t.arrow && <i aria-hidden="true">↑</i>}</span>
            <span className="pp-s">{t.sub}</span>
          </div>
        ))}
      </div>
      <div className="pa-sh"><h2>Skills mastered over time</h2><span>{unit}</span></div>
      <div className="pa-card pp-chart" role="img" aria-label={alt}>
        <Chart points={p.points} width={320} height={146} className="pp-chart-s" />
        <Chart points={p.points} width={900} height={190} className="pp-chart-w" />
      </div>
      {topics.length > 0 && (
        <>
          <div className="pa-sh"><h2>Math topics</h2><span>{name}&apos;s level in each</span></div>
          <div className="pa-card"><ul className="pp-topics">{topics.map((t) => <Topic key={t.name} topic={t} />)}</ul></div>
        </>
      )}
    </>
  );
}
