// The parent's report (#65), in the chosen design (D-087, option A3 "Report card + ruler", #80): a report card across
// the nav width; the header table; the level and the verdict in a grainy colour band with the big K-8 ruler; the
// context (FSA line, comparison, help warning); then rows with the title on the left and the content on the right.
// A server component: only the next step needs JavaScript in the browser (report-next.tsx).
// The words come from src/lib/report-view.ts, which the report email uses too.
import type { CSSProperties, ReactNode } from "react";
import { STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT, type Certainty as CertaintyValue } from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import { BRAND } from "@/lib/site";
import type { ReportSrc } from "@/lib/next-step";
import { ReportNextActions, type NextStepStart } from "@/components/report-next";
import { LearningStep } from "@/components/learning";
import type { LearningAnswers } from "@/lib/learning-style";
import Link from "next/link";
import {
  AREA_NOTE,
  NEXT_STEP_ANCHOR,
  STATUS_LABEL,
  certaintyText,
  comparisonView,
  factsView,
  helpWarning,
  howWeHelp,
  leftOutLine,
  levelName,
  levelNotes,
  levelSentence,
  metaLine,
  nextStep,
  reliabilityNote,
  type RetakeState,
  reportDate,
  sharePercent,
  summaryText,
  thresholdsLine,
  verdictSentence,
  workResult,
  type FactsMeasure,
  type ReportView,
} from "@/lib/report-view";
import "./report.css";

const NO_NEXT: ReportNextContext = { src: "account", asked: false, start: { saved: null, joined: false, cancelled: false } };

/**
 * #189: when the child's next test opens, from the account's start rules (D-108), and the button under the reliability
 * note while it is open now.
 */
export interface NewTestOffer {
  state: RetakeState;
  href: string;
  label: string;
}

/**
 * `nextSlot` replaces the next-step row: the public sample report shows its own button there. `newTest` (#189): when the
 * next test opens, and the button under the reliability note; without it the note names no time (the admin's copy).
 */
export function ReportCard({ view, next = NO_NEXT, readOnly = false, nextSlot, newTest = null }: { view: ReportView; next?: ReportNextContext; readOnly?: boolean; nextSlot?: ReactNode; newTest?: NewTestOffer | null }) {
  return (
    <article className="rpt" aria-labelledby="rpt-title">
      <ReportHeader view={view} />
      <ReportOverall view={view} />
      <ReportContext view={view} newTest={newTest} />
      <ReportAreas view={view} />
      <ReportNumberFacts view={view} />
      <ReportWork view={view} />
      <ReportHelp view={view} />
      {nextSlot ? <Row id={NEXT_STEP_ANCHOR} title="Next step">{nextSlot}</Row> : readOnly ? <Row id={NEXT_STEP_ANCHOR} title="Next step"><p>{nextStep(view).title}</p></Row> : <ReportNextStep view={view} next={next} />}
      <p className="rpt-meta">{metaLine(view)}</p>
    </article>
  );
}

/** One report row: the title and a one-line explanation, then the content (D-087). */
function Row({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rpt-row" aria-labelledby={id}>
      <div className="rpt-row-h">
        <h2 id={id}>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      <div className="rpt-row-c">{children}</div>
    </section>
  );
}

function ReportHeader({ view }: { view: ReportView }) {
  return (
    <header className="rpt-head">
      <div>
        <span className="rpt-word">{BRAND}</span>
        <h1 id="rpt-title">Math placement report<span className="sr-only"> for {view.childName}</span></h1>
      </div>
      <dl className="rpt-facts">
        <div><dt>Child</dt><dd>{view.childName}</dd></div>
        <div><dt>School grade</dt><dd>{view.model.level.grade}</dd></div>
        <div><dt>Date</dt><dd>{reportDate(view)}</dd></div>
        <div><dt>Curriculum</dt><dd>{CURRICULA[view.province]}</dd></div>
      </dl>
    </header>
  );
}

const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * The big K-8 ruler: the working level a filled circle in the verdict colour, the school grade a dashed ring, and the
 * span between them tinted. The circles sit behind the numbers, so each number stays readable.
 */
function LevelScale({ view }: { view: ReportView }) {
  const { working, grade } = view.model.level;
  const [lo, hi] = [Math.min(working, grade), Math.max(working, grade)];
  const at = { "--work": working, "--grade": grade, "--lo": lo, "--hi": hi } as CSSProperties;
  return (
    <div className="rpt-scale">
      <div className="rpt-ruler" role="img" aria-label={`Scale from kindergarten to grade 8. Working level: ${levelName(working)}. School grade: ${levelName(grade)}.`}>
        <div className="rpt-ruler-track" style={at}>
          {lo !== hi && <span className="rpt-ruler-gap" />}
          <span className="rpt-pin is-work" />
          <span className="rpt-pin is-grade" />
          {LEVELS.map((l) => {
            const cls = ["rpt-tick", lo !== hi && l > lo && l <= hi && "is-inside", l === working && "is-work", l === grade && "is-grade"];
            return <span key={l} className={cls.filter(Boolean).join(" ")}>{l === 0 ? "K" : l}</span>;
          })}
        </div>
      </div>
      <p className="rpt-legend">
        <span className="is-work">Working level: {levelName(working)}</span>
        <span className="is-grade">School grade: {levelName(grade)}</span>
      </p>
    </div>
  );
}

