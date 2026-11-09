// The parent's report (#65), in the chosen design (D-087, option A3 "Report card + ruler", #80): a report card across
// the nav width; the header table; the level and the verdict in a grainy colour band with the big K-8 ruler; the
// context (FSA line, comparison); then rows with the title on the left and the content on the right.
// D-305 (round r-report-clarity, option B "answer first"): the answers come first: what the working level means, where
// the child is (secure, gaps to fix, next to learn), what is in workbook 1 (from the real planner), and the next step.
// Then "The details": the areas, the strengths, the gaps and the next topics (each with one of the child's answers and
// the likely cause), number facts and the child's work.
// A server component: only the next step needs JavaScript in the browser (report-next.tsx).
// The words come from src/lib/report-view.ts, which the report email uses too.
import type { CSSProperties, ReactNode } from "react";
import { STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT, gradeLabel, type Certainty as CertaintyValue } from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import { BRAND } from "@/lib/site";
import type { ReportSrc } from "@/lib/next-step";
import { BookCall, ReportNextActions, type NextStepStart } from "@/components/report-next";
import { BOOKING_URL } from "@/lib/contact";
import { LearningStep } from "@/components/learning";
import type { LearningAnswers } from "@/lib/learning-style";
import Link from "next/link";
import {
  AREA_NOTE,
  NEXT_STEP_ANCHOR,
  STATUS_LABEL,
  bookOneView,
  certaintyText,
  comparisonView,
  earlySignNote,
  factsView,
  gapsNote,
  gapsView,
  howWeHelp,
  leftOutLine,
  levelName,
  levelNotes,
  levelSentence,
  metaLine,
  nextNote,
  nextStep,
  nextView,
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
  type StruggleView,
  type TopicResult,
  STRENGTHS_SHOWN,
  STRUGGLES_SHOWN,
  moreCount,
  rulerLevels,
  strengthsNote,
  strengthsView,
  whereNotes,
  whereView,
  workingLevelNote,
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
 * `actionBeside` (#552): the dashboard shows the next step beside the report, so the report ends with the call only.
 */
export function ReportCard({ view, next = NO_NEXT, readOnly = false, nextSlot, newTest = null, actionBeside = false }: { view: ReportView; next?: ReportNextContext; readOnly?: boolean; nextSlot?: ReactNode; newTest?: NewTestOffer | null; actionBeside?: boolean }) {
  return (
    <article className="rpt" aria-labelledby="rpt-title">
      <ReportHeader view={view} />
      <ReportOverall view={view} />
      <ReportContext view={view} newTest={newTest} />
      <ReportWhere view={view} />
      {bookOneView(view) ? <ReportBookOne view={view} /> : <ReportHelp view={view} />}
      {actionBeside ? BOOKING_URL && <Row id="rpt-call" title="Questions"><BookCall childName={view.childName} /></Row> : nextSlot ? <Row id={NEXT_STEP_ANCHOR} title="Next step">{nextSlot}</Row> : readOnly ? <Row id={NEXT_STEP_ANCHOR} title="Next step"><p>{nextStep(view).title}</p></Row> : <ReportNextStep view={view} next={next} />}
      <div className="rpt-details-h" id={DETAILS_ID}>
        <p className="eyebrow">The details</p>
        <p>How we measured, and {view.childName}&apos;s own answers.</p>
      </div>
      <ReportAreas view={view} />
      <ReportStrengths view={view} />
      <ReportGaps view={view} />
      <ReportNextTopics view={view} />
      <ReportNumberFacts view={view} />
      <ReportWork view={view} />
      <p className="rpt-meta">{metaLine(view)}</p>
    </article>
  );
}

const DETAILS_ID = "rpt-details";

/** One report row: the title and a one-line explanation, then the content (D-087). D-305: `early`, the early-sign line. */
function Row({ id, title, note, early, children }: { id: string; title: string; note?: string; early?: string | null; children: ReactNode }) {
  return (
    <section className="rpt-row" aria-labelledby={id}>
      <div className="rpt-row-h">
        <h2 id={id}>{title}</h2>
        {note && <p>{note}</p>}
        {early && <p className="rpt-early">{early}</p>}
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
        <div><dt>School grade</dt><dd>{view.model.level.grade === 0 ? gradeLabel(0) : view.model.level.grade}</dd></div>
        <div><dt>Date</dt><dd>{reportDate(view)}</dd></div>
        <div><dt>Curriculum</dt><dd>{CURRICULA[view.province]}</dd></div>
      </dl>
    </header>
  );
}

/**
 * The big ruler, K-8 (K-9 for a Grade 9 child tested at grade 9, D-158): the working level a filled circle in the
 * verdict colour, the school grade a dashed ring, and the span between them tinted. The circles sit behind the numbers,
 * so each number stays readable. D-156: for a Grade 9 child tested before D-158, grade 9 is past the ruler's end, so the
 * ruler has no ring and no span, and the legend says where the scale stops.
 */
function LevelScale({ view }: { view: ReportView }) {
  const { working, grade } = view.model.level;
  const levels = rulerLevels(view);
  const last = levels[levels.length - 1];
  const onScale = grade <= last;
  const mark = onScale ? grade : working;
  const [lo, hi] = [Math.min(working, mark), Math.max(working, mark)];
  const at = { "--work": working, "--grade": mark, "--lo": lo, "--hi": hi, "--n": levels.length } as CSSProperties;
  const gradeText = `School grade: ${levelName(grade)}${onScale ? "" : ` (the scale stops at ${levelName(last)})`}`;
  return (
    <div className="rpt-scale">
      <div className="rpt-ruler" role="img" aria-label={`Scale from kindergarten to ${levelName(last)}. Working level: ${levelName(working)}. ${gradeText}.`}>
        <div className="rpt-ruler-track" style={at}>
          {lo !== hi && <span className="rpt-ruler-gap" />}
          <span className="rpt-pin is-work" />
          {onScale && <span className="rpt-pin is-grade" />}
          {levels.map((l) => {
            const cls = ["rpt-tick", lo !== hi && l > lo && l <= hi && "is-inside", l === working && "is-work", onScale && l === grade && "is-grade"];
            return <span key={l} className={cls.filter(Boolean).join(" ")}>{l === 0 ? "K" : l}</span>;
          })}
        </div>
      </div>
      <p className="rpt-legend">
        <span className="is-work">Working level: {levelName(working)}</span>
        <span className="is-grade">{gradeText}</span>
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
      {/* D-305: a parent read "working at a grade 5 level" as "only grade 5 work". */}
      <p className="rpt-def"><b>What &ldquo;working level&rdquo; means.</b> {workingLevelNote(view)}</p>
      {levelNotes(view).map((note) => <p key={note} className="rpt-note">{note}</p>)}
      {summary && <p className="rpt-summary">{summary}</p>}
    </section>
  );
}

/**
 * The top of a report, small: the level, the verdict and the ruler, without the certainty, notes or summary. /start shows
 * it for the sample child, as a preview of what the parent gets (D-134).
 */
export function ReportLevelPreview({ view }: { view: ReportView }) {
  return (
    <section className={`rpt-overall rpt-level-preview is-${view.model.howWeHelp}`} aria-label="Sample report">
      <p className="eyebrow">Sample report</p>
      <p className="rpt-level-preview-h">{levelSentence(view)}</p>
      <p className="rpt-verdict">{verdictSentence(view)}</p>
      <LevelScale view={view} />
    </section>
  );
}

// Below the band, side by side: the FSA line (BC, grades 4 and 7) and the comparison for the data stage. Below 100
// eligible children the ruler above is the whole comparison (#101, D-084). D-305: no help warning (#71) any more.
function ReportContext({ view, newTest }: { view: ReportView; newTest: NewTestOffer | null }) {
  const { fsa } = view.model;
  const comparison = comparisonView(view);
  const reliability = reliabilityNote(view, newTest?.state);
  if (!fsa && !comparison && !reliability) return null;
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

/** #198: a list that shows its first `shown` items, and folds the rest under "Show n more" (no JavaScript needed). */
function Folded<T>({ items, shown, className, render }: { items: readonly T[]; shown: number; className: string; render: (item: T) => ReactNode }) {
  const rest = items.slice(shown);
  return (
    <>
      <ul className={className}>{items.slice(0, shown).map(render)}</ul>
      {rest.length > 0 && (
        <details className="rpt-more">
          <summary>Show {moreCount(rest.length)}</summary>
          <ul className={className}>{rest.map(render)}</ul>
        </details>
      )}
    </>
  );
}

/** One BC topic's grade, count and "Clear" (D-305: early signs are said once per section), and where the books take it up. */
function TopicMeta({ topic, cover }: { topic: TopicResult; cover?: string | null }) {
  return (
    <p className="rpt-topic-m">
      <span>{topic.grade}</span><span>{topic.count}</span>
      {topic.sure && <span className={`rpt-sure is-${topic.certainty}`}>{topic.sure}</span>}
      {cover && <span className="rpt-cover">{cover}</span>}
    </p>
  );
}

/** D-305: the BC wording under the plain topic name, small. */
const Bc = ({ topic }: { topic: TopicResult }) => (topic.bc !== topic.title ? <p className="rpt-bc">BC: {topic.bc}</p> : null);

// #198 (spec story 5): the BC topics the child is secure in. Nothing when there are none, or no learner profile.
function ReportStrengths({ view }: { view: ReportView }) {
  const strengths = strengthsView(view);
  if (!strengths) return null;
  return (
    <Row id="rpt-strengths" title="Strengths" note={strengthsNote(view)} early={earlySignNote(view, strengths)}>
      <Folded items={strengths} shown={STRENGTHS_SHOWN} className="rpt-strengths" render={(t) => (
        <li key={t.code}><p className="rpt-topic-t">{t.title}</p><Bc topic={t} /><TopicMeta topic={t} /></li>
      )} />
    </Row>
  );
}

/** One struggle: its topic, the status, one of the child's answers beside the right answer, and the likely cause. */
function Struggle({ view, s }: { view: ReportView; s: StruggleView }) {
  return (
    <li className="rpt-struggle">
      <div className="rpt-struggle-h">
        <h3>{s.title}</h3>
        <span className={`rpt-chip is-${s.status}`}>{STATUS_LABEL[s.status]}</span>
      </div>
      <Bc topic={s} />
      <TopicMeta topic={s} cover={s.cover} />
      <dl className="rpt-answer">
        <div className="is-q"><dt>Question</dt><dd>{s.question}</dd></div>
        <div className="is-wrong"><dt>{view.childName}&apos;s answer</dt><dd>{s.answer}</dd></div>
        <div className="is-right"><dt>Right answer</dt><dd>{s.rightAnswer}</dd></div>
      </dl>
      {s.cause && (
        <div className="rpt-cause">
          <p className="rpt-k">Likely cause</p>
          <p>{s.cause}</p>
        </div>
      )}
    </li>
  );
}

// #198 (spec story 6), D-305: the topics at or below the working level that the child has not mastered, each with one
// of the child's answers, the clear ones first.
function ReportGaps({ view }: { view: ReportView }) {
  const gaps = gapsView(view);
  if (!gaps) return null;
  return (
    <Row id="rpt-struggles" title="Gaps to fix" note={gapsNote(view)} early={earlySignNote(view, gaps)}>
      <Folded items={gaps} shown={STRUGGLES_SHOWN} className="rpt-struggles" render={(s) => <Struggle key={s.code} view={view} s={s} />} />
    </Row>
  );
}

// D-305: the topics above the working level, up to the school grade, that the child has not mastered yet: short cards,
// as they are for later books.
function ReportNextTopics({ view }: { view: ReportView }) {
  const next = nextView(view);
  if (!next) return null;
  return (
    <Row id="rpt-next-topics" title="Next to learn" note={nextNote(view)} early={earlySignNote(view, next)}>
      <ul className="rpt-next-list">
        {next.map((t) => (
          <li key={t.code}>
            <p className="rpt-next-t">{t.title}</p>
            <p className="rpt-next-m"><span className={`rpt-chip is-${t.status}`}>{STATUS_LABEL[t.status]}</span><span>{t.grade}</span><span>{t.count}</span></p>
            <Bc topic={t} />
          </li>
        ))}
      </ul>
    </Row>
  );
}

// D-305: every topic the test asked about, in three groups, before the details.
function ReportWhere({ view }: { view: ReportView }) {
  const where = whereView(view);
  if (!where) return null;
  const notes = whereNotes(view);
  const group = (key: "secure" | "gaps" | "next", items: readonly { title: string; meta: string | null }[]) => items.length > 0 && (
    <div className={`is-${key}`}>
      <p className="rpt-k">{notes[key].title} · {items.length}</p>
      <p className="rpt-glance-d">{notes[key].note}</p>
      <ul>{items.map((t, i) => <li key={i}>{t.title}{t.meta && <span>{t.meta}</span>}</li>)}</ul>
    </div>
  );
  return (
    <Row id="rpt-where" title={`Where ${view.childName} is`} note="Every topic the test asked about, in three groups.">
      <div className="rpt-glance">
        {group("secure", where.secure)}
        {group("gaps", where.gaps)}
        {group("next", where.next)}
      </div>
      <p className="rpt-small rpt-after"><a href={`#${DETAILS_ID}`}>See every answer in the details below ↓</a></p>
    </Row>
  );
}

// D-305: what workbook 1 holds, from the real plan: the main work, the review, the harder problems, and what comes after.
function ReportBookOne({ view }: { view: ReportView }) {
  const book = bookOneView(view);
  if (!book) return null;
  const part = (kind: string, label: string, p: { title: string; grade: string; items: string[]; why?: string | null }) => (
    <div className={`rpt-part is-${kind}`}>
      <p className="rpt-k">{label}</p>
      <h3>{p.title}</h3>
      <p className="rpt-part-g">{p.grade}</p>
      <ul>{p.items.map((item) => <li key={item}>{item}</li>)}</ul>
      {p.why && <p className="rpt-part-why">{p.why}</p>}
    </div>
  );
  return (
    <Row id="rpt-book-one" title={"What's in workbook\u00a01"} note={book.note}>
      <div className="rpt-wb1">
        {part("main", "Main work", { ...book.main, items: book.main.skills })}
        {book.review && part("review", "Review", book.review)}
        {book.challenge && part("stretch", "Challenge", book.challenge)}
      </div>
      <div className="rpt-path">
        <p className="rpt-k">After workbook 1</p>
        <ol>
          {book.path.map((step, i) => (
            <li key={step.title}><i className="rpt-path-n">{i + 1}</i><b>{step.title}</b><span>{step.text}</span></li>
          ))}
        </ol>
        <p className="rpt-small">{book.footnote}</p>
      </div>
    </Row>
  );
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
      {facts.accuracy && (
        <div className="rpt-nf">
          <FactsCard title="Accuracy" measure={facts.accuracy} />
          {/* D-120: grades 1-4 see accuracy only. */}
          {facts.speed && <FactsCard title="Speed" measure={facts.speed} />}
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

// How the books help (by verdict), when the report has no workbook 1 plan (D-305): a family on the waitlist, a report
// without a learner profile, or a plan that failed.
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
      <BookCall childName={view.childName} />
    </Row>
  );
}
