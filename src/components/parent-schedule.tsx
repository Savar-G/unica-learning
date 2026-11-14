import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import type { ScheduleMarkState, ScheduleScanState, ScheduleView } from "@/lib/parent-schedule";
import "./parent-workbooks.css";
import "./parent-schedule.css";

const and = (items: string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

function Scanned({ scan }: { scan: ScheduleScanState }) {
  // No receipt is not proof of no scan (receipts have no backfill), so an empty day never says "0 scanned".
  if (scan.kind === "unknown") return <>Scan status unavailable</>;
  const label = `${scan.accepted} of ${scan.required} scanned`;
  if (!scan.missing.length) return <>{label}</>;
  return <>{label}<span className="ps-second ps-gap">Still to scan: {scan.missing.length === 1 ? "page" : "pages"} {and(scan.missing.map(String))}</span></>;
}

/** Marks are their own fact: a scanned page is not a marked page. No screen asks a parent to judge an answer (D-303). */
function Marks({ marks }: { marks: ScheduleMarkState }) {
  if (marks.kind === "unknown") return <>Mark status unavailable</>;
  if (marks.kind === "all") return <>All marked</>;
  const count = `${marks.marked} of ${marks.total} ${marks.total === 1 ? "page" : "pages"} marked`;
  if (marks.kind === "checking") return <>Our team is checking some answers<span className="ps-second">{count}</span></>;
  return <>{marks.kind === "some" ? count : "Not marked yet"}</>;
}

export function ParentSchedule({ schedule }: { schedule: Exclude<ScheduleView, { kind: "not-found" }> }) {
  const title = schedule.child ? `${schedule.child.firstName}'s schedule` : "Schedule";
  const gaps = schedule.kind === "ready" ? schedule.rows.filter(r => r.scan.kind === "known" && r.scan.missing.length > 0) : [];
  return <SupportPage label="Schedule" title={title} wide>
    {schedule.kind === "waiting" ? <section className="pw-card pw-section">
      <h2>No printed workbook yet</h2>
      <p className="pw-sub">The schedule will appear here when the workbook is printed.</p>
      <Link className="btn ghost" href={schedule.child ? `/account?child=${encodeURIComponent(schedule.child.id)}` : "/account"}>Back to your account</Link>
    </section> : schedule.kind === "unavailable" ? <section className="pw-card pw-section" role="status">
      <h2>The schedule is unavailable</h2><p className="pw-sub">We could not confirm the printed schedule. Please try again later.</p>
    </section> : <>
      <p className="lead">Workbook {schedule.book.number}. Follow the day numbers in your printed book.</p>
      <p className="pw-sub">Each day: {schedule.dailyTime}. Extra practice is optional.</p>
      <p className="pw-sub">5 days on, 2 days off. The workbook has 10 days, so it takes 2 weeks. Do one day on 5 days of each week, for example Monday to Friday, with the weekend off. The days off give your child time to rest, or to look back at the week&apos;s pages, and come back ready to learn. A steady 5 days a week builds a habit. Working every single day can wear kids out and make math feel like a chore, for your child and for you.</p>
      <p className="pw-sub">You choose the 5 days. For example: Monday, Tuesday, Thursday, Friday and Saturday, with Wednesday and Sunday off. Just do the days in order, Day 1 to Day 10, and keep to the same 5 days each week.</p>
      {gaps.length > 0 && <p className="ps-gaps" role="status">Pages still to scan: {and(gaps.map(r => `Day ${r.day}`))}.</p>}
      <section className="ps-table-wrap" aria-label={`Workbook ${schedule.book.number} schedule`}>
        <table className="ps-table" role="table">
          <caption>Schedule from page 2 of this workbook</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Topic</th><th scope="col">Pages</th><th scope="col">Required time</th><th scope="col">Scanned</th><th scope="col">Marks</th></tr></thead>
          <tbody>{schedule.rows.map(row => <tr key={row.day} className={gaps.includes(row) ? "ps-gap-row" : undefined}>
            <th scope="row" data-label="Day">Day {row.day}</th>
            <td data-label="Topic"><b>{row.topic}</b><span className="ps-second">{row.second}</span></td>
            <td data-label="Pages">{row.pages[0]} to {row.pages[1]}</td>
            <td data-label="Required time">{row.requiredMinutes === null ? "See daily time above" : `${row.requiredMinutes} min`}{row.extra && <span className="ps-second">Extra is optional</span>}</td>
            <td data-label="Scanned"><Scanned scan={row.scan} /></td>
            <td data-label="Marks"><Marks marks={row.marks} /></td>
          </tr>)}</tbody>
        </table>
      </section>
      <p className="pw-sub">Scanned pages passed the page check. Earlier scans may not appear here. A page is marked when every answer on it has a mark. You can see each page&apos;s results in Workbooks.</p>
    </>}
  </SupportPage>;
}
