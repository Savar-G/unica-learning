// The check table (D-097, variant C of round r19) is the at-a-glance table on /compare, with all four options (D-114).
// HomeCompare is the home "How we compare" section (D-219). The facts live in
// src/lib/compare.ts. Marks scan before words: a full mark is yes, a half mark is partly, an empty mark is no.
import { COST, MARK_LABEL, OPTIONS, ROWS, type Mark, type OptionId, type RowId } from "@/lib/compare";
import type { Vars } from "./drawn";
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

/** Home "How we compare" (D-219, round r33 variant A3): price first, then four traits. Only our column carries checks,
 *  on a grainy colour field that runs unbroken down the column. Each cell gets its grid place as CSS variables: --r/--c
 *  on wide screens (4 columns), --pr/--pc on phones (3 columns; the row label sits above the tutor and centre cells and
 *  our cell spans both rows, so our column never breaks). */
const HOME_COLS: OptionId[] = ["tutor", "centre", "us"];
const HOME_ROWS: RowId[] = ["personal", "help", "plan", "gaps"];
/** Shorter big numbers where the /compare text does not fit a home column (the range already says it varies). */
const HOME_PRICE: Partial<Record<OptionId, string>> = { tutor: "$170-430" };

export function HomeCompare() {
  const at = (r: number, c: number, i: number) => ({ "--r": r, "--c": c, "--pr": i === 0 ? 1 : c === 1 ? 2 * i : c === 4 ? 2 * i : 2 * i + 1, "--pc": c === 1 ? 1 : c - 1 }) as Vars;
  const name = (id: OptionId) => OPTIONS.find((o) => o.id === id)?.name;
  const cls = (id: OptionId) => (id === "us" ? "us" : undefined);
  const rows = HOME_ROWS.map((id) => ROWS.find((r) => r.id === id)!);
  return (
    <div className="hc" role="table" aria-label="How we compare">
      <span className="hc-us-field" aria-hidden="true" />
      <div className="hc-row hc-head" role="row">
        <span role="columnheader" style={at(1, 1, 0)} />
        {HOME_COLS.map((id, c) => <span role="columnheader" key={id} className={cls(id)} style={at(1, c + 2, 0)}>{name(id)}</span>)}
      </div>
      <div className="hc-row hc-price" role="row">
        <span role="rowheader" style={at(2, 1, 1)}>Price a month</span>
        {HOME_COLS.map((id, c) => (
          <span role="cell" key={id} className={cls(id)} style={at(2, c + 2, 1)}><b>{HOME_PRICE[id] ?? COST[id][0]}</b><small>{COST[id][1]}</small></span>
        ))}
      </div>
      {rows.map((r, n) => (
        <div className="hc-row" role="row" key={r.id}>
          <span role="rowheader" style={at(n + 3, 1, n + 2)}>{r.label}</span>
          {HOME_COLS.map((id, c) => (
            <span role="cell" key={id} className={cls(id)} style={at(n + 3, c + 2, n + 2)}>
              {id === "us" && <i className="hc-check" role="img" aria-label="Yes" />}
              {r.cells[id][1]}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
