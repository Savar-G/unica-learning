"use client";

// PROTOTYPE ONLY (ticket #60). C - One big thing: one huge question and huge answer tiles, nothing else.
// The whiteboard is a full-screen sheet the child opens; on a "show your work" question it opens as step 2.
import { useEffect, useState } from "react";
import { CHILD, FACT_SECONDS } from "./data";
import { fmtTime, NumPad, PicSvg, SpeakerIcon } from "./parts";
import { Whiteboard } from "./whiteboard";
import { hasWork } from "./flow";
import type { VariantProps } from "./index";
import "./variant-c.css";

const TILE = ["c-sun", "c-sky", "c-tang", "c-leaf"];

export function VariantC({ flow, speech }: VariantProps) {
  const { phase } = flow;
  const pct = phase === "end" ? 100 : ((phase === "q" ? flow.index : 18) / flow.total) * 100;
  return (
    <div className="vc" data-phase={phase}>
      <div className="vc-bar" aria-hidden><span style={{ width: `${pct}%` }} /></div>
      {phase === "q" && <Question flow={flow} speech={speech} key={flow.index} />}
      {phase === "break" && <Break flow={flow} />}
      {phase === "facts" && <Facts flow={flow} />}
      {phase === "end" && <End />}
    </div>
  );
}

function Question({ flow, speech }: VariantProps) {
  const { q, answer } = flow;
  const [sheet, setSheet] = useState(false);
  const [auto, setAuto] = useState(false);
  const required = q.board === "required";
  const worked = hasWork(flow.work);

  // "read every question" reads each new question by itself
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => speech.speak(q.speak), 300);
    return () => window.clearTimeout(t);
  }, [auto, q.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const primary = () => (required && !worked ? setSheet(true) : flow.next());
  const primaryLabel = required && !worked ? "Next: show your work" : flow.index === flow.total - 1 ? "Finish" : "Next";

  return (
    <main className="vc-main">
      <div className="vc-read-row">
        {speech.supported && (
          <>
            <button type="button" className="vc-read" onClick={() => speech.toggle(q.speak)} aria-pressed={speech.speaking}>
              <SpeakerIcon on={speech.speaking} size={30} />
              <span>{speech.speaking ? "Stop" : "Read it to me"}</span>
            </button>
            <label className="vc-auto">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Read every question
            </label>
          </>
        )}
      </div>
      <h1 className="vc-text">{q.text}</h1>

      {q.kind === "choice" ? (
        <div className="vc-tiles" role="radiogroup" aria-label="Choose one answer">
          {q.choices!.map((c, i) => (
            <button key={c.id} type="button" role="radio" aria-checked={answer === c.id} className={`vc-tile ${TILE[i]}`} onClick={() => flow.setAnswer(c.id)}>
              {c.pic ? <PicSvg kind={c.pic} size={70} /> : null}
              <span className={c.pic ? "vc-cap" : "vc-big"}>{c.label}</span>
              <span className="vc-tick" aria-hidden>✓</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="vc-num">
          <output className="vc-display" aria-live="polite">
            {answer || <span className="vc-blank" />}
            {answer && q.suffix ? <small>{q.suffix}</small> : null}
          </output>
          <NumPad className="vc-pad" value={answer} onChange={flow.setAnswer} onEnter={primary} enterDisabled={!answer} keyboard={!sheet} />
        </div>
      )}

      <div className="vc-foot">
        <button type="button" className="vc-work-btn" onClick={() => setSheet(true)}>
          {worked ? "✎ My work (saved)" : required ? "✎ Show my work" : "✎ Need to work it out?"}
        </button>
        <button type="button" className="btn vc-next" onClick={primary} disabled={!answer}>
          {primaryLabel} <span className="arr">→</span>
        </button>
      </div>
      <p className="vc-count">{flow.index + 1} / {flow.total}</p>

      {sheet && (
        <div className="vc-sheet" role="dialog" aria-modal="true" aria-label="Show your work">
          <div className="vc-sheet-top">
            <div>
              <p className="vc-sheet-q">{q.text}</p>
              <p className="vc-sheet-a">{answer ? <>My answer: <b>{q.kind === "choice" ? q.choices!.find((c) => c.id === answer)?.label : answer}{q.suffix && q.kind === "number" ? ` ${q.suffix}` : ""}</b></> : "Work it out here, then pick your answer."}</p>
            </div>
            <button type="button" className="btn vc-done" onClick={() => (required && worked && answer ? (setSheet(false), flow.next()) : setSheet(false))} disabled={required && !worked && !!answer}>
              {required && answer ? "Done, next question" : "Done"} <span className="arr">→</span>
            </button>
          </div>
          <Whiteboard strokes={flow.work.strokes} onStrokes={flow.setStrokes} text={flow.work.text} onText={flow.setText} paper="plain" className="vc-wb" hint={required ? "Show how you got your answer" : "Work it out here"} tools="top" />
        </div>
      )}
    </main>
  );
}

function Break({ flow }: Pick<VariantProps, "flow">) {
  return (
    <main className="vc-full vc-sunfield">
      <p className="vc-kicker">Halfway!</p>
      <h1 className="vc-huge">Wiggle break.</h1>
      <p className="vc-lead">Stand up. Shake your hands. Touch your toes. Then come back.</p>
      <div className="vc-row">
        <button type="button" className="btn vc-next" onClick={() => flow.endBreak(true)}>I am back <span className="arr">→</span></button>
        <button type="button" className="btn ghost vc-next" onClick={() => flow.endBreak(false)}>Skip the break</button>
      </div>
    </main>
  );
}

function Facts({ flow }: Pick<VariantProps, "flow">) {
  const { f, fact } = flow;
  if (!f.started || f.done)
    return (
      <main className="vc-full">
        <p className="vc-kicker">{f.done ? "Time is up" : "Quick facts · 1 minute"}</p>
        <h1 className="vc-huge">{f.done ? `${f.tried} facts. Nice!` : "Ready, set, go!"}</h1>
        <p className="vc-lead">{f.done ? "On to the second half." : "Answer as many as you can. It is OK not to finish."}</p>
        <div className="vc-row">
          <button type="button" className="btn vc-next" onClick={f.done ? flow.endFacts : flow.startFacts}>{f.done ? "Keep going" : "Go"} <span className="arr">→</span></button>
        </div>
      </main>
    );
  const r = 44, c = 2 * Math.PI * r;
  return (
    <main className="vc-full vc-factrun">
      <div className="vc-ring" aria-label={`${fmtTime(f.left)} left`}>
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={r} className="vc-ring-bg" />
          <circle cx="50" cy="50" r={r} className="vc-ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - f.left / FACT_SECONDS)} />
        </svg>
        <span>{f.left}</span>
      </div>
      <p className="vc-fact" aria-live="polite">{fact.a} {fact.op === "-" ? "−" : "+"} {fact.b} = <b>{f.entry || "?"}</b></p>
      <NumPad className="vc-pad" value={f.entry} onChange={flow.setFactEntry} onEnter={flow.submitFact} max={2} enterLabel="Enter" />
    </main>
  );
}

function End() {
  return (
    <main className="vc-full vc-endfield">
      <div className="vc-confetti" aria-hidden>{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.25}s` }} />)}</div>
      <p className="vc-kicker">All done!</p>
      <h1 className="vc-huge">Amazing work, {CHILD.name}!</h1>
      <p className="vc-lead">Your report will be emailed to your grown-up shortly.</p>
    </main>
  );
}
