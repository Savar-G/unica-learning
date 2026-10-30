// The current profile of one child (#303, spec #295), for admins: when it was built and from what, what is secure and
// what is not yet secure, each BC standard with the test's tally, the events' counts and links to its evidence, then
// every learning event of the child, then the stored JSON that the workbook planner, the generator and Maya read.
// Server components over the stored profile (getChildProfile).
import Link from "next/link";
import { BC_SKILL_MAP } from "@/lib/assessment";
import type { ChildProfileDetail, LearningEventRow } from "@/lib/admin-store";
import { adminProfilePath, adminTestPath, duration, when } from "@/lib/admin-view";
import { storedChildProfile, type ChildLearnerProfile, type ChildStandard } from "@/lib/child-profile";
import { feelingLabel, goalLabel, interestLabel, styleLabel, weeklyTimeLabel } from "@/lib/learning-style";
import { STATUS_LABEL } from "@/lib/report-view";
import { AdminFrame, Chip, Table, gradeAndPlace } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";

const STANDARD_TEXT = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s.text]));
const SOURCE: Record<LearningEventRow["source"], string> = { call: "Call", marking: "Marked page", assessment: "Test" };
const RESULT: Record<LearningEventRow["result"], string> = { right: "Right", right_with_help: "Right with help", wrong: "Wrong", blank: "Blank" };
const eventAnchor = (id: string) => `event-${id}`;

/** The admin page of one child's profile. A profile stored at another schema version shows as its JSON only. */
export function AdminChildProfile({ email, detail }: { email: string; detail: ChildProfileDetail }) {
  const { child: c, stored, events } = detail;
  const profile = stored ? storedChildProfile(stored.profile) : null;
  // Each event's number in the list below, so a standard's evidence links to its rows.
  const numbers = new Map(events.map((e, i) => [e.id, i + 1]));
  return <AdminFrame email={email} section="children" title={`${c.first_name}'s profile`}>
    <RecordFacts facts={[
      ["Child", <Link key="child" href={childPath(c.id)}>{c.first_name}</Link>], ["Grade and curriculum", gradeAndPlace(c.grade, c.province)],
      ["Built (Pacific)", when(stored?.built_at ?? null)], ["First built (Pacific)", when(stored?.created_at ?? null)],
      ["Revision", stored?.revision ?? "-"], ["Schema version", stored?.schema_version ?? "-"],
      ["Test profile", stored?.assessment_id ? <Link key="base" href={adminProfilePath(stored.assessment_id)}>Open the test&apos;s profile</Link> : "None"],
      ["Learning events", `${events.length} stored`],
    ]} />
    {!stored ? <p className="adm-note">No profile is stored for this child. It is built after a finished test&apos;s report and after the parent changes the learning card.</p>
      : !profile ? <>
        <p className="adm-note">This profile was built at schema version {stored.schema_version}, which this page does not read. The next build replaces it.</p>
        <pre className="adm-typed">{JSON.stringify(stored.profile, null, 2)}</pre>
      </>
      : <ProfileFacts profile={profile} numbers={numbers} />}

    <h2>Learning events</h2>
    <p className="adm-note">Every event of the child, oldest first. Events of the test the profile starts from are already in that test&apos;s profile, so the build does not count them again.</p>
    <Table label="Learning events" head={["#", "When (Pacific)", "Source", "Question", "BC", "Result", "Hints", "Stuck step", "Mistake", "Time", "Evidence", "Counted"]} empty="No learning event is stored for this child.">
      {events.map((e, i) => {
        const inTest = e.source === "assessment" && e.assessment_id !== null && e.assessment_id === profile?.assessment?.assessmentId;
        return <tr key={e.id} id={eventAnchor(e.id)}>
          <td className="adm-mono">{i + 1}</td>
          <td className="adm-nowrap">{when(e.occurred_at)}</td>
          <td>{SOURCE[e.source]}</td>
          <td>{e.question_source === "workbook" ? <>Workbook page {e.workbook_page}, question {e.workbook_question}<span className="adm-sub adm-mono">{e.workbook_id}</span></>
            : <>{e.assessment_id && <Link href={adminTestPath(e.assessment_id)}>Test</Link>} question <span className="adm-mono">{e.assessment_question_id}</span></>}</td>
          <td className="adm-mono">{e.skill_standard}</td>
          <td>{RESULT[e.result]}</td>
          <td>{e.hints}</td>
          <td className="adm-mono">{e.stuck_step ?? "-"}</td>
          <td className="adm-mono">{e.mistake ?? "-"}</td>
          <td>{e.time_ms === null ? "-" : duration(e.time_ms)}</td>
          <td>{e.evidence_kind === "answer" && e.assessment_id ? <Link href={adminTestPath(e.assessment_id)}>Answer in the test</Link>
            : e.evidence_kind ? <>{SOURCE[e.evidence_kind === "scan" ? "marking" : "call"]} <span className="adm-sub adm-mono">{e.evidence_id}</span></> : "-"}</td>
          <td>{!profile ? "-" : inTest ? <Chip tone="muted">In the test profile</Chip> : "Yes"}</td>
        </tr>;
      })}
    </Table>

    {profile && <>
      <h2>Stored JSON</h2>
      <details><summary>Schema version {profile.schemaVersion}, revision {stored!.revision}</summary><pre className="adm-typed">{JSON.stringify(profile, null, 2)}</pre></details>
    </>}
  </AdminFrame>;
}

