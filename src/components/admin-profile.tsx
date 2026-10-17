// The learner profile of one test (#196, spec #181), for admins: when it was built, each fact the code wrote, in the
// order of the spec, then the parts the AI wrote (#197) with their model ids, then the stored JSON that a workbook
// generator reads. Server components over the stored profile (getProfile).
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BC_SKILL_MAP,
  LATE_DROP_POINTS,
  LATE_THIRD_MIN,
  MISCONCEPTIONS,
  REPORTED_STRAND_NAMES,
  REPORT_TEXT_NAME,
  TOO_FAST_MS,
  type Certainty,
  type LearnerProfile,
  type MisconceptionId,
  type PlanPart,
  type ProfileAi,
  storedProfile,
  type Tally,
} from "@/lib/assessment";
import type { ProfileDetail } from "@/lib/admin-store";
import { adminTestPath, duration, flagText, helpAnswerText, levelText, when } from "@/lib/admin-view";
import { feelingLabel, goalLabel, interestLabel, styleLabel, weeklyTimeLabel } from "@/lib/learning-style";
import { STATUS_LABEL } from "@/lib/report-view";
import { AdminFrame, Chip, Table, gradeAndPlace } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";

const CERTAINTY: Record<Certainty, string> = { clear: "Clear", "early-sign": "Early sign" };
const right = (t: Tally) => `${t.correct} of ${t.total}`;
const misconception = (id: string | null) => (id ? MISCONCEPTIONS[id as MisconceptionId]?.description ?? id : "-");
const yesNo = (value: boolean) => (value ? "Yes" : "No");

const AI_PARTS: Record<keyof ProfileAi, string> = {
  likelyCauses: "Likely cause of each struggle",
  howToHelp: "How to help with each struggle",
  nextChallenge: "Next challenge",
  workbookPlan: "Workbook 1 plan",
};

const STANDARD_TEXT = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s.text]));
/** A BC standard by its code and its text. */
const Standard = ({ code }: { code: string }) => <><span className="adm-mono">{code}</span> {STANDARD_TEXT.get(code) ?? ""}</>;

/** The admin page of one test's profile. A profile stored at another schema version shows as its JSON only. */
export function AdminProfile({ email, detail }: { email: string; detail: ProfileDetail }) {
  const { test: t, stored } = detail;
  const profile = stored ? storedProfile(stored.profile) : null;
  const name = t.child?.first_name ?? "Child";
  return <AdminFrame email={email} section="tests" title={`${name}'s learner profile`}>
    <RecordFacts facts={[
      ["Child", <Link key="child" href={childPath(t.child_id)}>{name}</Link>], ["Test", <Link key="test" href={adminTestPath(t.id)}>Open the test</Link>],
      ["Grade and curriculum", gradeAndPlace(t.grade, t.province)], ["Completed (Pacific)", when(t.completed_at)],
      ["Built (Pacific)", when(stored?.built_at ?? null)], ["First built (Pacific)", when(stored?.created_at ?? null)], ["Schema version", stored?.schema_version ?? "-"],
    ]} />
    {!stored ? <p className="adm-note">No profile is stored for this test. The report job builds it when a test scored against BC finishes.</p>
      : !profile ? <>
        <p className="adm-note">This profile was built at schema version {stored.schema_version}, which this page does not read. The next build of the test replaces it.</p>
        <pre className="adm-typed">{JSON.stringify(stored.profile, null, 2)}</pre>
      </>
      : <ProfileFacts profile={profile} numbers={detail.numbers} name={name} />}
  </AdminFrame>;
}

