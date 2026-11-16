// Cost per child per month (docs/child-unit-cost.md, /admin/ai/children): does each family make money? Server rendered, no
// JavaScript: the month pills are links. It copies the look of the AI usage page; no new visual design.
import Link from "next/link";
import { Table } from "@/components/admin";
import { Empty, Pills, SectionHead, Tiles } from "@/components/admin-blocks";
import { ADMIN_AI_PATH, cadCents } from "@/lib/admin-ai-usage";
import { CHILD_COST_PATH, MONTHS, WORKBOOK_PHYSICAL_COST_CENTS, type MonthKey, type UnitCostView } from "@/lib/child-unit-cost";
import { formatCalendarDate } from "@/lib/family-time";
import { UsageDetails } from "@/components/admin-ai-usage";
import "./admin-ai-usage.css";
import "./admin-pages.css";

const SUBSCRIPTION_TEXT = "subscription, not in the total";
const monthName = (month: string) => formatCalendarDate(`${month}-01`, { month: "long", year: "numeric" });
const money = (cents: number) => (cents < 0 ? `-${cadCents(-cents)}` : cadCents(cents));
const maybeMoney = (cents: number | null) => (cents === null ? "unknown" : money(cents));

export function ChildUnitCostPage({ view, monthKey, error }: { view: UnitCostView | null; monthKey: MonthKey; error?: string | null }) {
  const pills = MONTHS.map((m) => ({ key: m.key, href: m.key === "0" ? CHILD_COST_PATH : `${CHILD_COST_PATH}?month=${m.key}`, label: m.label, current: m.key === monthKey }));
  const top = (
    <div className="ai-top">
      <Pills label="Month" pills={pills} />
      <Link className="ai-out" href={ADMIN_AI_PATH} prefetch={false}>Back to AI usage</Link>
    </div>
  );
  if (!view) return <div className="adm-ai">{top}<Empty>{error ?? "The cost per child could not be read."}</Empty></div>;
  const t = view.totals;
  const p = view.paying;
  return (
    <div className="adm-ai">
      {top}
      <Tiles label="Totals" tiles={[
        { key: "cost", label: "Recorded cost and estimates", value: money(t.costCents), sub: `${monthName(view.month)}, each family's own month` },
        { key: "paid", label: "Paid", value: money(t.paidCents), sub: t.unknownPaid ? `from the stored plan state; ${t.unknownPaid} with an unknown price left out` : "from the stored plan state" },
        { key: "margin", label: "Margin", value: money(t.marginCents), sub: t.unknownPaid ? "paid minus total cost, without the unknown prices" : "paid minus total cost" },
        { key: "sub", label: "Subscription calls", value: t.subscriptionCalls.toLocaleString("en-CA"), sub: SUBSCRIPTION_TEXT },
      ]} />
      <p className="ai-note">
        {p.avgCostCents === null
          ? <>No child&apos;s plan charged in {monthName(view.month)}, so there is no average cost per paying child.</>
          : <>Average cost per paying child: <b>{money(p.avgCostCents)}</b> a month against the plan price of {money(p.priceCents)} ({p.children} {p.children === 1 ? "child" : "children"}).</>}
      </p>
      {view.pastMonth && <p className="ai-note">The plan state is stored only as it is today, so for an earlier month the paid column shows today&apos;s plan. It is right when the plan did not change since.</p>}

      <section className="ap-card" aria-labelledby="cc-physical">
        <SectionHead id="cc-physical" title="Print and postage" line={`An estimate: ${money(WORKBOOK_PHYSICAL_COST_CENTS)} of printing for each workbook shipped (WORKBOOK_PHYSICAL_COST_CAD). Postage is not in it yet: it is known after the first shipment.`} />
        <dl className="ai-check">
          <div><dt>Estimate</dt><dd>{money(view.physical.estimateCents)}</dd></div>
          <div><dt>Workbooks shipped</dt><dd>{view.physical.workbooks.toLocaleString("en-CA")}</dd></div>
          <div><dt>Budget tracker</dt><dd>{money(view.physical.budgetCents)}</dd></div>
        </dl>
        <p className="ai-note">
          Budget tracker: the printing and postage expenses dated in {monthName(view.month)}
          {view.physical.budget.length ? <> ({view.physical.budget.map((b) => `${b.name} ${money(b.cents)}`).join(", ")})</> : <>; there are none</>}.
          It can hold test prints, so it is a comparison, not the per-child cost.
        </p>
      </section>

      <section aria-labelledby="cc-children">
        <SectionHead id="cc-children" title="Cost per child" count={view.rows.length}
          line={`CAD. AI calls at ${view.rate.toFixed(2)} CAD per USD (MAYA_USD_TO_CAD). Maya's speech and voice and print and postage are estimates. Each total is rounded once from the exact parts, and each column is rounded on its own, so the columns can differ from the total by a cent of rounding.`} />
        <Table label="Cost per child" head={["Child", "Plan", "AI calls", "Maya speech and voice (estimate)", "Print and postage (estimate)", "Total cost", "Paid", "Margin"]} empty="No child had a cost or a plan charge in this month.">
          {view.rows.map((r) => (
            <tr key={`${r.parentId}:${r.childId ?? ""}`}>
              <td>
                {r.childId ? <b>{r.childName}</b> : <span>{r.childName}</span>}
                <span className="ai-sub ai-block"><Link href={`/admin/parents/${r.parentId}`} prefetch={false}>{r.familyName}</Link></span>
              </td>
              <td>{r.plan}</td>
              <td className="adm-num">
                {money(r.aiCents)}
                <span className="ai-sub ai-block">{r.calls.toLocaleString("en-CA")} {r.calls === 1 ? "call" : "calls"}</span>
                {r.subscriptionCalls > 0 && <span className="ai-sub ai-block">{r.subscriptionCalls.toLocaleString("en-CA")} {SUBSCRIPTION_TEXT}</span>}
                {r.unpricedCalls > 0 && <span className="ai-sub ai-block">{r.unpricedCalls.toLocaleString("en-CA")} with no cost reported</span>}
              </td>
              <td className="adm-num">{money(r.voiceCents)}</td>
              <td className="adm-num">{money(r.physicalCents)}{r.workbooks > 0 && <span className="ai-sub ai-block">{r.workbooks} shipped</span>}</td>
              <td className="adm-num"><b>{money(r.totalCents)}</b></td>
              <td className="adm-num">{maybeMoney(r.paidCents)}</td>
              <td className="adm-num">{maybeMoney(r.marginCents)}</td>
            </tr>
          ))}
        </Table>
      </section>
      <p className="ai-note">All families, including testing, are included. Detail below covers identified app ledger records in each family&apos;s own month. Older history, Maya speech and voice estimates, and physical costs remain in the summary above. They have no invented feature or model allocation. Account spend and local receipts that have not been imported are not assigned to children.</p>
      <UsageDetails rows={view.rows.some((r) => r.details != null) ? view.rows.flatMap((r) => r.details ?? []) : null} />
    </div>
  );
}
