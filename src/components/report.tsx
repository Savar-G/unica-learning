// The parent's report (#65): plain sections in the order of the chosen design (D-087, "Report card + ruler"), so the
// report design ticket (#80) can restyle them one at a time. A server component: it needs no JavaScript in the browser.
// The words come from src/lib/report-view.ts, which the report email uses too.
import type { CSSProperties, ReactNode } from "react";
import { STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT } from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import { BRAND } from "@/lib/site";
import type { ReportSrc } from "@/lib/next-step";
import { ReportNextActions, type NextStepStart } from "@/components/report-next";
import {
  NEXT_STEP_ANCHOR,
  STATUS_LABEL,
  factsView,
  helpWarning,
  howWeHelp,
  levelName,
  levelNotes,
  levelSentence,
  metaLine,
  nextStep,
  reportDate,
  sharePercent,
  thresholdsLine,
  verdictSentence,
  workResult,
  type ReportView,
} from "@/lib/report-view";
import "./report.css";

const NO_NEXT: ReportNextContext = { src: "account", asked: false, start: { saved: null, joined: false, cancelled: false } };

export function ReportCard({ view, next = NO_NEXT }: { view: ReportView; next?: ReportNextContext }) {
  return (
    <article className="rpt" aria-labelledby="rpt-title">
      <ReportHeader view={view} />
      <ReportOverall view={view} />
      <ReportContext view={view} />
      <ReportAreas view={view} />
      <ReportNumberFacts view={view} />
      <ReportWork view={view} />
      <ReportHelp view={view} />
      <ReportNextStep view={view} next={next} />
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

/** The K-8 scale: the working level filled in the verdict colour, the school grade in a dashed ring, the gap tinted. */
function LevelScale({ view }: { view: ReportView }) {
  const { working, grade } = view.model.level;
  const [lo, hi] = [Math.min(working, grade), Math.max(working, grade)];
  return (
    <>
      <div className="rpt-ruler" role="img" aria-label={`Scale from kindergarten to grade 8. Working level: ${levelName(working)}. School grade: ${levelName(grade)}.`}>
        {LEVELS.map((l) => {
          const cls = ["rpt-tick", lo !== hi && l >= lo && l <= hi && "is-span", l === lo && "is-lo", l === hi && "is-hi", l === working && "is-work", l === grade && "is-grade"];
          return <span key={l} className={cls.filter(Boolean).join(" ")}><span>{l === 0 ? "K" : l}</span></span>;
        })}
      </div>
      <p className="rpt-legend">
        <span><i className="rpt-key is-work" aria-hidden="true" />Working level: {levelName(working)}</span>
        <span><i className="rpt-key is-grade" aria-hidden="true" />School grade: {levelName(grade)}</span>
      </p>
    </>
  );
}

function ReportOverall({ view }: { view: ReportView }) {
  return (
    <section className={`rpt-overall is-${view.model.howWeHelp}`} aria-labelledby="rpt-level">
      <p className="eyebrow">Overall</p>
      <h2 id="rpt-level">{levelSentence(view)}</h2>
      <p className="rpt-verdict">{verdictSentence(view)}</p>
      <LevelScale view={view} />
      {levelNotes(view).map((note) => <p key={note} className="rpt-note">{note}</p>)}
    </section>
  );
}

// The comparison among Unica children (bands with n from 100 tests per grade, a percentile with n from 400, D-084)
// shows nothing yet: decision of 2026-10-11 on #65, until a ticket decides how a child is ranked. The model keeps the
// stage. Below 100 tests per grade the scale above is the whole comparison. The help warning (#71) comes after it.
function ReportContext({ view }: { view: ReportView }) {
  const { fsa } = view.model;
  const warning = helpWarning(view);
  if (!fsa && !warning) return null;
  return (
    <>
      {fsa && (
        <aside className="rpt-context" aria-label="For context">
          <p className="rpt-k">For context</p>
          <p>{fsa.text}</p>
          <p className="rpt-source">Source: <a href={fsa.source.url} target="_blank" rel="noopener noreferrer">{fsa.source.name}</a></p>
        </aside>
      )}
      {warning && (
        <aside className="rpt-context rpt-help-warning" aria-labelledby="rpt-help-warning">
          <h2 id="rpt-help-warning">{warning.title}</h2>
          <p>{warning.text}</p>
          <p>{warning.retake}</p>
        </aside>
      )}
    </>
  );
}

const ZONES = { "--dev": `${STRAND_DEVELOPING_PERCENT}%`, "--sec": `${STRAND_SECURE_PERCENT}%` };

function ReportAreas({ view }: { view: ReportView }) {
  return (
    <Row id="rpt-areas" title="By area" note="The marker shows the share right. The zones show where Developing and Secure start.">
      <table className="rpt-areas">
        <thead>
          <tr><th scope="col">Area</th><th scope="col" className="rpt-m">Share right</th><th scope="col">Result</th><th scope="col">Questions right</th></tr>
        </thead>
        <tbody>
          {view.model.strands.map((s) => (
            <tr key={s.strand}>
              <th scope="row">{s.name}</th>
              <td className="rpt-m"><span className="rpt-meter" style={{ ...ZONES, "--at": `${sharePercent(s)}%` } as CSSProperties} aria-hidden="true" /></td>
              <td><span className={`rpt-chip is-${s.status}`}>{STATUS_LABEL[s.status]}</span></td>
              <td className="rpt-count">{s.correct} of {s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rpt-small">{thresholdsLine(view)}</p>
    </Row>
  );
}

/** Needs practice in sunflower, like Developing; never the tangerine of Needs attention. */
const factsChip = (label: string) => `rpt-chip ${label === "Needs practice" ? "is-developing" : "is-secure"}`;

// Number facts (#70): accuracy beside speed, never speed alone. Nothing when the child had no facts section.
function ReportNumberFacts({ view }: { view: ReportView }) {
  const facts = factsView(view);
  if (!facts) return null;
  return (
    <Row id="rpt-facts-title" title="Number facts" note={facts.round}>
      {facts.accuracy && facts.speed && (
        <div className="rpt-nf">
          <div>
            <p className="rpt-k">Accuracy</p>
            <p className="rpt-nf-v">{facts.accuracy.value}</p>
            <span className={factsChip(facts.accuracy.label)}>{facts.accuracy.label}</span>
          </div>
          <div>
            <p className="rpt-k">Speed</p>
            <p className="rpt-nf-v">{facts.speed.value}</p>
            <span className={factsChip(facts.speed.label)}>{facts.speed.label}</span>
          </div>
        </div>
      )}
      {facts.note && <p>{facts.note}</p>}
      <p className="rpt-small">{facts.scope} {facts.thresholds}</p>
    </Row>
  );
}

// The child's work (#67, D-087): up to three pieces from the whiteboard, each with its question and whether the answer
// was right. The drawing loads from a short-lived signed URL; typed working shows as text. #68 adds the comments, shown
// only when the review is sure. Nothing when the child showed no work.
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
                <div className="rpt-work-board">
                  {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {url && <img src={url} alt={`${name}'s drawing for: ${w.prompt}`} />}
                  {w.image && !url && <p className="rpt-work-missing">The drawing did not load. Reload the page to see it.</p>}
                  {w.text && <p className="rpt-work-text"><span className="sr-only">Typed working: </span>{w.text}</p>}
                </div>
                <figcaption>
                  <p className="rpt-work-q">{w.prompt}</p>
                  <span className={`rpt-chip ${w.correct ? "is-secure" : "is-plain"}`}>{workResult(w.correct)}</span>
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
      <p>{help.text}</p>
    </Row>
  );
}

/** The next step's state on the report page (#66): where the parent came from, and what they did before. */
export interface ReportNextContext {
  src: ReportSrc;
  /** The parent came from the email's link to this step. */
  asked: boolean;
  start: NextStepStart;
}

// The plan choice (BC) or the one-click waitlist (#66). The buttons need the browser; the words come from nextStep.
function ReportNextStep({ view, next }: { view: ReportView; next: ReportNextContext }) {
  const step = nextStep(view);
  return (
    <Row id={NEXT_STEP_ANCHOR} title="Next step">
      <ReportNextActions reportId={view.id} step={step} childName={view.childName} province={view.province} {...next} />
    </Row>
  );
}
