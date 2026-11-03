"use client";

// PROTOTYPE ONLY (site/compare-section-prototype): "How we compare" as its own home section after Pricing.
// Four layouts of the same facts (src/lib/compare.ts), switchable with ?variant=A|B|C|D and the floating bar.
// Question: what layout makes tutor vs learning centre vs Unica (price first, then the four traits) clearest?
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { COST, OPTIONS, ROWS, type OptionId, type RowId } from "@/lib/compare";
import { BRAND, PLANS, cad } from "@/lib/site";
import { MarkIcon } from "./compare";
import { PrototypeSwitcher } from "./prototype-switcher";
import "./compare-prototype.css";

const COLS: OptionId[] = ["tutor", "centre", "us"];
const ROW_IDS: RowId[] = ["personal", "help", "plan", "gaps"];
const rows = ROWS.filter((r) => ROW_IDS.includes(r.id)).sort((a, b) => ROW_IDS.indexOf(a.id) - ROW_IDS.indexOf(b.id));
const name = (id: OptionId) => OPTIONS.find((o) => o.id === id)!.name;
const PRICE: Record<OptionId, [string, string]> = {
  ...COST,
  tutor: ["$170-430", COST.tutor[1]],
  us: [`CAD ${cad(PLANS.one.price)}`, "a month, first month free"],
};

// Round 2 (Savar picked A): colour treatments of our column. Round 1 layouts B-D stay reachable by URL.
const TONES: { key: string; name: string; tone: Tone }[] = [
  { key: "A1", name: "Peach + tangerine", tone: "peach" },
  { key: "A2", name: "Soft grey card + ink", tone: "grey" },
  { key: "A3", name: "Grainy colour field", tone: "field" },
  { key: "A4", name: "Warm dark + sunflower", tone: "dark" },
  { key: "A5", name: "Ink outline + leaf", tone: "outline" },
];

export function CompareFull() {
  return <Link className="cp-full" href="/compare">See the full comparison <span aria-hidden="true">→</span></Link>;
}

/** A: the reference. Price row first, plain text for the others, checks only in our column.
 *  `tone` is the round-2 question: how our column and its checks are coloured. */
