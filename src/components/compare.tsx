// "How we compare", folded into Pricing under the plan card (D-076): a check table (D-097, variant C of round r19).
// The same grid, with all five options, is the at-a-glance table on /compare (D-114). The facts live in
// src/lib/compare.ts. Marks scan before words: a full mark is yes, a half mark is partly, an empty mark is no.
import Link from "next/link";
import { COST, MARK_LABEL, OPTIONS, ROWS, type Mark, type OptionId, type RowId } from "@/lib/compare";
import { Rise } from "./drawn";
import "@/ds/styles/compare.css";

export function MarkIcon({ m }: { m: Mark }) {
  return <span className={`cmp-mk ${m}`} role="img" aria-label={MARK_LABEL[m]} />;
}

/** The check table: `columns` in order (ours last), `rows` by id, then Cost. Each cell carries data-col for the phone switch. */
export function CompareGrid({ columns, rows, labelledBy, className = "" }: { columns: OptionId[]; rows: RowId[]; labelledBy: string; className?: string }) {
  const cls = (id: OptionId) => (id === "us" ? "us" : undefined);
  const name = (id: OptionId) => OPTIONS.find((o) => o.id === id)?.name;
  return (
    <div className={`cmp-tbl ${className}`.trim()} role="table" aria-labelledby={labelledBy}>
      <div className="cmp-row cmp-head" role="row">
        <span role="columnheader" />
        {columns.map((id) => <span role="columnheader" key={id} className={cls(id)} data-col={id}>{name(id)}</span>)}
      </div>
      {ROWS.filter((r) => rows.includes(r.id)).map((r) => (
        <div className="cmp-row" role="row" key={r.id}>
          <span role="rowheader">{r.label}</span>
          {columns.map((id) => {
            const [m, text] = r.cells[id];
            return <span role="cell" key={id} className={cls(id)} data-col={id}><MarkIcon m={m} />{text}</span>;
          })}
        </div>
      ))}
      <div className="cmp-row cmp-cost" role="row">
        <span role="rowheader">Cost</span>
        {columns.map((id) => (
          <span role="cell" key={id} className={cls(id)} data-col={id}><b>{COST[id][0]}</b> {COST[id][1]}</span>
        ))}
      </div>
    </div>
  );
}

export function CompareLegend({ marks }: { marks: Mark[] }) {
  return <p className="cmp-legend">{marks.map((m) => <span key={m}><MarkIcon m={m} /> {MARK_LABEL[m]}</span>)}</p>;
}

export function CompareTable() {
  return (
    <Rise className="cmp">
      <p className="cmp-kicker" id="cmpT">How we compare</p>
      <CompareGrid columns={["tutor", "centre", "us"]} rows={["personal", "plan", "gaps"]} labelledBy="cmpT" />
      <CompareLegend marks={["yes", "part"]} />
      <p className="cmp-more"><Link href="/compare">Compare with school and online learning platforms too →</Link></p>
    </Rise>
  );
}
