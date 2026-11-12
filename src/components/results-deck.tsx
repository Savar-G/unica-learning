// The results call deck on screen and in print: one 1280 x 720 slide per section, in the order of a results call. The
// words and numbers come from results-deck.ts. Goals are typed on the page before the call and are not saved.
import type { ReactNode } from "react";
import type { DeckChild, ResultsDeck } from "@/lib/results-deck";
import { BRAND } from "@/lib/site";
import "./results-deck.css";

function Mark() {
  return <span className="dk-logo">{BRAND}<i /></span>;
}

const Hi = ({ children }: { children: ReactNode }) => <span className="dk-hi">{children}</span>;

function Slide({ tag, n, eyebrow, title, children }: { tag: string; n: number; eyebrow?: string; title?: ReactNode; children: ReactNode }) {
  return (
    <section className="dk-slide">
      <header className="dk-top"><Mark /><span className="dk-tag"><i />{tag}</span></header>
      {eyebrow && <p className="dk-eyebrow">{eyebrow}</p>}
      {title && <h2 className="dk-title">{title}</h2>}
      <div className="dk-body">{children}</div>
      <footer className="dk-foot"><span>{BRAND}</span><span>{String(n).padStart(2, "0")}</span></footer>
    </section>
  );
}

const HOW_TEST = [
  ["Questions from several grades", "Each test covers several grade levels, so it finds where a child is solid, not just whether they pass one grade."],
  ["Scored by area and BC topic", "Results are split by area and curriculum topic. Their level is where they are solid, not an average."],
  ["Every wrong answer is checked", "Answers are matched to common mistakes, so we see why something went wrong, not only that it did."],
  ["Time on every question", "We measure thinking time and catch rushed answers, so a guess does not count as a gap."],
  ["“I don’t know yet” is an option", "It separates topics they have not learned yet from ones they have misunderstood."],
  ["Facts checked separately", "A short round checks quick recall on its own, so it never changes their level."],
];

const HOW_PICTURES = ["/deck/workbook-cover.jpg", "/deck/practice-page.jpg", "/deck/help-board.jpg", null];

function WhereSlide({ c, n }: { c: DeckChild; n: number }) {
  return (
    <Slide tag={c.name} n={n} eyebrow="Where they start" title={<>{c.name} starts with <Hi>{c.book?.grade ?? c.working}</Hi></>}>
      <ol className="dk-ladder" aria-label="Grades in workbook 1">
        {c.ladder.map((s) => <li key={`${s.state}-${s.label}`} className={`is-${s.state}`}><b>{s.label}</b><span>{s.state === "goal" ? "Goal" : "Workbook 1"}</span></li>)}
      </ol>
      <div className="dk-where">
        <div className="dk-card">
          <p className="dk-k">By area · share right</p>
          {c.areas.map((a) => (
            <div className="dk-area" key={a.name}>
              <span className="dk-area-n">{a.name}</span>
              <span className={`dk-bar is-${a.tone}`}>{a.share !== null && <i style={{ width: `${a.share}%` }} />}</span>
              <span className="dk-area-c">{a.count}</span>
              <span className={`dk-chip is-${a.tone}`}>{a.label}</span>
            </div>
          ))}
        </div>
        <div className="dk-stack">
          <div className="dk-card"><p className="dk-k">Already strong</p><ul className="dk-list is-good">{(c.strong.length ? c.strong : ["We build this list from the test"]).map((t) => <li key={t}>{t}</li>)}</ul></div>
          <div className="dk-card"><p className="dk-k">What we&apos;d fill in first</p><ul className="dk-list">{(c.fill.length ? c.fill : ["No gaps showed on this test"]).map((t) => <li key={t}>{t}</li>)}</ul></div>
        </div>
      </div>
    </Slide>
  );
}

function AnswersSlide({ c, n }: { c: DeckChild; n: number }) {
  return (
    <Slide tag={`${c.name}'s test`} n={n} eyebrow="From the test" title={<>What {c.name}&apos;s answers <Hi>showed us</Hi></>}>
      <div className="dk-answers" data-count={c.answers.length}>
        {c.answers.map((a) => (
          <article className="dk-card dk-answer" key={a.label + a.question}>
            <p className="dk-k">{a.label}</p>
            <p className="dk-q">{a.question}</p>
            <div className="dk-pair">
              <div className="is-bad"><span>Answered</span><b>{a.answer}</b></div>
              <div className="is-ok"><span>Right answer</span><b>{a.rightAnswer}</b></div>
            </div>
            {a.cause && <p className="dk-cause">{a.cause}</p>}
          </article>
        ))}
      </div>
      <p className="dk-band"><b>Working level</b><span>{c.levelNote}</span></p>
    </Slide>
  );
}

