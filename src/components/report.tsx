// The parent's report (#65): plain sections in the order of the chosen design (D-087, "Report card + ruler"), so the
// report design ticket (#80) can restyle them one at a time. A server component: it needs no JavaScript in the browser.
// The words come from src/lib/report-view.ts, which the report email uses too.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT } from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import { BRAND } from "@/lib/site";
import {
  STATUS_LABEL,
  factsView,
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
  type ReportView,
} from "@/lib/report-view";
import "./report.css";

export function ReportCard({ view }: { view: ReportView }) {
  return (
    <article className="rpt" aria-labelledby="rpt-title">
      <ReportHeader view={view} />
      <ReportOverall view={view} />
      <ReportContext view={view} />
      <ReportAreas view={view} />
      <ReportNumberFacts view={view} />
      <ReportWork view={view} />
      <ReportHelp view={view} />
      <ReportNextStep view={view} />
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
// stage. Below 100 tests per grade the scale above is the whole comparison. The help warning (#71) comes here too.
function ReportContext({ view }: { view: ReportView }) {
  const { fsa } = view.model;
  if (!fsa) return null;
  return (
    <aside className="rpt-context" aria-label="For context">
      <p className="rpt-k">For context</p>
      <p>{fsa.text}</p>
      <p className="rpt-source">Source: <a href={fsa.source.url} target="_blank" rel="noopener noreferrer">{fsa.source.name}</a></p>
    </aside>
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

// #67 adds the work images and #68 the comments (shown only when the review is sure). Until then there is no work.
function ReportWork({ view }: { view: ReportView }) {
  if (view.model.work.length === 0) return null;
  return (
    <Row id="rpt-work" title={`${view.childName}'s work`} note="Shown on the whiteboard during the test, exactly as written.">
      <ul className="rpt-work">
        {view.model.work.map((w) => <li key={w.questionId}>{w.comment && <p>{w.comment}</p>}</li>)}
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

function ReportNextStep({ view }: { view: ReportView }) {
  const step = nextStep(view);
  return (
    <Row id="rpt-next" title="Next step">
      <div className={`rpt-next is-${step.kind}`}>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <Link className="btn" href={step.action.href}>{step.action.label} <span className="arr">→</span></Link>
      </div>
    </Row>
  );
}
