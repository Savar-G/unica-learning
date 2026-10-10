"use client";

// PROTOTYPE ONLY (ticket #60). E - School test: the layout children know from school online tests (FSA, EQAO).
// A tool rail (read aloud, whiteboard, bigger text), a question map for the part, and Back / Next.
// The child can skip and come back within a part; the end of a part lists skipped questions first.
import { useState } from "react";
import { BREAK_AFTER, CHILD } from "./data";
import { fmtTime, NumPad, PicSvg, SpeakerIcon } from "./parts";
import { Whiteboard, PenIcon } from "./whiteboard";
import { hasWork } from "./flow";
import type { VariantProps } from "./index";
import "./variant-e.css";

export function VariantE({ flow, speech }: VariantProps) {
  const [big, setBig] = useState(false);
  const { phase } = flow;
  const part = phase === "q" ? flow.part : phase === "end" ? 2 : 1;
  return (
    <div className={`ve ${big ? "is-big" : ""}`} data-phase={phase}>
      <header className="ve-head">
        <span className="ve-brand">Unica Learning<b /></span>
        <span className="ve-title">Math placement · {phase === "facts" ? "Quick facts" : `Part ${part} of 2`}</span>
        <span className="ve-who">{CHILD.name}</span>
      </header>
      {phase === "q" && <Question flow={flow} speech={speech} big={big} setBig={setBig} />}
      {phase === "break" && <Break flow={flow} />}
      {phase === "facts" && <Facts flow={flow} />}
      {phase === "end" && <End flow={flow} />}
    </div>
  );
}