function ProfileFacts({ profile, numbers, name }: { profile: LearnerProfile; numbers: ReadonlyMap<string, number>; name: string }) {
  const { level, behaviour: b, unknowns: u, facts } = profile;
  return <>
    <p className="adm-note">Written by code from the test unless marked AI. Only answers at or below the school grade make a struggle; rushed wrong answers left out of the score are not counted.</p>

    <h2>1. Level, by area and by BC standard</h2>
    <p>Working level {levelText(level.working)}: {CERTAINTY[level.certainty]}. Confidence {level.confidence}.{level.atCeiling && " At the ceiling of the test."}</p>
    <Table label="Areas" head={["Area", "Own level", "How sure (level)", "Status", "Right", "How sure (status)"]} empty="No areas scored.">
      {profile.strands.map((s) => <tr key={s.strand}><td>{s.name}</td><td>{levelText(s.level)}</td><td>{CERTAINTY[s.levelCertainty]}</td><td>{STATUS_LABEL[s.status]}</td><td>{right(s)}</td><td>{CERTAINTY[s.certainty]}</td></tr>)}
    </Table>
    <Table label="BC standards tested" head={["BC", "Standard", "Area", "Right", "Status", "How sure"]} empty="No standard tested.">
      {profile.standards.map((s) => <tr key={s.code}><td className="adm-mono">{s.code}</td><td className="adm-wide">{s.text}</td><td>{REPORTED_STRAND_NAMES[s.strand]}</td><td>{right(s)}</td><td>{STATUS_LABEL[s.status]}{s.aboveGrade && <span className="adm-sub">Above grade: not a weakness</span>}</td><td>{CERTAINTY[s.certainty]}</td></tr>)}
    </Table>

    <h2>2. Strengths</h2>
    {profile.strengths.length ? <ul className="adm-list">{profile.strengths.map((s) => <li key={s.code}><span className="adm-mono">{s.code}</span> {s.text} ({right(s)}, {CERTAINTY[s.certainty]})</li>)}</ul> : <p className="adm-note">No secure standard.</p>}

    <h2>3. Struggles</h2>
    {profile.struggles.length === 0 ? <p className="adm-note">No struggle at or below the school grade.</p> : profile.struggles.map((s) => <section key={s.code}>
      <h3><span className="adm-mono">{s.code}</span> {s.text}</h3>
      <div className="adm-row"><Chip tone={s.status === "needs-attention" ? "bad" : "warn"}>{STATUS_LABEL[s.status]}</Chip><span>{right(s)} right. {CERTAINTY[s.certainty]}.</span></div>
      <Table label={`Wrong answers, ${s.code}`} head={["Question", "Child answer", "Right answer", "Mistake"]} empty="No wrong answer.">
        {s.wrong.map((x) => <tr key={x.questionId}><td className="adm-wide">{x.prompt}<span className="adm-sub adm-mono">{x.templateId}</span></td><td>{x.response || "Skipped"}</td><td>{x.rightAnswer}</td><td>{misconception(x.misconception)}{x.misconception && <span className="adm-sub adm-mono">{x.misconception}</span>}</td></tr>)}
      </Table>
    </section>)}

    <h2>4. Fact fluency</h2>
    {facts ? <RecordFacts facts={[
      ["Answered", `${facts.correct} of ${facts.answered} right, ${facts.skipped} skipped`], ["Accuracy", facts.accuracy ?? "-"],
      ["Median time", facts.medianMs === null ? "-" : duration(facts.medianMs)], ["Speed", facts.speed ?? "-"],
    ]} /> : <p className="adm-note">No quick facts section.</p>}

    <h2>5. Test behaviour</h2>
    <RecordFacts facts={[
      ["Median thinking time", b.medianMs === null ? "-" : duration(b.medianMs)],
      [`Under ${TOO_FAST_MS / 1000} s`, `${b.veryFast} of ${profile.test.answered}${b.unreliable ? " (reliability note)" : ""}`],
      ["Runs of very fast answers", String(b.rushRuns)], ["Rushed wrong answers left out", String(b.leftOut)],
      ["First third at grade", right(b.thirds.first)], ["Last third at grade", right(b.thirds.last)],
      [`Drop of ${LATE_DROP_POINTS} points or more`, b.thirds.drop === null ? `Not judged (under ${LATE_THIRD_MIN} questions at grade in a third)` : yesNo(b.thirds.drop)],
      ["Whiteboard", `${b.whiteboard.requiredWithWork} of ${b.whiteboard.required} show-your-work questions with work; ${b.whiteboard.optionalWithWork} others with work`],
      ["Read aloud", b.readAloud ? `${b.readAloud.uses} uses on ${b.readAloud.questions} of ${b.readAloud.recorded} questions` : "Not recorded"],
      ["Time away", b.away ? `${b.away.times} times on ${b.away.questions} of ${b.away.recorded} questions, ${duration(b.away.ms)}` : "Not recorded"],
      ["Did anyone help?", helpAnswerText(b.help.answer)], ["Help likely", yesNo(b.help.likely)],
    ]} />
    {b.help.flags.length > 0 && <ul className="adm-list">{b.help.flags.map((f, i) => <li key={i}>{flagText(f, numbers)}</li>)}</ul>}

    <h2>6. Learning preferences and interests</h2>
    <RecordFacts facts={[
      ["Learns best from", profile.preferences.styles.length ? profile.preferences.styles.map(styleLabel).join("; ") : "No answer"],
      ["Interests", profile.preferences.interests.length ? profile.preferences.interests.map(interestLabel).join(", ") : "No answer"],
    ]} />

    <h2>7. What we do not know</h2>
    <p>Early signs: {[u.earlySigns.level && "the working level", ...u.earlySigns.strands.map((s) => REPORTED_STRAND_NAMES[s])].filter(Boolean).join(", ") || "none"}.</p>
    <h3>Check next</h3>
    {u.checkNext.length ? <ul className="adm-list">{u.checkNext.map((s) => <li key={`${s.reason}-${s.code}`}><span className="adm-mono">{s.code}</span> {s.text} <span className="adm-sub">{s.reason === "confirm-struggle" ? "Confirm the struggle: one more answer could change it" : "Not tested, in an early-sign area"}</span></li>)}</ul> : <p className="adm-note">Nothing to check next.</p>}
    <h3>Standards of grade {profile.test.grade} not tested</h3>
    {u.untested.length ? <ul className="adm-list">{u.untested.map((s) => <li key={s.code}><span className="adm-mono">{s.code}</span> {s.text}</li>)}</ul> : <p className="adm-note">Every standard of the grade was tested.</p>}

    <h2>8. The parent&apos;s answers</h2>
    <RecordFacts facts={[
      ["Main goal", profile.parent.goal ? goalLabel(profile.parent.goal) : "No answer"],
      ["Feeling about math", profile.parent.feeling ? feelingLabel(profile.parent.feeling) : "No answer"],
      ["Time each week", profile.parent.weeklyTime ? weeklyTimeLabel(profile.parent.weeklyTime) : "No answer"],
    ]} />

    <h2>Written by AI</h2>
    <ProfileAiParts ai={profile.ai ?? {}} struggles={profile.struggles.map((s) => s.code)} name={name} />

    <h2>Stored JSON</h2>
    <details><summary>Schema version {profile.schemaVersion}</summary><pre className="adm-typed">{JSON.stringify(profile, null, 2)}</pre></details>
  </>;
}