export type Tone = "peach" | "grey" | "field" | "dark" | "outline";
export function VariantA({ tone = "peach" }: { tone?: Tone }) {
  const at = (r: number, c: number) => ({ "--r": r, "--c": c }) as React.CSSProperties;
  return (
    <div className="cpA" data-tone={tone} role="table" aria-label="How we compare">
      <span className="cpA-bg" aria-hidden="true" />
      <div className="cpA-row cpA-head" role="row">
        <span role="columnheader" style={at(1, 1)} />
        {COLS.map((id, c) => <span role="columnheader" key={id} style={at(1, c + 2)} className={id === "us" ? "us" : ""}>{name(id)}</span>)}
      </div>
      <div className="cpA-row cpA-price" role="row">
        <span role="rowheader" style={at(2, 1)}>Price a month</span>
        {COLS.map((id, c) => (
          <span role="cell" key={id} style={at(2, c + 2)} className={id === "us" ? "us" : ""}><b>{PRICE[id][0]}</b><small>{PRICE[id][1]}</small></span>
        ))}
      </div>
      {rows.map((r, n) => (
        <div className={`cpA-row${n === rows.length - 1 ? " last" : ""}`} role="row" key={r.id}>
          <span role="rowheader" style={at(n + 3, 1)}>{r.label}</span>
          {COLS.map((id, c) => (
            <span role="cell" key={id} style={at(n + 3, c + 2)} className={id === "us" ? "us" : ""}>
              {id === "us" && <i className="cp-check" aria-hidden="true" />}
              {r.cells[id][1]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** B: the price is the picture. A shared $0-$450 scale, then a compact check grid below it. */
export function VariantB() {
  const max = 450;
  const pct = (n: number) => `${(n / max) * 100}%`;
  const bars: { id: OptionId; from: number; to: number }[] = [
    { id: "tutor", from: 170, to: 430 },
    { id: "centre", from: 170, to: 220 },
    { id: "us", from: PLANS.one.price, to: PLANS.one.price },
  ];
  return (
    <div className="cpB">
      <div className="cpB-scale" aria-label="Price a month, on one scale">
        {bars.map((b) => (
          <div className={`cpB-line ${b.id}`} key={b.id}>
            <span className="cpB-name">{name(b.id)}</span>
            <span className="cpB-track">
              <span className="cpB-bar" style={{ left: pct(b.from), width: b.to > b.from ? `calc(${pct(b.to - b.from)})` : undefined }} />
              <span className="cpB-tag" style={{ left: pct(b.to) }}><b>{PRICE[b.id][0]}</b> {PRICE[b.id][1]}</span>
            </span>
          </div>
        ))}
        <div className="cpB-ticks" aria-hidden="true">
          {[0, 100, 200, 300, 400].map((t) => <span key={t} style={{ left: pct(t) }}>${t}</span>)}
        </div>
      </div>
      <div className="cpB-grid" role="table" aria-label="What you get">
        <div className="cpB-r cpB-h" role="row">
          <span role="columnheader" />
          {COLS.map((id) => <span role="columnheader" key={id} className={id === "us" ? "us" : ""}>{name(id)}</span>)}
        </div>
        {rows.map((r) => (
          <div className="cpB-r" role="row" key={r.id}>
            <span role="rowheader">{r.label}</span>
            {COLS.map((id) => (
              <span role="cell" key={id} className={id === "us" ? "us" : ""}><MarkIcon m={r.cells[id][0]} />{r.cells[id][1]}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** C: one card per option, ours dark and raised. Each card reads top to bottom on its own. */
export function VariantC() {
  return (
    <div className="cpC">
      {COLS.map((id) => (
        <article className={`cpC-card ${id === "us" ? "us" : ""}`} key={id}>
          {id === "us" && <span className="cpC-pick">Personal, on paper</span>}
          <h3>{name(id)}</h3>
          <p className="cpC-price"><b>{PRICE[id][0]}</b><small>{PRICE[id][1]}</small></p>
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <span className="cpC-label">{r.label}</span>
                <span className="cpC-val"><MarkIcon m={r.cells[id][0]} />{r.cells[id][1]}</span>
              </li>
            ))}
          </ul>
          {id === "us" && <Link className="cpC-cta" href="/start?src=compare">Start the free assessment <span aria-hidden="true">→</span></Link>}
        </article>
      ))}
    </div>
  );
}

/** D: pick one option, see it beside Unica. The price gap is the headline of the pair. */
export function VariantD() {
  const [them, setThem] = useState<"tutor" | "centre">("centre");
  const gap = them === "tutor"
    ? `About $${Math.round(170 - PLANS.one.price)}-$${Math.round(430 - PLANS.one.price)} less a month`
    : `About $${Math.round(200 - PLANS.one.price)} less a month`;
  return (
    <div className="cpD">
      <div className="cpD-switch" role="group" aria-label={`Compare ${BRAND} with`}>
        <span>Compare {BRAND} with</span>
        {(["tutor", "centre"] as const).map((id) => (
          <button type="button" key={id} aria-pressed={them === id} onClick={() => setThem(id)}>{name(id)}</button>
        ))}
      </div>
      <div className="cpD-pair">
        <span className="cpD-corner" aria-hidden="true" />
        <div className="cpD-col them">
          <h3>{name(them)}</h3>
          <p className="cpD-price"><b>{PRICE[them][0]}</b><small>{PRICE[them][1]}</small></p>
        </div>
        <div className="cpD-col us">
          <h3>{BRAND}</h3>
          <p className="cpD-price"><b>{PRICE.us[0]}</b><small>{PRICE.us[1]}</small></p>
          <p className="cpD-gap">{gap}</p>
        </div>
        {rows.map((r) => (
          <div className="cpD-row" key={r.id}>
            <span className="cpD-label">{r.label}</span>
            <span className="cpD-cell them"><MarkIcon m={r.cells[them][0]} />{r.cells[them][1]}</span>
            <span className="cpD-cell us"><MarkIcon m={r.cells.us[0]} />{r.cells.us[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ComparePrototype() {
  const v = useSearchParams().get("variant") ?? "A1";
  const tone = TONES.find((t) => t.key === v)?.tone ?? "peach";
  return (
    <>
      {v === "B" ? <VariantB /> : v === "C" ? <VariantC /> : v === "D" ? <VariantD /> : <VariantA tone={tone} />}
      <PrototypeSwitcher variants={TONES} current={v} />
    </>
  );
}
