"use client";

// PROTOTYPE ONLY (ticket #60). D - Trail: progress is the main picture. A trail with 36 stops, a halfway camp
// (break and quick facts) and a finish flag runs across the top; the question is a card under it, and the
// whiteboard is a drawer that slides up (open by itself on "show your work" questions).
import { useEffect, useState } from "react";
import { BREAK_AFTER, CHILD, FACT_SECONDS, TOTAL } from "./data";
import { fmtTime, NumPad, PicSvg, SpeakerIcon } from "./parts";
import { Whiteboard } from "./whiteboard";
import { hasWork } from "./flow";
import type { VariantProps } from "./index";
import "./variant-d.css";

// stations: 0-17 questions, 18 camp, 19-36 questions, 37 finish
const STATIONS = TOTAL + 2;
const yAt = (t: number) => 62 + 26 * Math.sin(t * Math.PI * 2.6 + 0.4);
const xAt = (t: number) => 30 + t * 940;
const PATH = Array.from({ length: 121 }, (_, i) => {
  const t = i / 120;
  return `${i ? "L" : "M"}${xAt(t).toFixed(1)} ${yAt(t).toFixed(1)}`;
}).join(" ");

function station(flow: VariantProps["flow"]) {
  if (flow.phase === "end") return STATIONS - 1;
  if (flow.phase !== "q") return BREAK_AFTER;
  return flow.index < BREAK_AFTER ? flow.index : flow.index + 1;
}

export function VariantD({ flow, speech }: VariantProps) {
  const at = station(flow);
  return (
    <div className="vd" data-phase={flow.phase}>
      <Trail at={at} />
      {flow.phase === "q" && <Question flow={flow} speech={speech} key={flow.index} />}
      {flow.phase === "break" && <Break flow={flow} />}
      {flow.phase === "facts" && <Facts flow={flow} />}
      {flow.phase === "end" && <End />}
    </div>
  );
}

function Trail({ at }: { at: number }) {
  const tOf = (s: number) => s / (STATIONS - 1);
  const done = tOf(at);
  return (
    <div className="vd-trail">
      <div className="vd-track">
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden>
        <path d={PATH} className="vd-path" />
        <path d={PATH} className="vd-path-done" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - done} />
      </svg>
      {Array.from({ length: STATIONS }, (_, s) => {
        const t = tOf(s);
        const kind = s === BREAK_AFTER ? "camp" : s === STATIONS - 1 ? "flag" : "stop";
        return (
          <span key={s} className={`vd-st vd-s-${kind} ${s < at ? "is-done" : ""} ${s === at ? "is-here" : ""}`} style={{ left: `${(xAt(t) / 1000) * 100}%`, top: `${(yAt(t) / 120) * 100}%` }}>
            {kind === "camp" && <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4L3 20h18z" /><path d="M12 12l-3 8h6z" /></svg>}
            {kind === "flag" && <svg viewBox="0 0 24 24" aria-hidden><path d="M6 21V3" /><path d="M6 4h12l-3 4 3 4H6" /></svg>}
          </span>
        );
      })}
      <span className="vd-me" style={{ left: `${(xAt(done) / 1000) * 100}%`, top: `${(yAt(done) / 120) * 100}%` }} aria-hidden>{CHILD.name[0]}</span>
      </div>
      <p className="vd-legend">
        <span>Start</span>
        <span>Halfway camp</span>
        <span>Finish</span>
      </p>
      <p className="sr">Stop {at + 1} of {STATIONS}</p>
    </div>
  );
}

