"use client";

// PROTOTYPE ONLY (ticket #60). A - Workbook page: each question is one printed page of a workbook.
// Question, answer and a squared working space share the page; progress is the page number.
import { CHILD, FACT_SECONDS } from "./data";
import { fmtTime, NumPad, PicSvg, SpeakerIcon } from "./parts";
import { Whiteboard } from "./whiteboard";
import type { VariantProps } from "./index";
import "./variant-a.css";

export function VariantA({ flow, speech }: VariantProps) {
  const { phase } = flow;
  return (
    <div className="va">
      <article className="va-page" key={phase === "q" ? `q${flow.index}` : phase}>
        <header className="va-head">
          <span className="va-brand">Unica Learning · {CHILD.name}&apos;s math check</span>
          <span className="va-pageno">
            {phase === "q" && <>Page {flow.index + 1} of {flow.total}</>}
            {phase === "break" && <>Halfway</>}
            {phase === "facts" && <>Quick facts</>}
            {phase === "end" && <>Last page</>}
          </span>
        </header>
        {phase === "q" && <Question flow={flow} speech={speech} />}
        {phase === "break" && <Break flow={flow} />}
        {phase === "facts" && <Facts flow={flow} />}
        {phase === "end" && <End />}
        <div className="va-line" aria-hidden>
          <span style={{ width: `${phase === "end" ? 100 : ((phase === "q" ? flow.index : 18) / flow.total) * 100}%` }} />
        </div>
      </article>
    </div>
  );
}

function Question({ flow, speech }: VariantProps) {
  const { q, answer } = flow;
  return (
    <>
      <div className="va-body" data-kind={q.kind}>
        <section className="va-q">
          <span className="va-num">{flow.index + 1}</span>
          <div>
            <h1 className="va-text">{q.text}</h1>
            {speech.supported && (
              <button type="button" className="va-read" onClick={() => speech.toggle(q.speak)} aria-pressed={speech.speaking}>
                <SpeakerIcon on={speech.speaking} /> {speech.speaking ? "Stop" : "Read it to me"}
              </button>
            )}
          </div>
        </section>

        <section className="va-ans" aria-label="Your answer">
          {q.kind === "choice" ? (
            <div className="va-choices" role="radiogroup" aria-label="Choose one answer">
              {q.choices!.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={answer === c.id} className="va-choice" onClick={() => flow.setAnswer(c.id)}>
                  <span className="va-letter">{c.id}</span>
                  {c.pic ? <PicSvg kind={c.pic} size={58} /> : null}
                  <span className={c.pic ? "va-cap" : "va-big"}>{c.label}</span>
                  {answer === c.id && <svg className="va-ring" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden><path d="M8 32C6 12 40 4 62 6s34 14 30 30-40 22-62 18S10 44 12 26" /></svg>}
                </button>
              ))}
            </div>
          ) : (
            <div className="va-numans">
              <div className="va-answer-line">
                <span>Answer:</span>
                {q.prefix}
                <output className="va-box" aria-live="polite">{answer || <i>?</i>}</output>
                {q.suffix && <span className="va-suffix">{q.suffix}</span>}
              </div>
              <NumPad className="va-pad" value={answer} onChange={flow.setAnswer} onEnter={flow.next} enterDisabled={!flow.canNext} />
            </div>
          )}
        </section>

        <section className="va-work" aria-label="Working space">
          <div className="va-work-head">
            <span>Show your work</span>
            {q.board === "required" ? <em className="va-need">Needed for this question</em> : <em>If it helps</em>}
          </div>
          <Whiteboard strokes={flow.work.strokes} onStrokes={flow.setStrokes} text={flow.work.text} onText={flow.setText} paper="grid" className="va-wb" hint={q.board === "required" ? "Show how you got your answer" : "Space for working"} tools="bottom" />
        </section>
      </div>
      <footer className="va-foot">
        <p className="va-why" aria-live="polite">{flow.needsWork && answer ? "Show your work in the box, then turn the page." : ""}</p>
        <button type="button" className="btn va-next" onClick={flow.next} disabled={!flow.canNext}>
          {flow.index === flow.total - 1 ? "Finish" : "Next page"} <span className="arr">→</span>
        </button>
      </footer>
    </>
  );
}

function Break({ flow }: Pick<VariantProps, "flow">) {
  return (
    <div className="va-center">
      <p className="va-kicker">Page 18 done. Half the book is finished.</p>
      <h1 className="va-title">Time for a short break.</h1>
      <ul className="va-list">
        <li>Stand up and stretch your arms.</li>
        <li>Get a drink of water.</li>
        <li>Come back when you are ready.</li>
      </ul>
      <div className="va-row">
        <button type="button" className="btn ghost" onClick={() => flow.endBreak(true)}>I had my break</button>
        <button type="button" className="btn" onClick={() => flow.endBreak(false)}>Keep going <span className="arr">→</span></button>
      </div>
    </div>
  );
}

function Facts({ flow }: Pick<VariantProps, "flow">) {
  const { f, facts } = flow;
  if (!f.started)
    return (
      <div className="va-center">
        <p className="va-kicker">Quick facts · 1 minute</p>
        <h1 className="va-title">Answer as many as you can.</h1>
        <p className="va-lead">Type each answer and press Enter. If you get stuck, skip it with Enter. No working needed on this page.</p>
        <div className="va-row"><button type="button" className="btn" onClick={flow.startFacts}>Start the minute <span className="arr">→</span></button></div>
      </div>
    );
  if (f.done)
    return (
      <div className="va-center">
        <p className="va-kicker">Quick facts</p>
        <h1 className="va-title">Time is up. Nice work.</h1>
        <p className="va-lead">You answered {f.tried} facts. Now on to the second half.</p>
        <div className="va-row"><button type="button" className="btn" onClick={flow.endFacts}>Next page <span className="arr">→</span></button></div>
      </div>
    );
  const from = Math.max(0, f.index - 3);
  return (
    <div className="va-facts">
      <div className="va-sheet" aria-live="polite">
        {facts.slice(from, f.index + 5).map((x, i) => {
          const n = from + i;
          const now = n === f.index;
          return (
            <div key={n} className={`va-fact ${now ? "is-now" : n < f.index ? "is-done" : ""}`}>
              <span>{x.a} {x.op === "-" ? "−" : "+"} {x.b} =</span>
              <span className="va-fact-box">{now ? f.entry || " " : n < f.index ? f.log[n] || "–" : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="va-facts-side">
        <div className="va-timer"><span style={{ width: `${(f.left / FACT_SECONDS) * 100}%` }} /></div>
        <p className="va-time">{fmtTime(f.left)} left</p>
        <NumPad className="va-pad" value={f.entry} onChange={flow.setFactEntry} onEnter={flow.submitFact} max={2} enterLabel="Enter" />
      </div>
    </div>
  );
}

function End() {
  return (
    <div className="va-center va-end">
      <svg className="va-stamp" viewBox="0 0 120 120" aria-hidden>
        <circle cx="60" cy="60" r="54" />
        <path d="M60 26l9.5 21 22.5 2.5-17 15 5 22-20-11.5-20 11.5 5-22-17-15 22.5-2.5z" />
      </svg>
      <p className="va-kicker">The end</p>
      <h1 className="va-title">Great work, {CHILD.name}. You finished!</h1>
      <p className="va-lead">Your report will be emailed to your grown-up shortly. Go and tell them you are done.</p>
    </div>
  );
}
