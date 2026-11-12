import { UNKNOWN_RESPONSE } from "@/lib/assessment";
import Link from "next/link";
import { notFound } from "next/navigation";
import { detailProgress, getStrokes, getTest, requireAdmin } from "@/lib/admin-store";
import { progressSnapshot } from "@/lib/admin-progress";
import { ProgressPanel } from "@/components/admin-progress";
import { adminParentPath, adminProfilePath, adminReportPath, answerLines, duration, factLines, levelText, questionNumbers, shownWithoutAnswer, when } from "@/lib/admin-view";
import { contextFacts } from "@/lib/admin-view";
import { QuestionTimeline, ShownWithoutAnswer } from "@/components/admin-timeline";
import { Chip, StatusChip, Table, gradeAndPlace } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { Fold } from "@/components/admin-fold";
import { AnswersTable, ResultCard, TestHeaderCard } from "@/components/admin-tests";
import { EmailTable, RecordFacts, ReviewDetail, childPath } from "@/components/admin-records";
import { QuestionSkills } from "@/components/admin-question-skills";
import { StrokeReplay } from "@/components/stroke-replay";
import { ResultCertainty } from "@/components/admin-certainty";
import { DELIVERY_WORDS, reportAlertState, reportEmailState } from "@/lib/delivery-state";