function ProfileFacts({ profile, numbers }: { profile: ChildLearnerProfile; numbers: ReadonlyMap<string, number> }) {
  const a = profile.assessment;
  const list = (codes: string[], empty: string) => codes.length
    ? <ul className="adm-list">{codes.map((code) => <li key={code}><span className="adm-mono">{code}</span> {STANDARD_TEXT.get(code) ?? ""}</li>)}</ul>
    : <p className="adm-note">{empty}</p>;
  return <>
    <p className="adm-note">Written by code. Each standard adds the events to the test profile&apos;s tally: a right answer with help is not a right answer, so a standard solved only with help is not yet secure.</p>
    <RecordFacts facts={[
      ["Starts from", a ? <span key="from">The test finished {when(a.completedAt)} (working level {a.profile.level.working})</span> : "No test profile: events only"],
      ["Events counted", String(profile.events.counted)], ["Events already in the test profile", String(profile.events.inAssessmentProfile)],
      ["Newest counted event (Pacific)", when(profile.events.lastAt)],
    ]} />

    <h2>Not yet secure</h2>
    {list(profile.notYetSecure, "No standard at or below the school grade is not yet secure.")}
    <h2>Secure</h2>
    {list(profile.secure, "No secure standard.")}

    <h2>By BC standard</h2>
    <Table label="BC standards" head={["BC", "Standard", "Status", "Right", "Test", "Events", "Evidence"]} empty="No standard.">
      {profile.standards.map((s) => <tr key={s.code}>
        <td className="adm-mono">{s.code}</td>
        <td className="adm-wide">{s.text}</td>
        <td>{STATUS_LABEL[s.status]}{s.aboveGrade && <span className="adm-sub">Above grade: not a weakness</span>}</td>
        <td>{s.correct} of {s.total}</td>
        <td>{s.assessment ? `${s.assessment.correct} of ${s.assessment.total}` : "-"}</td>
        <td><EventCounts s={s} /></td>
        <td><Evidence s={s} numbers={numbers} /></td>
      </tr>)}
    </Table>

    <h2>The parent&apos;s answers</h2>
    <RecordFacts facts={[
      ["Learns best from", profile.preferences.styles.length ? profile.preferences.styles.map(styleLabel).join("; ") : "No answer"],
      ["Interests", profile.preferences.interests.length ? profile.preferences.interests.map(interestLabel).join(", ") : "No answer"],
      ["Main goal", profile.parent.goal ? goalLabel(profile.parent.goal) : "No answer"],
      ["Feeling about math", profile.parent.feeling ? feelingLabel(profile.parent.feeling) : "No answer"],
      ["Time each week", profile.parent.weeklyTime ? weeklyTimeLabel(profile.parent.weeklyTime) : "No answer"],
    ]} />
  </>;
}

function EventCounts({ s }: { s: ChildStandard }) {
  const e = s.events;
  if (e.right + e.rightWithHelp + e.wrong + e.blank === 0) return <>-</>;
  return <>
    {e.right} right, {e.rightWithHelp} with help, {e.wrong} wrong, {e.blank} blank
    <span className="adm-sub">{e.hints} hints{e.stuckSteps.length > 0 && `; stuck at ${e.stuckSteps.join(", ")}`}{e.mistakes.length > 0 && `; mistakes ${e.mistakes.join(", ")}`}</span>
  </>;
}

/** The test's profile (when the test asked the standard) and each counted event, by its number in the events list. */
function Evidence({ s, numbers }: { s: ChildStandard; numbers: ReadonlyMap<string, number> }) {
  const { assessmentId, events } = s.evidence;
  return <>
    {assessmentId && <Link href={adminProfilePath(assessmentId)}>Test profile</Link>}
    {assessmentId && events.length > 0 && " · "}
    {events.length > 0 && <>Events {events.map((id, i) => <span key={id}>{i > 0 && ", "}<a href={`#${eventAnchor(id)}`}>{numbers.has(id) ? `#${numbers.get(id)}` : id.slice(0, 8)}</a></span>)}</>}
    {!assessmentId && events.length === 0 && "-"}
  </>;
}
