"use client";

// PROTOTYPE ONLY (ticket #60). B - Split desk: the question on the left, a full-height whiteboard on the right,
// always open. Shown work is half the screen on every question, so the child treats it as normal.
import { BREAK_AFTER, CHILD, FACT_SECONDS } from "./data";
import { fmtTime, NumPad, PicSvg, SpeakerIcon } from "./parts";
import { Whiteboard } from "./whiteboard";
import type { VariantProps } from "./index";
import "./variant-b.css";

export function VariantB({ flow, speech }: VariantProps) {
  const { phase } = flow;
  return (
    <div className="vb" data-phase={phase}>
      <header className="vb-top">
        <span className="vb-brand">Unica Learning<b /></span>
        <Progress flow={flow} />
        <span className="vb-count">
          {phase === "q" ? `${flow.index + 1} of ${flow.total}` : phase === "facts" ? "Quick facts" : phase === "break" ? "Halfway" : "Done"}
        </span>
      </header>
      {phase === "q" && <Question flow={flow} speech={speech} />}
      {phase === "break" && <Break flow={flow} />}
      {phase === "facts" && <Facts flow={flow} />}
      {phase === "end" && <End />}
    </div>
  );
}

function Progress({ flow }: Pick<VariantProps, "flow">) {
  const at = flow.phase === "q" ? flow.index : flow.phase === "end" ? flow.total : BREAK_AFTER;
  const seg = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, k) => {
      const i = from + k;
      return <span key={i} className={i < at ? "is-done" : i === at && flow.phase === "q" ? "is-now" : ""} />;
    });
  return (
    <div className="vb-prog" aria-label={`Question ${Math.min(at + 1, flow.total)} of ${flow.total}`}>
      <div className="vb-seg">{seg(0, BREAK_AFTER)}</div>
      <span className={`vb-mid ${at >= BREAK_AFTER ? "is-done" : ""}`} title="Break and quick facts" />
      <div className="vb-seg">{seg(BREAK_AFTER, flow.total)}</div>
    </div>
  );
}

function Question({ flow, speech }: VariantProps) {
  const { q, answer } = flow;
  const required = q.board === "required";
  return (
    <main className="vb-main">
      <section className="vb-left">
        <div className="vb-qrow">
          {speech.supported && (
            <button type="button" className="vb-read" onClick={() => speech.toggle(q.speak)} aria-pressed={speech.speaking} aria-label={speech.speaking ? "Stop reading" : "Read it to me"}>
              <SpeakerIcon on={speech.speaking} size={28} />
            </button>
          )}
          <h1 className="vb-text">{q.text}</h1>
        </div>
        {q.kind === "choice" ? (
          <div className="vb-choices" role="radiogroup" aria-label="Choose one answer">
            {q.choices!.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={answer === c.id} className="vb-choice" onClick={() => flow.setAnswer(c.id)}>
                <span className="vb-dot" aria-hidden />
                {c.pic ? <PicSvg kind={c.pic} size={48} /> : null}
                <span className={c.pic ? "vb-cap" : "vb-big"}>{c.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="vb-num">
            <output className="vb-display" aria-live="polite">
              {q.prefix}
              {answer || <i>Type your answer</i>}
              {answer && q.suffix ? <small>{q.suffix}</small> : null}
            </output>
            <NumPad className="vb-pad" value={answer} onChange={flow.setAnswer} onEnter={flow.next} enterDisabled={!flow.canNext} />
          </div>
        )}
        <div className="vb-next-row">
          <p className="vb-why" aria-live="polite">{flow.needsWork && answer ? "Now show your work on the board →" : ""}</p>
          <button type="button" className="btn vb-next" onClick={flow.next} disabled={!flow.canNext}>
            {flow.index === flow.total - 1 ? "Finish" : "Next"} <span className="arr">→</span>
          </button>
        </div>
      </section>
      <section className={`vb-right ${required ? "is-required" : ""} ${flow.needsWork && answer ? "is-nudge" : ""}`} aria-label="Whiteboard">
        <div className="vb-board-head">
          <span>My work</span>
          {required ? <em>Show your work for this one</em> : <em>Use it if it helps</em>}
        </div>
        <Whiteboard strokes={flow.work.strokes} onStrokes={flow.setStrokes} text={flow.work.text} onText={flow.setText} paper="dots" className="vb-wb" tools="side" hint={required ? "Show how you got your answer" : "Draw or write here"} />
      </section>
    </main>
  );
}

function Break({ flow }: Pick<VariantProps, "flow">) {
  return (
    <main className="vb-main vb-break">
      <section className="vb-left vb-msg">
        <p className="vb-kicker">18 of 36 done</p>
        <h1 className="vb-title">Halfway there, {CHILD.name}.</h1>
        <p className="vb-lead">Take a short break if you want one. Stretch, get some water, then come back.</p>
        <div className="vb-btns">
          <button type="button" className="btn" onClick={() => flow.endBreak(false)}>Keep going <span className="arr">→</span></button>
          <button type="button" className="btn ghost" onClick={() => flow.endBreak(true)}>I am back from my break</button>
        </div>
      </section>
      <section className="vb-right vb-field" aria-hidden>
        <div className="vb-breath"><span>Breathe in</span></div>
      </section>
    </main>
  );
}

function Facts({ flow }: Pick<VariantProps, "flow">) {
  const { f, fact } = flow;
  return (
    <main className="vb-main vb-facts">
      <section className="vb-left vb-msg">
        {!f.started ? (
          <>
            <p className="vb-kicker">Quick facts · 1 minute</p>
            <h1 className="vb-title">How many can you do in one minute?</h1>
            <p className="vb-lead">Type the answer and press Enter. Press Enter to skip one. Just do your best.</p>
            <div className="vb-btns"><button type="button" className="btn" onClick={flow.startFacts}>Start <span className="arr">→</span></button></div>
          </>
        ) : f.done ? (
          <>
            <p className="vb-kicker">Quick facts</p>
            <h1 className="vb-title">Time is up!</h1>
            <p className="vb-lead">You did {f.tried} facts. Next, the second half.</p>
            <div className="vb-btns"><button type="button" className="btn" onClick={flow.endFacts}>Keep going <span className="arr">→</span></button></div>
          </>
        ) : (
          <>
            <div className="vb-clock">
              <span style={{ width: `${(f.left / FACT_SECONDS) * 100}%` }} />
            </div>
            <p className="vb-kicker">{fmtTime(f.left)}</p>
            <p className="vb-fact" aria-live="polite">
              {fact.a} {fact.op === "-" ? "−" : "+"} {fact.b} = <span>{f.entry || "?"}</span>
            </p>
          </>
        )}
      </section>
      <section className="vb-right vb-padside">
        {f.started && !f.done ? <NumPad className="vb-bigpad" value={f.entry} onChange={flow.setFactEntry} onEnter={flow.submitFact} max={2} enterLabel="Enter" /> : <div className="vb-field vb-fill" aria-hidden />}
      </section>
    </main>
  );
}

function End() {
  return (
    <main className="vb-end vb-field">
      <div>
        <p className="vb-kicker">All 36 done</p>
        <h1 className="vb-title">You did it, {CHILD.name}!</h1>
        <p className="vb-lead">Thank you for working so hard. Your report will be emailed to your grown-up shortly.</p>
      </div>
    </main>
  );
}