function Question({ flow, speech }: VariantProps) {
  const { q, answer } = flow;
  const required = q.board === "required";
  const [open, setOpen] = useState(required);
  useEffect(() => setOpen(required), [required]); // eslint-disable-line react-hooks/set-state-in-effect -- open the drawer on a work question

  return (
    <>
      <main className={`vd-main ${open ? "is-drawer" : ""}`}>
        <article className="vd-card">
          <div className="vd-card-top">
            <span className="vd-tag">{required ? "Show your work" : `Stop ${flow.index + 1}`}</span>
            {speech.supported && (
              <button type="button" className="vd-read" onClick={() => speech.toggle(q.speak)} aria-pressed={speech.speaking}>
                <SpeakerIcon on={speech.speaking} /> {speech.speaking ? "Stop" : "Read it to me"}
              </button>
            )}
          </div>
          <h1 className="vd-text">{q.text}</h1>
          {q.kind === "choice" ? (
            <div className="vd-choices" role="radiogroup" aria-label="Choose one answer">
              {q.choices!.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={answer === c.id} className="vd-choice" onClick={() => flow.setAnswer(c.id)}>
                  {c.pic ? <PicSvg kind={c.pic} size={54} /> : null}
                  <span className={c.pic ? "vd-cap" : "vd-big"}>{c.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="vd-num">
              <output className="vd-display" aria-live="polite">{answer || "?"}{q.suffix ? <small> {q.suffix}</small> : null}</output>
              <NumPad className="vd-strip" value={answer} onChange={flow.setAnswer} onEnter={flow.next} enterDisabled={!flow.canNext} />
            </div>
          )}
          <div className="vd-foot">
            <p aria-live="polite">{flow.needsWork && answer ? "Show your work in the workspace below." : ""}</p>
            <button type="button" className="btn vd-next" onClick={flow.next} disabled={!flow.canNext}>
              {flow.index === flow.total - 1 ? "To the finish" : "Next stop"} <span className="arr">→</span>
            </button>
          </div>
        </article>
      </main>
      <section className={`vd-drawer ${open ? "is-open" : ""} ${required ? "is-required" : ""}`} aria-label="Workspace">
        <button type="button" className="vd-handle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="vd-grip" aria-hidden />
          {open ? "Hide workspace" : hasWork(flow.work) ? "Workspace (you have work here)" : "Open workspace"}
        </button>
        {open && <Whiteboard strokes={flow.work.strokes} onStrokes={flow.setStrokes} text={flow.work.text} onText={flow.setText} paper="grid" className="vd-wb" hint={required ? "Show how you got your answer" : "Work it out here"} />}
      </section>
    </>
  );
}

function Break({ flow }: Pick<VariantProps, "flow">) {
  return (
    <main className="vd-main">
      <article className="vd-card vd-campcard">
        <span className="vd-tag">Halfway camp</span>
        <h1 className="vd-title">You made it to camp, {CHILD.name}!</h1>
        <p className="vd-lead">18 stops done. Rest here as long as you like: stretch, drink some water. Next is a quick-facts sprint, then the second half of the trail.</p>
        <div className="vd-row">
          <button type="button" className="btn" onClick={() => flow.endBreak(false)}>Leave camp <span className="arr">→</span></button>
          <button type="button" className="btn ghost" onClick={() => flow.endBreak(true)}>I rested, let&apos;s go</button>
        </div>
      </article>
    </main>
  );
}

function Facts({ flow }: Pick<VariantProps, "flow">) {
  const { f, fact } = flow;
  return (
    <main className="vd-main">
      <article className="vd-card vd-sprint">
        <span className="vd-tag">Quick-facts sprint · 1 minute</span>
        {!f.started ? (
          <>
            <h1 className="vd-title">Sprint from camp.</h1>
            <p className="vd-lead">Answer as many facts as you can in one minute. Press Enter to skip one.</p>
            <div className="vd-row"><button type="button" className="btn" onClick={flow.startFacts}>Start the sprint <span className="arr">→</span></button></div>
          </>
        ) : f.done ? (
          <>
            <h1 className="vd-title">Sprint done: {f.tried} facts.</h1>
            <p className="vd-lead">Back on the trail for the second half.</p>
            <div className="vd-row"><button type="button" className="btn" onClick={flow.endFacts}>Back to the trail <span className="arr">→</span></button></div>
          </>
        ) : (
          <div className="vd-run">
            <div>
              <div className="vd-sprint-bar"><span style={{ width: `${(1 - f.left / FACT_SECONDS) * 100}%` }} /><i style={{ left: `${(1 - f.left / FACT_SECONDS) * 100}%` }} /></div>
              <p className="vd-time">{fmtTime(f.left)}</p>
              <p className="vd-fact" aria-live="polite">{fact.a} {fact.op === "-" ? "−" : "+"} {fact.b} = <b>{f.entry || "?"}</b></p>
            </div>
            <NumPad className="vd-pad" value={f.entry} onChange={flow.setFactEntry} onEnter={flow.submitFact} max={2} enterLabel="Enter" />
          </div>
        )}
      </article>
    </main>
  );
}

function End() {
  return (
    <main className="vd-main">
      <article className="vd-card vd-finish">
        <span className="vd-tag">Finish</span>
        <h1 className="vd-title">You finished the whole trail!</h1>
        <p className="vd-lead">Great work, {CHILD.name}. Your report will be emailed to your grown-up shortly.</p>
      </article>
    </main>
  );
}