function InsideSlide({ c, n }: { c: DeckChild; n: number }) {
  const book = c.book!;
  return (
    <Slide tag={`${c.name}'s workbook 1`} n={n} eyebrow="What's inside" title={<>{c.name}&apos;s first book: <Hi>{book.title}</Hi></>}>
      <div className="dk-card dk-rows">
        {book.rows.map((r, i) => (
          <div className="dk-row" key={r.kind + r.title}>
            <span className={`dk-kind t${i}`}>{r.kind}</span>
            <div><b>{r.title}</b><small>Up to {r.questions} questions</small></div>
            <p>{r.detail}</p>
          </div>
        ))}
      </div>
      <div className="dk-card dk-mix">
        <p className="dk-k">What the book is made of · up to {book.questions} questions · {book.days}</p>
        <div className="dk-mix-bar" role="img" aria-label={book.rows.map((r) => `${r.title} ${r.share}%`).join(", ")}>
          {book.rows.map((r, i) => <i key={r.kind + r.title} className={`t${i}`} style={{ flexGrow: r.share }} />)}
        </div>
        <ul className="dk-mix-key">
          {book.rows.map((r, i) => <li key={r.kind + r.title}><i className={`t${i}`} />{r.title} <b>{r.share}%</b></li>)}
        </ul>
      </div>
    </Slide>
  );
}

function WorkbookSlide({ c, n, placeholder }: { c: DeckChild; n: number; placeholder: boolean }) {
  const book = c.book!;
  return (
    <Slide tag="Workbook 1" n={n}>
      <div className="dk-covers">
        <div className="dk-covers-t">
          <p className="dk-eyebrow">Next step</p>
          <h2 className="dk-title">{c.name}&apos;s<br /><Hi>Workbook 1</Hi></h2>
          <p className="dk-lead">{book.grade} · {book.days}.</p>
          <div className="dk-book-box">
            <p className="dk-k">Made from {c.name}&apos;s assessment</p>
            <p className="dk-why">{book.why ?? `Built from ${c.name}'s own answers.`}</p>
          </div>
        </div>
        <div className="dk-pages">
          {c.pages.length > 0
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed images from private storage
            ? c.pages.map((src, i) => <img key={src} src={src} alt={`Sample page ${i + 1} of ${c.name}'s workbook 1`} />)
            : placeholder
              ? ["Cover", "An early day", "Later in the book"].map((t) => <div className="dk-page-empty" key={t}><b>{t}</b><span>Sample page from {c.name}&apos;s book</span></div>)
              : <article className="dk-book"><header><Mark /><small>Workbook 1</small></header><p className="dk-book-for">Made for {c.name} · {book.grade}</p><h3><Hi>{book.title}</Hi></h3></article>}
        </div>
      </div>
    </Slide>
  );
}

function PathSlide({ c, n }: { c: DeckChild; n: number }) {
  const book = c.book!;
  return (
    <Slide tag={c.name} n={n} eyebrow="After workbook 1" title={<>Where {c.name} <Hi>goes from here</Hi></>}>
      <ol className="dk-path">{book.path.map((s, i) => <li className="dk-card" key={s.title}><i>{i + 1}</i><b>{s.title}</b><p>{s.text}</p></li>)}</ol>
      <p className="dk-band"><b>Our approach</b><span>{book.footnote}</span></p>
    </Slide>
  );
}