// The level and the verdict in the grainy colour band with the ruler (D-087). #68: the paragraph the AI wrote from the
// report follows, when there is one; else the plain sentences stand.
function ReportOverall({ view }: { view: ReportView }) {
  const summary = summaryText(view);
  return (
    <section className={`rpt-overall is-${view.model.howWeHelp}`} aria-labelledby="rpt-level">
      <p className="eyebrow">Overall</p>
      <h2 id="rpt-level">{levelSentence(view)}</h2>
      <p className="rpt-verdict">{verdictSentence(view)}</p>
      <Certainty view={view} certainty={view.model.level.certainty} lead="How sure:" />
      <LevelScale view={view} />
      {levelNotes(view).map((note) => <p key={note} className="rpt-note">{note}</p>)}
      {summary && <p className="rpt-summary">{summary}</p>}
    </section>
  );
}

// Below the band, side by side: the FSA line (BC, grades 4 and 7), the comparison for the data stage, and the help
// warning (#71). Below 100 eligible children the ruler above is the whole comparison (#101, D-084).
function ReportContext({ view, newTest }: { view: ReportView; newTest: NewTestOffer | null }) {
  const { fsa } = view.model;
  const warning = helpWarning(view, newTest?.state);
  const comparison = comparisonView(view);
  const reliability = reliabilityNote(view, newTest?.state);
  if (!fsa && !warning && !comparison && !reliability) return null;
  return (
    <div className="rpt-context">
      {reliability && (
        // #189: first, because it says how far to trust everything else on the report.
        <aside className="rpt-help-warning rpt-reliability" aria-labelledby="rpt-reliability">
          <h2 id="rpt-reliability">{reliability.title}</h2>
          <p>{reliability.text}</p>
          <p>{reliability.offer}</p>
          {newTest?.state.kind === "open" && <p className="rpt-reliability-go"><Link className="btn" href={newTest.href}>{newTest.label}</Link></p>}
        </aside>
      )}
      {fsa && (
        <aside className="rpt-fsa" aria-label="For context">
          <p className="rpt-k">For context</p>
          <p>{fsa.text}</p>
          <p className="rpt-source">Source: <a href={fsa.source.url} target="_blank" rel="noopener noreferrer">{fsa.source.name}</a></p>
        </aside>
      )}
      {comparison && (
        <aside className="rpt-fsa" aria-label={comparison.title}>
          <p className="rpt-k">{comparison.title}</p>
          <p>{comparison.text}</p>
          <p className="rpt-source">{comparison.note}</p>
        </aside>
      )}
      {warning && (
        <aside className="rpt-help-warning" aria-labelledby="rpt-help-warning">
          <h2 id="rpt-help-warning">{warning.title}</h2>
          <p>{warning.text}</p>
          <p>{warning.retake}</p>
        </aside>
      )}
    </div>
  );
}

/** The meter's zones, in proportion to the thresholds: Needs attention, Developing, Secure. */
const ZONES = {
  gridTemplateColumns: `${STRAND_DEVELOPING_PERCENT}fr ${STRAND_SECURE_PERCENT - STRAND_DEVELOPING_PERCENT}fr ${100 - STRAND_SECURE_PERCENT}fr`,
};