function Question({ flow, speech, big, setBig }: VariantProps & { big: boolean; setBig: (b: boolean) => void }) {
  const { q, answer } = flow;
  const required = q.board === "required";
  const [boardOpen, setBoardOpen] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const showBoard = required || boardOpen;
  const last = flow.index === flow.partEnd - 1;
  const skipped = Array.from({ length: flow.partEnd - flow.partStart }, (_, k) => flow.partStart + k).filter((i) => !flow.answers[i] || (flow.questions[i].board === "required" && !hasWork(flow.allWork[i])));

  const onNext = () => {
    if (last && skipped.length && !confirm) return setConfirm(true);
    setConfirm(false);
    flow.next();
  };

  return (
    <div className={`ve-body ${showBoard ? "has-board" : ""}`}>
      <nav className="ve-rail" aria-label="Tools">
        {speech.supported && (
          <button type="button" aria-pressed={speech.speaking} onClick={() => speech.toggle(q.speak)}>
            <SpeakerIcon on={speech.speaking} size={24} />
            <span>{speech.speaking ? "Stop" : "Read aloud"}</span>
          </button>
        )}
        <button type="button" aria-pressed={showBoard} onClick={() => setBoardOpen(!boardOpen)} disabled={required}>
          <PenIcon />
          <span>Whiteboard</span>
        </button>
        <button type="button" aria-pressed={big} onClick={() => setBig(!big)}>
          <span className="ve-aa" aria-hidden>A<small>A</small></span>
          <span>Bigger text</span>
        </button>
      </nav>

      <main className="ve-q">
        <p className="ve-label">Question {flow.index + 1}{required ? <em> · Show your work</em> : null}</p>
        <h1 className="ve-text">{q.text}</h1>
        {q.kind === "choice" ? (
          <div className="ve-choices" role="radiogroup" aria-label="Choose one answer">
            {q.choices!.map((c) => (
              <button key={c.id} type="button" role="radio" aria-checked={answer === c.id} className="ve-choice" onClick={() => flow.setAnswer(c.id)}>
                <span className="ve-letter">{c.id.toUpperCase()}</span>
                {c.pic ? <PicSvg kind={c.pic} size={46} /> : null}
                <span className={c.pic ? "ve-cap" : "ve-big"}>{c.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="ve-num">
            <label className="ve-field">
              <span>Your answer</span>
              <output aria-live="polite">{answer}<i className="ve-caret" />{q.suffix ? <small>{q.suffix}</small> : null}</output>
            </label>
            <NumPad className="ve-pad" value={answer} onChange={flow.setAnswer} keyboard />
          </div>
        )}
      </main>

      {showBoard && (
        <aside className={`ve-board ${required ? "is-required" : ""}`} aria-label="Whiteboard">
          <div className="ve-board-head">
            <span>Whiteboard</span>
            {required ? <em>Needed for this question</em> : <button type="button" onClick={() => setBoardOpen(false)} aria-label="Close whiteboard">×</button>}
          </div>
          <Whiteboard strokes={flow.work.strokes} onStrokes={flow.setStrokes} text={flow.work.text} onText={flow.setText} paper="grid" className="ve-wb" hint="Show your work here" />
        </aside>
      )}

      <footer className="ve-nav">
        <button type="button" className="btn ghost ve-navbtn" onClick={flow.back} disabled={flow.index === flow.partStart}>← Back</button>
        <ol className="ve-map" aria-label={`Part ${flow.part} questions`}>
          {Array.from({ length: flow.partEnd - flow.partStart }, (_, k) => {
            const i = flow.partStart + k;
            const done = !!flow.answers[i] && (flow.questions[i].board !== "required" || hasWork(flow.allWork[i]));
            return (
              <li key={i}>
                <button type="button" className={`${done ? "is-done" : ""} ${i === flow.index ? "is-now" : ""} ${flow.questions[i].board === "required" ? "is-work" : ""}`} onClick={() => flow.goTo(i)} aria-current={i === flow.index ? "step" : undefined} aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}>
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="btn ve-navbtn" onClick={last ? onNext : flow.canNext ? flow.next : () => flow.goTo(flow.index + 1)}>
          {last ? `Finish part ${flow.part}` : flow.canNext ? "Next →" : "Skip for now →"}
        </button>
      </footer>

      {confirm && (
        <div className="ve-confirm" role="alertdialog" aria-label="Questions not finished">
          <p>You have not finished {skipped.length === 1 ? "question" : "questions"} {skipped.map((i) => i + 1).join(", ")}.</p>
          <div>
            <button type="button" className="btn ghost" onClick={() => { setConfirm(false); flow.goTo(skipped[0]); }}>Go to question {skipped[0] + 1}</button>
            <button type="button" className="btn" onClick={onNext}>Finish part {flow.part} anyway</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Break({ flow }: Pick<VariantProps, "flow">) {
  const answered = Object.keys(flow.answers).filter((k) => Number(k) < BREAK_AFTER).length;
  return (
    <main className="ve-panel">
      <p className="ve-label">Part 1 complete</p>
      <h1 className="ve-h">You answered {answered} of {BREAK_AFTER} questions in part 1.</h1>
      <p className="ve-p">You can take a break now. Stand up, stretch, get a drink. Next: quick facts (1 minute), then part 2.</p>
      <div className="ve-steps">
        <span className="is-done">Part 1</span><span className="is-now">Break</span><span>Quick facts</span><span>Part 2</span>
      </div>
      <div className="ve-btns">
        <button type="button" className="btn" onClick={() => flow.endBreak(false)}>Skip break</button>
        <button type="button" className="btn ghost" onClick={() => flow.endBreak(true)}>I took my break</button>
      </div>
    </main>
  );
}

function Facts({ flow }: Pick<VariantProps, "flow">) {
  const { f, fact } = flow;
  return (
    <main className="ve-panel ve-facts">
      <div className="ve-facts-head">
        <p className="ve-label">Quick facts</p>
        <span className={`ve-timer ${f.started && f.left <= 10 ? "is-low" : ""}`}>{fmtTime(f.left)}</span>
      </div>
      {!f.started ? (
        <>
          <h1 className="ve-h">Answer as many facts as you can in 1 minute.</h1>
          <p className="ve-p">Type the answer and press Enter. Press Enter on an empty box to skip.</p>
          <div className="ve-btns"><button type="button" className="btn" onClick={flow.startFacts}>Start timer</button></div>
        </>
      ) : f.done ? (
        <>
          <h1 className="ve-h">Time is up. You answered {f.tried} facts.</h1>
          <div className="ve-btns"><button type="button" className="btn" onClick={flow.endFacts}>Start part 2</button></div>
        </>
      ) : (
        <div className="ve-fact-run">
          <p className="ve-fact" aria-live="polite">{fact.a} {fact.op === "-" ? "−" : "+"} {fact.b} = <span>{f.entry}<i className="ve-caret" /></span></p>
          <NumPad className="ve-pad" value={f.entry} onChange={flow.setFactEntry} onEnter={flow.submitFact} max={2} enterLabel="Enter" />
        </div>
      )}
    </main>
  );
}

function End({ flow }: Pick<VariantProps, "flow">) {
  return (
    <main className="ve-panel">
      <p className="ve-label">Test complete</p>
      <h1 className="ve-h">Well done, {CHILD.name}. You finished the test.</h1>
      <p className="ve-p">You answered {Object.keys(flow.answers).length} of {flow.total} questions. Your report will be emailed to your grown-up shortly.</p>
      <div className="ve-steps">
        <span className="is-done">Part 1</span><span className="is-done">Break</span><span className="is-done">Quick facts</span><span className="is-done">Part 2</span>
      </div>
    </main>
  );
}