export function ResultsDeckView({ deck }: { deck: ResultsDeck }) {
  let n = 1;
  const next = () => ++n;
  const { children: kids, names } = deck;
  const chat = kids.some((c) => c.chat);
  const rushed = kids.reduce((sum, c) => sum + c.rushed, 0);
  return (
    <div className="dk">
      <section className="dk-slide dk-cover">
        <header className="dk-top"><Mark /><span className="dk-tag"><i />Results call</span></header>
        <p className="dk-eyebrow">For {deck.parentName} · {deck.month}</p>
        <h1>{names}&apos;s<br /><Hi>math results</Hi></h1>
        <p className="dk-lead">Where {kids.length > 1 ? "each of them is" : `${names} is`} solid, what we&apos;d fill in first, and how the workbooks move {kids.length > 1 ? "them" : names} forward.</p>
        <footer className="dk-foot"><span>unicalearning.com</span><span>BC curriculum</span></footer>
      </section>

      <Slide tag="Your goals" n={next()} title="What you're hoping for">
        <div className="dk-goals">
          {kids.map((c) => (
            <div className="dk-card" key={c.name}>
              <p className="dk-k">{c.name} · {c.schoolGrade}</p>
              <h3 contentEditable suppressContentEditableWarning data-ph="Type the goal" />
              <p className="dk-goal-t" contentEditable suppressContentEditableWarning data-ph="Add what the parent said when booking" />
            </div>
          ))}
        </div>
      </Slide>

      <Slide tag="How the test works" n={next()} eyebrow="More than a score" title={<>How we found <Hi>{kids.length > 1 ? "their level" : `${names}'s level`}</Hi></>}>
        <div className="dk-how">{HOW_TEST.map(([t, d], i) => <div className="dk-card" key={t}><p className="dk-num">{String(i + 1).padStart(2, "0")}</p><b>{t}</b><p>{d}</p></div>)}</div>
        <div className="dk-stats">
          {kids.map((c) => <div key={c.name}><span>{c.name}</span><b>{c.stats}</b></div>)}
          <div><span>Rushed answers</span><b>{rushed ? `${rushed} left out of the score` : "None"}</b></div>
        </div>
      </Slide>

      {kids.map((c) => (
        <div key={c.name} className="dk-group">
          <WhereSlide c={c} n={next()} />
          {c.answers.length > 0 && <AnswersSlide c={c} n={next()} />}
          {c.book && <InsideSlide c={c} n={next()} />}
          {c.book && <WorkbookSlide c={c} n={next()} placeholder={deck.placeholderPages} />}
          {c.book && <PathSlide c={c} n={next()} />}
        </div>
      ))}

      <Slide tag="How it works" n={next()} title={<>A workbook built <Hi>{kids.length > 1 ? "for each of them" : `for ${names}`}</Hi></>}>
        <div className="dk-steps">
          {[
            ["A workbook in the mail", "Paper practice, built from the results and the BC curriculum."],
            ["Practice every day", "Short daily pages, with a schedule to follow in the book and online."],
            chat ? ["Help when they're stuck", "Children in Grade 3 and up can type to Maya, the AI Teaching Assistant, about a workbook question. They still do the work."] : ["Go over the marks together", "Each marked page can explain the steps on anything they missed."],
            ["Scan, and the next book adapts", "Scan the finished pages with your phone. The next book builds on what they've got."],
          ].map(([t, d], i) => (
            <div key={t}>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed product pictures, sized by the slide */}
              {HOW_PICTURES[i] ? <img className="dk-tile-img" src={HOW_PICTURES[i]} alt="" /> : <span className="dk-tile"><strong>{kids[0].ladder[0].label} → {kids[0].ladder[1].label}</strong><small>Next book moves up</small></span>}
              <b>{t}</b><p>{d}</p>
            </div>
          ))}
        </div>
      </Slide>

      <Slide tag="Getting started" n={next()} eyebrow="If it comes up" title={<>How to <Hi>get started</Hi></>}>
        <div className="dk-start">
          <div className="dk-card"><p className="dk-k">Set up once</p><ol className="dk-num-list">
            <li><b>Sign in</b><span>Go to unicalearning.com/account on your phone or computer.</span></li>
            {chat && <li><b>Set up the AI Teaching Assistant</b><span>Set a PIN for the desk and agree to the notice.</span></li>}
            <li><b>Find the schedule</b><span>At unicalearning.com/account/schedule.</span></li>
          </ol></div>
          <div className="dk-card"><p className="dk-k">Each day</p><ol className="dk-num-list">
            <li><b>Do today&apos;s pages</b><span>The schedule shows which ones.</span></li>
            {chat && <li><b>Stuck? Ask Maya</b><span>From the desk on our website, using the PIN.</span></li>}
            <li><b>Scan the finished pages</b><span>At unicalearning.com/account/scan.</span></li>
            <li><b>Go over the marks together</b><span>Tap &ldquo;Explain this problem&rdquo; on anything they missed.</span></li>
          </ol></div>
        </div>
      </Slide>
    </div>
  );
}
