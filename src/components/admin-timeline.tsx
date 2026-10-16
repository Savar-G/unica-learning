// The answer timeline in the admin view of one test (#184): each question as the child saw it (the words, the figure,
// the choices in their order, the template and the BC standard) beside what happened on it (the server's serve and
// arrival times, the thinking time the browser measured, the answer changes, the read-aloud uses and the time away from
// the tab). Answers stored before #184 say "Not recorded". The figures are the test screen's own (test-figures.tsx).
import { duration, levelText, whenExact, type AnswerLine, type ShownLine } from "@/lib/admin-view";
import { Chip } from "@/components/admin";
import { RecordFacts } from "@/components/admin-records";
import { BarGraph, ChoiceFace, PromptText } from "@/components/test-figures";
import "./admin-timeline.css";

const NOT_RECORDED = "Not recorded";
const times = (n: number) => `${n} ${n === 1 ? "time" : "times"}`;

function changesText({ changes }: AnswerLine["timeline"]): string {
  if (changes === null) return NOT_RECORDED;
  if (changes.length === 0) return "None";
  return changes.map((c) => `${c.value === "" ? "(empty)" : c.value} at ${duration(c.atMs)}`).join(", ");
}

function readAloudText({ readAloud }: AnswerLine["timeline"]): string {
  if (readAloud === null) return NOT_RECORDED;
  if (readAloud.count === 0) return "Not used";
  const more = readAloud.count > readAloud.atMs.length ? " (first times only)" : "";
  return `${times(readAloud.count)}, at ${readAloud.atMs.map(duration).join(", ")}${more}`;
}

function awayText({ away }: AnswerLine["timeline"]): string {
  if (away === null) return NOT_RECORDED;
  if (away.count === 0) return "None";
  return `${times(away.count)}, ${duration(away.ms)} in total`;
}

/** The counts for the answers table: "-" when the answer has no timeline. */
export const changeCount = (line: AnswerLine) => (line.timeline.changes === null ? "-" : String(line.timeline.changes.length));
export const readAloudCount = (line: AnswerLine) => (line.timeline.readAloud === null ? "-" : String(line.timeline.readAloud.count));
export const awayCount = (line: AnswerLine) =>
  line.timeline.away === null ? "-" : line.timeline.away.count === 0 ? "0" : `${line.timeline.away.count} · ${duration(line.timeline.away.ms)}`;

/** Each question as the child saw it, with what happened on it. */
export function QuestionTimeline({ lines }: { lines: AnswerLine[] }) {
  if (lines.length === 0) return <p className="adm-empty">No answers yet.</p>;
  return <ol className="adm-work adm-timeline">{lines.map((a) => {
    const t = a.timeline;
    return <li key={a.number} id={`question-${a.number}`}>
      <h3>Question {a.number}</h3>
      <p className="adm-sub">
        {a.stage ? `Stage ${a.stage}` : "Stage -"} · {a.level === null ? "level -" : `level ${levelText(a.level)} / ${a.strand}`} ·{" "}
        <span className="adm-mono">{a.templateId ?? "no template"}</span> · BC {a.standard ?? "-"}
      </p>
      <div className="adm-timeline-q">{a.prompt === null ? <p className="adm-note">The question is not in the stored test ({a.questionId}).</p> : <p><PromptText text={a.prompt} /></p>}
        {a.figure?.kind === "bars" && <BarGraph figure={a.figure} />}
      </div>
      {a.choices ? <ol className="adm-choices" aria-label="Choices in the order shown">{a.choices.map((c) => <li key={c}>
        <ChoiceFace text={c} />
        {c === a.rightAnswer && <Chip tone="ok">Right answer</Chip>}
        {c === a.response && <Chip tone={a.correct ? "ok" : "bad"}>Child&apos;s answer</Chip>}
      </li>)}</ol> : <p>Answer: {a.response || "Skipped"}. Right answer: {a.rightAnswer ?? "-"}. <Chip tone={a.correct ? "ok" : "bad"}>{a.correct ? "Right" : "Wrong"}</Chip></p>}
      <RecordFacts facts={[
        ["Shown (server, Pacific)", whenExact(t.shownAt)],
        ["Answered (server, Pacific)", whenExact(t.answeredAt)],
        ["Time on the server", t.serverMs === null ? "-" : duration(t.serverMs)],
        ["Thinking time (browser)", duration(a.timeMs)],
      ]} />
      <dl className="adm-events">
        <div><dt>Answer changes</dt><dd>{changesText(t)}</dd></div>
        <div><dt>Read aloud</dt><dd>{readAloudText(t)}</dd></div>
        <div><dt>Time away from the tab</dt><dd>{awayText(t)}</dd></div>
      </dl>
    </li>;
  })}</ol>;
}

/** The questions the server served that have no answer yet: where the child stopped. */
export function ShownWithoutAnswer({ lines }: { lines: ShownLine[] }) {
  if (lines.length === 0) return null;
  return <p className="adm-note">Shown with no answer: {lines.map((s) => `question ${s.number} at ${whenExact(s.shownAt)} (Pacific)${s.prompt ? `, "${s.prompt}"` : ""}`).join("; ")}.</p>;
}
