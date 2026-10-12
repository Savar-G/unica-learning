// "How we compare", folded into Pricing under the plan card (D-076): a check table (D-097, variant C of round r19).
// Every competitor fact is backed by .design/research/competitors-2026-10.md; re-check it before editing.
// Categories only, never a competitor name (D-064). Marks scan before words: a full mark is yes, a half mark is partly.
import { BRAND, PLANS } from "@/lib/site";
import { Rise } from "./drawn";
import "@/ds/styles/compare.css";

type Mark = "yes" | "part";
type Cell = [Mark, string];

const COLUMNS = ["Private tutor", "Learning centre", BRAND];

const ROWS: { label: string; cells: [Cell, Cell, Cell] }[] = [
  { label: "Personal to your child", cells: [["yes", "The tutor adjusts each session"], ["part", "Own pace, on a set path"], ["yes", "Every book matched to their level and gaps"]] },
  { label: "A structured plan", cells: [["part", "Depends on the tutor"], ["yes", "A set program at the centre"], ["yes", "A new book before the last one runs out"]] },
  { label: "Gaps shown to you", cells: [["part", "When the tutor reports them"], ["part", "Depends on the centre"], ["yes", "A gap report after every scan"]] },
];

const COST: [string, string][] = [
  ["$40-$100", "an hour"],
  ["$200+", "per subject, a month"],
  [`CAD ${PLANS.one.price}`, "a month, delivery included"],
];

const LABEL: Record<Mark, string> = { yes: "Yes", part: "Partly" };

function MarkIcon({ m }: { m: Mark }) {
  return <span className={`cmp-mk ${m}`} role="img" aria-label={LABEL[m]} />;
}

// The last column is ours.
const us = (i: number) => (i === COLUMNS.length - 1 ? "us" : undefined);

export function CompareTable() {
  return (
    <Rise className="cmp">
      <p className="cmp-kicker" id="cmpT">How we compare</p>
      <div className="cmp-tbl" role="table" aria-labelledby="cmpT">
        <div className="cmp-row cmp-head" role="row">
          <span role="columnheader" />
          {COLUMNS.map((c, i) => <span role="columnheader" key={c} className={us(i)}>{c}</span>)}
        </div>
        {ROWS.map((r) => (
          <div className="cmp-row" role="row" key={r.label}>
            <span role="rowheader">{r.label}</span>
            {r.cells.map(([m, text], i) => (
              <span role="cell" key={COLUMNS[i]} className={us(i)}><MarkIcon m={m} />{text}</span>
            ))}
          </div>
        ))}
        <div className="cmp-row cmp-cost" role="row">
          <span role="rowheader">Cost</span>
          {COST.map(([price, unit], i) => (
            <span role="cell" key={COLUMNS[i]} className={us(i)}><b>{price}</b> {unit}</span>
          ))}
        </div>
      </div>
      <p className="cmp-legend"><MarkIcon m="yes" /> Yes <MarkIcon m="part" /> Partly</p>
    </Rise>
  );
}
