import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import type { ScheduleView } from "@/lib/parent-schedule";
import "./parent-workbooks.css";
import "./parent-schedule.css";

export function ParentSchedule({ schedule }: { schedule: Exclude<ScheduleView, { kind: "not-found" }> }) {
  const title = schedule.child ? `${schedule.child.firstName}'s schedule` : "Schedule";
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
      <section className="ps-table-wrap" aria-label={`Workbook ${schedule.book.number} schedule`}>
        <table className="ps-table" role="table">
          <caption>Schedule from page 2 of this workbook</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Topic</th><th scope="col">Pages</th><th scope="col">Required time</th><th scope="col">Scanned pages</th></tr></thead>
          <tbody>{schedule.rows.map(row => <tr key={row.day}>
            <th scope="row" data-label="Day">Day {row.day}</th>
            <td data-label="Topic"><b>{row.topic}</b><span className="ps-second">{row.second}</span></td>
            <td data-label="Pages">{row.pages[0]} to {row.pages[1]}</td>
            <td data-label="Required time">{row.requiredMinutes === null ? "See daily time above" : `${row.requiredMinutes} min`}{row.extra && <span className="ps-second">Extra is optional</span>}</td>
            <td data-label="Scanned pages">{row.scan.kind === "unknown" ? "Scan status unavailable" : `${row.scan.accepted} of ${row.scan.required} recorded`}</td>
          </tr>)}</tbody>
        </table>
      </section>
      <p className="pw-sub">Recorded pages passed the page check. Earlier scans may not appear here. These counts do not show marks or correct answers.</p>
    </>}
  </SupportPage>;
}