/**
 * The AI parts (#197), each under its label with the id of the model that wrote it. Code checked every part before it
 * was stored (checkProfileAi); "{name}" in a text is the child's first name.
 */
function ProfileAiParts({ ai, struggles, name }: { ai: ProfileAi; struggles: string[]; name: string }) {
  const named = (text: string) => text.replaceAll(REPORT_TEXT_NAME, name);
  const byStruggle = (texts: Record<string, string>) => <ul className="adm-list">
    {[...struggles.filter((c) => c in texts), ...Object.keys(texts).filter((c) => !struggles.includes(c))].map((code) => <li key={code}><Standard code={code} />: {named(texts[code])}</li>)}
  </ul>;
  const plan = (label: string, part: PlanPart) => <li key={label}>{label}: {part.percent}%{part.standards.length > 0 && <ul>{part.standards.map((code) => <li key={code}><Standard code={code} /></li>)}</ul>}</li>;
  const parts: [keyof ProfileAi, string, ReactNode][] = [];
  if (ai.likelyCauses) parts.push(["likelyCauses", ai.likelyCauses.model, byStruggle(ai.likelyCauses.value)]);
  if (ai.howToHelp) parts.push(["howToHelp", ai.howToHelp.model, byStruggle(ai.howToHelp.value)]);
  if (ai.nextChallenge) parts.push(["nextChallenge", ai.nextChallenge.model, <ul key="next" className="adm-list">{ai.nextChallenge.value.map((code) => <li key={code}><Standard code={code} /></li>)}</ul>]);
  if (ai.workbookPlan) {
    const { review, practise, stretch } = ai.workbookPlan.value;
    parts.push(["workbookPlan", ai.workbookPlan.model, <ul key="plan" className="adm-list">{plan("Review", review)}{plan("Practise", practise)}{plan("Stretch", stretch)}</ul>]);
  }
  if (parts.length === 0) return <p className="adm-note">No part of this profile was written by AI. The AI is off, it failed, or the checks kept none of its parts.</p>;
  return <>
    <p className="adm-note">Each part names the model that wrote it. Code checked every part: its texts use only numbers from the facts, and a next challenge is not a struggle and needs every prerequisite standard secure.</p>
    {parts.map(([key, model, value]) => <section key={key}>
      <h3>{AI_PARTS[key]}</h3>
      <div className="adm-row"><Chip tone="info">AI: {model}</Chip></div>
      {value}
    </section>)}
  </>;
}