function ReportAreas({ view }: { view: ReportView }) {
  return (
    <Row id="rpt-areas" title="By area" note="The marker shows the share right. The zones show where Developing and Secure start.">
      <table className="rpt-areas">
        <thead>
          <tr><th scope="col">Area</th><th scope="col" className="rpt-m">Share right</th><th scope="col">Result</th><th scope="col" className="rpt-count">Questions right</th></tr>
        </thead>
        <tbody>
          {view.model.strands.map((s) => (
            <tr key={s.strand}>
              <th scope="row">{s.name}<span>{AREA_NOTE[s.strand]}</span></th>
              <td className="rpt-m">
                <span className="rpt-meter" style={{ ...ZONES, "--at": `${sharePercent(s)}%` } as CSSProperties} aria-hidden="true"><i /><i /><i /></span>
              </td>
              <td>
                <span className={`rpt-chip is-${s.status}`}>{STATUS_LABEL[s.status]}</span>
                <Certainty view={view} certainty={s.certainty} />
              </td>
              <td className="rpt-count">{s.correct} of {s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rpt-zones" aria-hidden="true">
        <span className="is-needs-attention">{STATUS_LABEL["needs-attention"]}</span>
        <span className="is-developing">{STATUS_LABEL.developing}</span>
        <span className="is-secure">{STATUS_LABEL.secure}</span>
      </p>
      <p className="rpt-small">{thresholdsLine(view)}</p>
      {leftOutLine(view) && <p className="rpt-small">{leftOutLine(view)}</p>}
    </Row>
  );
}

/** #189: how sure one result is, under its status: a filled dot for Clear, a ring for an early sign. Nothing before #189. */
function Certainty({ view, certainty, lead }: { view: ReportView; certainty: CertaintyValue | undefined; lead?: string }) {
  const text = certaintyText(view, certainty);
  if (!text) return null;
  return <span className={`rpt-sure is-${certainty}`}>{lead && <span className="rpt-sure-lead">{lead} </span>}{text}</span>;
}

/** Needs practice in sunflower, like Developing; never the tangerine of Needs attention. */
const factsChip = (label: string) => `rpt-chip ${label === "Needs practice" ? "is-developing" : "is-secure"}`;

function FactsCard({ title, measure }: { title: string; measure: FactsMeasure }) {
  return (
    <div>
      <p className="rpt-k">{title}</p>
      <p className="rpt-nf-v">{measure.big}</p>
      <p className="rpt-nf-d">{measure.detail}</p>
      <span className={factsChip(measure.label)}>{measure.label}</span>
    </div>
  );
}

// Number facts (#70): accuracy beside speed, never speed alone. Nothing when the child had no facts section.
function ReportNumberFacts({ view }: { view: ReportView }) {
  const facts = factsView(view);
  if (!facts) return null;
  return (
    <Row id="rpt-facts-title" title="Number facts" note={facts.round}>
      {facts.accuracy && facts.speed && (
        <div className="rpt-nf">
          <FactsCard title="Accuracy" measure={facts.accuracy} />
          <FactsCard title="Speed" measure={facts.speed} />
        </div>
      )}
      {facts.note && <p className="rpt-nf-note">{facts.note}</p>}
      <p className="rpt-small">{facts.scope} {facts.thresholds}</p>
    </Row>
  );
}

// The child's work (#67, D-087): up to three pieces from the whiteboard, each with its question and whether the answer
// was right. The drawing loads from a short-lived signed URL; typed working shows as text. The AI comment (#68) shows
// only when the review is sure; otherwise the work shows alone. Nothing when the child showed no work.
function ReportWork({ view }: { view: ReportView }) {
  const work = view.model.work ?? [];
  if (work.length === 0) return null;
  const name = view.childName;
  return (
    <Row id="rpt-work" title={`${name}'s work`} note="Shown on the whiteboard during the test, exactly as written.">
      <ul className="rpt-work">
        {work.map((w) => {
          const url = w.image ? view.workImages?.[w.image] : undefined;
          return (
            <li key={w.questionId}>
              <figure>
                <p className="rpt-work-q">{w.prompt}</p>
                <div className="rpt-work-board">
                  {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url && <img src={url} alt={`${name}'s drawing for: ${w.prompt}`} />}
                  {w.image && !url && <p className="rpt-work-missing">The drawing did not load. Reload the page to see it.</p>}
                  {w.text && <p className="rpt-work-text"><span className="sr-only">Typed working: </span>{w.text}</p>}
                </div>
                <figcaption>
                  <p className={`rpt-work-a ${w.correct ? "is-right" : "is-wrong"}`}>{workResult(w.correct)}</p>
                  {w.comment && <p className="rpt-work-comment">{w.comment}</p>}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </Row>
  );
}

function ReportHelp({ view }: { view: ReportView }) {
  const help = howWeHelp(view);
  return (
    <Row id="rpt-help" title="How we help">
      <h3>{help.title}</h3>
      <p className="rpt-help-text">{help.text}</p>
    </Row>
  );
}

/** The next step's state on the report page (#66): where the parent came from, and what they did before. */
export interface ReportNextContext {
  src: ReportSrc;
  /** The parent came from the email's link to this step. */
  asked: boolean;
  start: NextStepStart;
  /** How the child learns (#126), asked above the plan choice. Absent on read-only reports. */
  learning?: { childId: string; start: LearningAnswers | null };
}

// The learning questions (#126), then the plan choice (BC) or the one-click waitlist (#66), on a colour field. The
// buttons need the browser; the words come from nextStep.
function ReportNextStep({ view, next }: { view: ReportView; next: ReportNextContext }) {
  const step = nextStep(view);
  const { learning, ...actions } = next;
  return (
    <Row id={NEXT_STEP_ANCHOR} title="Next step">
      {learning && <LearningStep childId={learning.childId} name={view.childName} start={learning.start} place="report" />}
      <ReportNextActions reportId={view.id} step={step} childName={view.childName} province={view.province} {...actions} />
    </Row>
  );
}
