import Link from "next/link";
import { notFound } from "next/navigation";
import { getTest, requireAdmin } from "@/lib/admin-store";
import { adminParentPath, adminReportPath, answerLines, duration, factLines, flagText, helpAnswerText, levelText, when } from "@/lib/admin-view";
import { AdminFrame, Chip, StatusChip, Table, gradeAndPlace } from "@/components/admin";
import { EmailTable, RecordFacts, ReviewDetail, childPath } from "@/components/admin-records";
import { ResultCertainty } from "@/components/admin-certainty";

export default async function TestDetailPage({ params }: PageProps<"/admin/assessments/[id]">) {
  const admin = await requireAdmin();
  const detail = await getTest(admin, (await params).id);
  if (!detail) notFound();
  const { test: t, report, facts, images } = detail;
  const lines = answerLines(t.stored, detail.answers, detail.reviews, t.placement?.pace?.leftOut);
  const numbers = new Map(lines.map((a) => [a.questionId, a.number]));
  const work = lines.filter((a) => a.work.required || a.work.image || a.work.text || a.review);
  const quick = facts ? factLines(facts.test, facts.answers) : [];
  return <AdminFrame email={admin.email} section="tests" title={`${t.child?.first_name ?? "Child"}'s test`}>
    <RecordFacts facts={[
      ["Parent", <Link key="parent" href={adminParentPath(t.parent_id)}>{t.parent?.name ?? "Family"}</Link>],
      ["Child", <Link key="child" href={childPath(t.child_id)}>{t.child?.first_name ?? "Child"}</Link>],
      ["Grade and curriculum", gradeAndPlace(t.grade, t.province)], ["Status", <StatusChip key="status" status={t.status} />],
      ["Started (Pacific)", when(t.started_at)], ["Last answer (Pacific)", when(t.last_answer_at)], ["Completed (Pacific)", when(t.completed_at)],
      ["Resume until (Pacific)", when(t.resume_until)], ["Working level", t.placement ? levelText(t.placement.workingLevel) : "-"], ["Route", t.route ?? "-"],
      ["Did anyone help?", helpAnswerText(t.help)], ["Seed", t.seed], ["Test id", t.id],
    ]} />
    <h2>Flags</h2>
    {t.flags?.length ? <ul className="adm-list">{t.flags.map((f, i) => <li key={i}>{flagText(f, numbers)}</li>)}</ul> : <p className="adm-note">{t.status === "completed" ? "No flags." : "Flags are recorded when the test finishes."}</p>}
    <h2>How sure the result is</h2>
    <ResultCertainty placement={t.placement} />
    <h2>Report and delivery</h2>
    {report ? <><p><Link href={adminReportPath(report.id)}>Open the report</Link></p><RecordFacts facts={[["Created (Pacific)", when(report.created_at)], ["Questions", report.questions], ["Minutes", report.minutes], ["Parent email (Pacific)", when(report.emailed_at)], ["Parent email error", report.email_error], ["Alert (Pacific)", when(report.alerted_at)], ["Alert error", report.alert_error]]} /></> : <p className="adm-note">No report has been stored.</p>}
    <h2>Answers and times</h2>
    <Table label="Answers" head={["#", "Stage", "Level / strand", "Question", "Right answer", "Child answer", "Result", "Time", "Mistake"]} empty="No answers yet.">
      {lines.map((a) => <tr key={a.number} className={a.correct ? "" : "is-wrong"}><td>{a.number}</td><td>{a.stage ?? "-"}</td><td>{a.level === null ? "-" : `${levelText(a.level)} / ${a.strand}`}</td><td className="adm-wide">{a.prompt ?? a.questionId}</td><td>{a.rightAnswer ?? "-"}</td><td>{a.response || "Skipped"}</td><td>{a.correct ? "Right" : "Wrong"}{a.leftOut && <span className="adm-sub">Left out: rushed</span>}</td><td className="adm-nowrap">{duration(a.timeMs)}{a.tooFast && <span className="adm-sub">Under 3 s</span>}</td><td>{a.misconception ?? "-"}</td></tr>)}
    </Table>
    <h2>Shown work and AI reviews</h2>
    {work.length === 0 ? <p className="adm-note">No shown work yet.</p> : <ul className="adm-work">{work.map((a) => <li key={a.questionId} id={`work-${a.questionId}`}>
      <h3>Question {a.number}</h3><p>{a.prompt ?? a.questionId}</p><p>Answer: {a.response || "Skipped"}. Right answer: {a.rightAnswer ?? "-"}.</p>
      <div className="adm-row"><Chip tone={a.correct ? "ok" : "bad"}>{a.correct ? "Right" : "Wrong"}</Chip><span>{a.work.required ? "Work required" : "Optional work"}</span></div>
      {a.work.image && <div className="adm-board">{images[a.work.image] ?
        // Signed private URLs must not pass through the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <a href={images[a.work.image]} target="_blank" rel="noopener noreferrer"><img src={images[a.work.image]} alt={`Drawing for question ${a.number}`} /></a> : <p>The drawing did not load. Reload the page to try again.</p>}</div>}
      {a.work.text && <pre className="adm-typed">{a.work.text}</pre>}
      {!a.work.image && !a.work.text && <p className="adm-note">No work stored.</p>}
      <ReviewDetail review={a.review} />
    </li>)}</ul>}
    <h2>Quick facts</h2>
    {facts && <p className="adm-note">Started: {when(facts.started_at)} (Pacific).</p>}
    <Table label="Quick facts" head={["#", "Fact", "Right answer", "Child answer", "Result", "Time since start", "Time since last answer"]} empty="No quick facts answers.">
      {quick.map((f) => <tr key={f.number}><td>{f.number}</td><td>{f.fact}</td><td>{f.rightAnswer}</td><td>{f.skipped ? "Skipped" : f.response}</td><td>{f.correct ? "Right" : "Wrong"}</td><td>{duration(f.atMs)}</td><td>{duration(f.tookMs)}</td></tr>)}
    </Table>
    <h2>Emails and unsubscribes</h2><EmailTable emails={detail.emails} />
  </AdminFrame>;
}