const pl = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// One test (D-313, D-315): the header card, the live progress while the test is open, the Result card, the answers and
// the shown work; then the timeline, skills, break and device, report delivery, quick facts and emails in closed
// sections, and the ids in Technical details.
export default async function TestDetailPage({ params }: PageProps<"/admin/assessments/[id]">) {
  const admin = await requireAdmin();
  const id = (await params).id;
  // #186: the whiteboard strokes, by question id, for the replay.
  const [detail, strokes] = await Promise.all([getTest(admin, id), getStrokes(admin, id)]);
  if (!detail) notFound();
  const { test: t, report, facts, images } = detail;
  const lines = answerLines(t.stored, detail.answers, detail.reviews, t.placement?.pace?.leftOut);
  const numbers = questionNumbers(detail.answers);
  const work = lines.filter((a) => a.work.required || a.work.image || a.work.text || a.review || a.questionId in strokes);
  const lowReviews = work.filter((a) => a.review?.confidence === "low").length;
  const quick = facts ? factLines(facts.test, facts.answers) : [];
  const progress = progressSnapshot(new Map([[t.id, detailProgress(detail)]]), new Date());
  const open = progress.tests[t.id]?.open === true;
  const child = t.child?.first_name ?? "Child";
  const live = <ProgressPanel id={t.id} initial={progress} live />;
  const ctx = Object.fromEntries(contextFacts(detail.context));
  const reportProblem = report && (report.email_error || report.alert_error);
  return <AdminFrame email={admin.email} title={`${child}'s test`}
    lead={`${gradeAndPlace(t.grade, t.province)} · started ${when(t.started_at)} (Pacific)`}
    actions={<>
      {report && <Link className="btn adm-btn" href={adminReportPath(report.id)}>Open the report</Link>}
      {t.status === "completed" && <Link className="btn adm-btn ghost" href={adminProfilePath(t.id)}>Learner profile</Link>}
    </>}>
    <TestHeaderCard facts={[
      ["Child", <span key="child"><Link href={childPath(t.child_id)}>{child}</Link><span className="adm-sub">{gradeAndPlace(t.grade, t.province)}</span></span>],
      ["Family", <Link key="family" href={adminParentPath(t.parent_id)}>{t.parent?.name ?? "Family"}</Link>],
      ["Status", <StatusChip key="status" status={t.status} />],
      ["Level", t.placement ? `${levelText(t.placement.workingLevel)}, route ${t.route ?? t.placement.route}` : "-"],
      ["Started (Pacific)", when(t.started_at)],
      [t.completed_at ? "Finished (Pacific)" : "Last answer (Pacific)", when(t.completed_at ?? t.last_answer_at)],
    ]} />
    {open && <section className="tst-live" aria-labelledby="tst-live-h">
      <h2 id="tst-live-h">Where the child is</h2>
      {live}
      <p className="adm-note">This box updates by itself. The rest of the page shows it as it loaded: reload for new answers.</p>
    </section>}
    <ResultCard test={t} lines={lines} numbers={numbers} certainty={<ResultCertainty placement={t.placement} />} />

    <section className="tst-section" aria-labelledby="tst-answers-h">
      <div className="tst-section-head">
        <h2 id="tst-answers-h">Answers</h2><span className="tst-count">{lines.length}</span>
        <p>Time is the thinking time in the browser. A number opens the question as the child saw it.</p>
      </div>
      <AnswersTable lines={lines} adaptive={!!t.stored.adaptive} />
      <ShownWithoutAnswer lines={shownWithoutAnswer(t.stored, detail.shows, detail.answers)} />
    </section>

    <section className="tst-section" aria-labelledby="tst-work-h">
      <div className="tst-section-head">
        <h2 id="tst-work-h">Shown work and AI reviews</h2><span className="tst-count">{work.length}</span>
        {lowReviews > 0 && <Chip tone="bad">{pl(lowReviews, "low confidence review", "low confidence reviews")}</Chip>}
      </div>
      {work.length === 0 ? <p className="adm-empty">No shown work yet.</p> : <ul className="adm-work">{work.map((a) => <li key={a.questionId} id={`work-${a.questionId}`}>
        <h3>Question {a.number}</h3><p>{a.prompt ?? a.questionId}</p><p>Answer: {a.response || "Skipped"}. Right answer: {a.rightAnswer ?? "-"}.</p>
        <div className="adm-row"><Chip tone={a.correct ? "ok" : "bad"}>{a.correct ? "Right" : "Wrong"}</Chip><span>{a.work.required ? "Work required" : "Optional work"}</span></div>
        {a.work.image && <div className="adm-board">{images[a.work.image] ?
          // Signed private URLs must not pass through the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <a href={images[a.work.image]} target="_blank" rel="noopener noreferrer"><img src={images[a.work.image]} alt={`Drawing for question ${a.number}`} /></a> : <p>The drawing did not load. Reload the page to try again.</p>}</div>}
        {a.questionId in strokes && (strokes[a.questionId]
          ? <StrokeReplay src={strokes[a.questionId]!} label={`Strokes for question ${a.number}`} />
          : <p className="adm-note">The strokes did not load. Reload the page to try again.</p>)}
        {a.work.text && <pre className="adm-typed">{a.work.text}</pre>}
        {!a.work.image && !a.work.text && !(a.questionId in strokes) && <p className="adm-note">No work stored.</p>}
        <ReviewDetail review={a.review} />
      </li>)}</ul>}
    </section>

    <section className="tst-section" aria-labelledby="tst-more-h">
      <div className="tst-section-head"><h2 id="tst-more-h">More about this test</h2><p>Closed until you open one.</p></div>
      <Fold title="Each question as the child saw it" hint={`${pl(lines.length, "question", "questions")}, with server times, answer changes, read aloud and time away`}>
        <QuestionTimeline lines={lines} />
      </Fold>
      <Fold title="Skills of each question" hint="The skill map skills of each question's template">
        <QuestionSkills lines={lines} />
      </Fold>
      <Fold title="Break and device" hint={detail.context.device ? `${ctx.Device}, ${ctx.Browser}. Halfway break: ${ctx["Halfway break"]}.` : `Device not recorded. Halfway break: ${ctx["Halfway break"]}.`}>
        <RecordFacts facts={contextFacts(detail.context)} />
      </Fold>
      {!open && <Fold title="Progress through the test" hint="Where the child stopped, by part">{live}</Fold>}
      <Fold title="Report and delivery" open={!!reportProblem}
        hint={report ? `Parent email: ${DELIVERY_WORDS[reportEmailState(report)]}. Alert: ${DELIVERY_WORDS[reportAlertState(report)]}.` : "No report has been stored"}>
        {report ? <>
          <p><Link href={adminReportPath(report.id)}>Open the report</Link></p>
          <RecordFacts facts={[["Created (Pacific)", when(report.created_at)], ["Questions", report.questions], ["Minutes", report.minutes], ["Parent email", DELIVERY_WORDS[reportEmailState(report)]], ["Parent email claimed (Pacific)", when(report.emailed_at)], ["Parent email error", report.email_error], ["Alert", DELIVERY_WORDS[reportAlertState(report)]], ["Alert (Pacific)", when(report.alerted_at)], ["Alert error", report.alert_error]]} />
        </> : <p className="adm-note">No report has been stored.</p>}
      </Fold>
      <Fold title="Quick facts" hint={facts ? `${pl(quick.length, "fact", "facts")} answered, ${quick.filter((f) => f.correct).length} right` : "No quick facts for this test"}>
        {facts && <p className="adm-note">Started: {when(facts.started_at)} (Pacific). Server time: since the answer before, by the server&apos;s clock. Browser time: from when the fact appeared to Enter. The fact speed uses the browser time when there is one.</p>}
        <Table label="Quick facts" head={["#", "Fact", "Right answer", "Child answer", "Result", "Time since start", "Server time", "Browser time"]} empty="No quick facts answers.">
          {quick.map((f) => <tr key={f.number}><td>{f.number}</td><td>{f.fact}</td><td>{f.rightAnswer}</td><td>{f.skipped ? "Skipped" : f.response}</td><td>{f.correct ? "Right" : "Wrong"}</td><td>{duration(f.atMs)}</td><td>{duration(f.serverMs)}</td><td>{f.browserMs === null ? "-" : duration(f.browserMs)}</td></tr>)}
        </Table>
      </Fold>
      <Fold title="Emails and unsubscribes" hint={pl(detail.emails.length, "email", "emails")}>
        <EmailTable emails={detail.emails} />
      </Fold>
    </section>
    <details className="adm-tech">
      <summary>Technical details</summary>
      <RecordFacts facts={[
        ["Test id", <span key="id" className="adm-mono">{t.id}</span>], ["Question draw number", t.seed],
        ["Parent id", <span key="parent" className="adm-mono">{t.parent_id}</span>], ["Child id", <span key="child" className="adm-mono">{t.child_id}</span>],
        ["Assessment format", t.stored.adaptive ? "Six-question blocks" : "Stages"], ["Resume until (Pacific)", when(t.resume_until)],
        ["Unknown answers", detail.answers.filter((a) => a.response === UNKNOWN_RESPONSE).length],
      ]} />
    </details>
  </AdminFrame>;
}
