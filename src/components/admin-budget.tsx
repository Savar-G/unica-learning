// The admin budget page (D-333): the totals, who owes whom, the transactions (admin-budget-ledger.tsx, which changes
// them) and the month and category tables. Server rendered; the chart is one SVG with <title> tips and the table under
// it holds the same numbers.
import { Table } from "@/components/admin";
import { BarList, Empty, SectionHead, Tiles, type Bar } from "@/components/admin-blocks";
import { BudgetLedger } from "@/components/admin-budget-ledger";
import { PERSON_NAME, centsText, monthLabel, summarize, type BudgetSummary, type CategoryRow } from "@/lib/budget";
import type { BudgetData } from "@/lib/budget-store";
import "./admin-budget.css";
import "./admin-pages.css";

const dash = (cents: number | undefined) => (cents ? centsText(cents) : "-");
const shortMonth = (m: string) => `${monthLabel(m).slice(0, 3)} '${m.slice(2, 4)}`;

function niceTop(max: number): number {
  if (max <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max) ?? 10;
  return step * pow;
}

function MonthChart({ s }: { s: BudgetSummary }) {
  const w = 720, h = 232, padL = 56, padR = 8, padT = 10, padB = 26;
  const top = niceTop(Math.max(0, ...s.months.map((m) => Math.max(s.revenueByMonth[m] ?? 0, s.expenseByMonth[m] ?? 0))));
  const y = (v: number) => padT + (h - padT - padB) * (1 - v / top);
  const gw = (w - padL - padR) / Math.max(1, s.months.length);
  const bw = Math.max(4, Math.min(22, gw * 0.34));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Revenue and expenses in CAD for each of ${s.months.length} months`} className="bt-chart">
      {[0, top / 2, top].map((t) => (
        <g key={t}>
          <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} className="bt-grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="bt-axis">{t === 0 ? "0" : `$${Math.round(t / 100).toLocaleString("en-CA")}`}</text>
        </g>
      ))}
      {s.months.map((m, i) => {
        const x = padL + i * gw + gw / 2;
        const rev = s.revenueByMonth[m] ?? 0, exp = s.expenseByMonth[m] ?? 0;
        return (
          <g key={m}>
            <rect x={x - bw - 1} y={y(rev)} width={bw} height={Math.max(rev > 0 ? 1.5 : 0, y(0) - y(rev))} rx={2} className="bt-bar is-rev"><title>{`${monthLabel(m)}: revenue ${centsText(rev)}`}</title></rect>
            <rect x={x + 1} y={y(exp)} width={bw} height={Math.max(exp > 0 ? 1.5 : 0, y(0) - y(exp))} rx={2} className="bt-bar is-exp"><title>{`${monthLabel(m)}: expenses ${centsText(exp)}`}</title></rect>
            <text x={x} y={h - 8} textAnchor="middle" className="bt-axis">{shortMonth(m)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CategoryRows({ rows, months }: { rows: CategoryRow[]; months: string[] }) {
  return rows.map((r) => (
    <tr key={r.category.id}>
      <th scope="row">{r.category.name}</th>
      {months.map((m) => <td key={m} className="adm-num">{dash(r.byMonth[m])}</td>)}
      <td className="adm-num bt-total">{dash(r.total)}</td>
    </tr>
  ));
}

function MonthTable({ s }: { s: BudgetSummary }) {
  const months = s.months;
  const span = months.length + 2;
  return (
    <Table label="Expenses, revenue and net profit by month" head={["CAD", ...months.map(monthLabel), "Total"]} empty="No months yet.">
      {[
        <tr key="h-exp" className="bt-section"><th scope="colgroup" colSpan={span}>Expenses</th></tr>,
        ...CategoryRows({ rows: s.expenses, months }),
        <tr key="t-exp" className="bt-sum">
          <th scope="row">Total expenses</th>
          {months.map((m) => <td key={m} className="adm-num">{dash(s.expenseByMonth[m])}</td>)}
          <td className="adm-num bt-total">{dash(s.expenseCents)}</td>
        </tr>,
        <tr key="h-rev" className="bt-section"><th scope="colgroup" colSpan={span}>Revenue</th></tr>,
        ...CategoryRows({ rows: s.revenue, months }),
        <tr key="t-rev" className="bt-sum">
          <th scope="row">Total revenue</th>
          {months.map((m) => <td key={m} className="adm-num">{dash(s.revenueByMonth[m])}</td>)}
          <td className="adm-num bt-total">{dash(s.revenueCents)}</td>
        </tr>,
        <tr key="net" className="bt-sum bt-net">
          <th scope="row">Net profit (loss)</th>
          {months.map((m) => <td key={m} className={`adm-num${(s.netByMonth[m] ?? 0) < 0 ? " is-loss" : ""}`}>{dash(s.netByMonth[m])}</td>)}
          <td className={`adm-num bt-total${s.netCents < 0 ? " is-loss" : ""}`}>{dash(s.netCents)}</td>
        </tr>,
      ]}
    </Table>
  );
}

export function BudgetPage({ data, today, error }: { data: BudgetData | null; today: string; error?: string | null }) {
  if (!data) return <Empty>{error ?? "The budget could not be read."}</Empty>;
  const s = summarize(data.entries, data.categories, today.slice(0, 7));
  const b = s.balance;
  const expenseBars: Bar[] = s.expenses.filter((r) => r.total > 0).sort((x, y) => y.total - x.total).map((r) => ({
    key: r.category.id, label: r.category.name, value: r.total,
    text: <>{centsText(r.total)} <span className="bt-sub">{s.expenseCents > 0 ? `${Math.round((r.total / s.expenseCents) * 100)}%` : ""}</span></>,
  }));
  const revenueCount = data.entries.filter((e) => e.kind === "revenue").length;
  const expenseCount = data.entries.length - revenueCount;
  const net = s.netCents;
  return (
    <div className="adm-bt">
      <Tiles label="Totals" tiles={[
        { key: "rev", label: "Total revenue", value: centsText(s.revenueCents), sub: revenueCount ? `${revenueCount} ${revenueCount === 1 ? "payment" : "payments"} received` : "none yet" },
        { key: "exp", label: "Total expenses", value: centsText(s.expenseCents), sub: `${expenseCount} ${expenseCount === 1 ? "expense" : "expenses"}` },
        { key: "net", label: "Net profit (loss)", value: centsText(net), tone: net < 0 ? "bad" : net > 0 ? "ok" : null, sub: "revenue minus expenses, CAD" },
        {
          key: "bal", label: "Between Savar and Cedric", tone: b.net ? "warn" : "ok",
          value: b.net ? centsText(b.net.cents) : "All settled",
          sub: b.net ? `${PERSON_NAME[b.net.from]} owes ${PERSON_NAME[b.net.to]}` : "nobody owes anything",
        },
      ]} />

      <section className="ap-card" aria-labelledby="bt-balance">
        <SectionHead id="bt-balance" title="Who owes whom" line="Counts the expenses whose split is not settled. After a transfer, tick Split settled on those expenses." />
        <dl className="bt-balance">
          <div><dt>Cedric owes Savar</dt><dd>{b.cedricOwes ? centsText(b.cedricOwes) : "-"}</dd></div>
          <div><dt>Savar owes Cedric</dt><dd>{b.savarOwes ? centsText(b.savarOwes) : "-"}</dd></div>
          <div className="is-net"><dt>Net</dt><dd>{b.net ? `${PERSON_NAME[b.net.from]} owes ${PERSON_NAME[b.net.to]} ${centsText(b.net.cents)}` : "Settled"}</dd></div>
        </dl>
        <p className="bt-line">{b.open} {b.open === 1 ? "expense is" : "expenses are"} not settled.</p>
        <div className="bt-owes"><Table label="What each partner paid and owes in total" head={["", "Paid out of pocket", "Their share of all expenses"]} empty="No expenses.">
          {(["savar", "cedric"] as const).map((p) => (
            <tr key={p}><th scope="row">{PERSON_NAME[p]}</th><td className="adm-num">{centsText(s.paid[p])}</td><td className="adm-num">{centsText(s.share[p])}</td></tr>
          ))}
        </Table></div>
      </section>

      <BudgetLedger entries={data.entries} categories={data.categories} rate={data.rate} today={today} cut={data.cut} />

      <section className="ap-card" aria-labelledby="bt-month">
        <SectionHead id="bt-month" title="By month" count={`${s.months.length} ${s.months.length === 1 ? "month" : "months"}`} line="CAD. Revenue and expenses for each month, and the table under it." />
        {data.entries.length === 0 ? <Empty>Add a transaction to see the months.</Empty> : (
          <figure className="bt-figure">
            <div className="bt-chart-wrap"><MonthChart s={s} /></div>
            <figcaption className="bt-legend"><span><i className="is-rev" aria-hidden="true" />Revenue</span><span><i className="is-exp" aria-hidden="true" />Expenses</span></figcaption>
          </figure>
        )}
        <MonthTable s={s} />
      </section>

      <section className="ap-card" aria-labelledby="bt-category">
        <SectionHead id="bt-category" title="Expenses by category" line="All months, CAD, with each category's share of all expenses." />
        {expenseBars.length ? <BarList label="Expenses by category" bars={expenseBars} /> : <Empty>No expenses yet.</Empty>}
      </section>
    </div>
  );
}
