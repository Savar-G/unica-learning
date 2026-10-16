"use client";

// How a child likes to learn (#126): the parent answers on the report, above the plan choice, or from the account.
// The step never blocks payment: the plan buttons stay below it, and "Skip for now" folds it away. A skip is not
// stored, so the step asks again on the next visit. Analytics get only where and what happened, never an answer.
// #195 (D-107): two groups. "About {child}" holds the questions to answer with the child (feeling about math, how they
// like to learn, interests, what is hard); "Your goal and time" holds the parent's two. Every question is optional, and
// a second tap on a chosen single answer clears it.
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import {
  feelingLabel,
  goalLabel,
  INTERESTS,
  interestLabel,
  LEARNING_GOALS,
  LEARNING_ROUTE,
  LEARNING_STYLES,
  MATH_FEELINGS,
  NOTE_MAX,
  STYLE_MAX,
  styleLabel,
  WEEKLY_TIMES,
  weeklyTimeLabel,
  type Interest,
  type LearningAnswers,
  type LearningRequest,
  type LearningResult,
  type LearningStyle,
} from "@/lib/learning-style";
import { track } from "@/lib/track";
import "./learning.css";

type State = "ask" | "saved" | "skipped";

const EMPTY: LearningAnswers = { styles: [], interests: [], note: "", feeling: null, goal: null, weeklyTime: null };
const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
const joinWithAnd = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** One answer from a short list, as chips. A second tap on the chosen chip clears it: every question is optional. */
function OneChoice<T extends string>({ name, legend, hint, options, value, onChange }: {
  name: string;
  legend: string;
  hint?: string;
  options: readonly { id: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <fieldset className="lrn-q">
      <legend>{legend}{hint && <> <span>{hint}</span></>}</legend>
      <div className="lrn-picks">
        {options.map((o) => (
          <label key={o.id} className="lrn-pick">
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} onClick={() => { if (value === o.id) onChange(null); }} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** `place`: on the report (with Skip) or on its own account page. */
export function LearningStep({ childId, name, start, place }: { childId: string; name: string; start: LearningAnswers | null; place: "report" | "account" }) {
  const [saved, setSaved] = useState<LearningAnswers | null>(start);
  const [state, setState] = useState<State>(start ? "saved" : "ask");
  const [form, setForm] = useState<LearningAnswers>(start ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announce, setAnnounce] = useState("");
  const sending = useRef(false);
  const router = useRouter();

  const empty = !form.styles.length && !form.interests.length && !form.note.trim() && !form.feeling && !form.goal && !form.weeklyTime;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    const body: LearningRequest = { child: childId, ...form, note: form.note.trim() };
    let httpStatus = 0;
    let result: LearningResult | null = null;
    try {
      const res = await fetch(LEARNING_ROUTE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      httpStatus = res.status;
      result = (await res.json()) as LearningResult;
    } catch {}
    if (httpStatus === 401) {
      router.push(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    track("learning_step", { src: place, status: result?.ok ? (empty ? "cleared" : "saved") : "error" });
    if (result?.ok) {
      const next = empty ? null : { ...form, note: form.note.trim() };
      setSaved(next);
      setState(next ? "saved" : "ask");
      setAnnounce(next ? "Your answers are saved." : "Your answers are cleared.");
    } else {
      setFailed(true);
    }
    setBusy(false);
    sending.current = false;
  };

  const skip = () => {
    track("learning_step", { src: place, status: "skipped" });
    setState("skipped");
    setAnnounce("");
  };

  const edit = () => {
    setForm(saved ?? EMPTY);
    setState("ask");
  };

  const liveRegion = <p className="sr-only" role="status">{announce}</p>;

  if (state === "skipped") {
    return (
      <div className="lrn is-folded">
        <p>You skipped the questions about how {name} learns. {name}&apos;s book will use our usual mix. You can answer later from your account.</p>
        <button className="btn sm ghost" type="button" onClick={() => setState("ask")}>Answer now</button>
        {liveRegion}
      </div>
    );
  }

  if (state === "saved" && saved) {
    return (
      <div className="lrn is-saved">
        <h3>Thank you. {name}&apos;s next book will use your answers.</h3>
        <ul className="lrn-summary">
          {saved.feeling && <li><b>Feeling about math:</b> {feelingLabel(saved.feeling)}</li>}
          {saved.styles.length > 0 && <li><b>Learns best from:</b> {saved.styles.map(styleLabel).join("; ")}</li>}
          {saved.interests.length > 0 && <li><b>Interested in:</b> {joinWithAnd(saved.interests.map(interestLabel))}</li>}
          {saved.note && <li><b>Finds hard in math:</b> {saved.note}</li>}
          {saved.goal && <li><b>Your main goal:</b> {goalLabel(saved.goal)}</li>}
          {saved.weeklyTime && <li><b>Time each week:</b> {weeklyTimeLabel(saved.weeklyTime)}</li>}
        </ul>
        <button className="btn sm ghost" type="button" onClick={edit}>Change answers</button>
        {liveRegion}
      </div>
    );
  }

  const full = form.styles.length >= STYLE_MAX;
  return (
    <form className="lrn" onSubmit={(e) => void save(e)} aria-labelledby={`lrn-h-${childId}`}>
      <h3 id={`lrn-h-${childId}`}>Tell us how {name} learns</h3>
      <p className="lrn-lead">We use your answers to build {name}&apos;s next book. {place === "report" ? "This step is optional, and you can change the answers later from your account." : "You can change them at any time."}</p>

      <div className="lrn-group" role="group" aria-labelledby={`lrn-child-${childId}`}>
        <p className="eyebrow" id={`lrn-child-${childId}`}>About {name}</p>
        <p className="lrn-together">If {name} is nearby, answer these together.</p>

        <OneChoice name={`lrn-feeling-${childId}`} legend={`How does ${name} feel about math?`} options={MATH_FEELINGS} value={form.feeling}
          onChange={(feeling) => setForm((f) => ({ ...f, feeling }))} />

        <fieldset className="lrn-q">
          <legend>How does {name} like to learn something new? <span>Choose one or two.</span></legend>
          <div className="lrn-picks">
            {LEARNING_STYLES.map((s) => {
              const on = form.styles.includes(s.id);
              return (
                <label key={s.id} className="lrn-pick">
                  <input type="checkbox" checked={on} disabled={!on && full} onChange={() => setForm((f) => ({ ...f, styles: toggle<LearningStyle>(f.styles, s.id) }))} />
                  {s.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="lrn-q">
          <legend>What is {name} interested in? <span>Optional. We set the story problems in these.</span></legend>
          <div className="lrn-picks">
            {INTERESTS.map((i) => (
              <label key={i.id} className="lrn-pick is-small">
                <input type="checkbox" checked={form.interests.includes(i.id)} onChange={() => setForm((f) => ({ ...f, interests: toggle<Interest>(f.interests, i.id) }))} />
                {i.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="lrn-q fld">
          <label htmlFor={`lrn-note-${childId}`}>What does {name} find hard in math? <span>Optional.</span></label>
          <textarea id={`lrn-note-${childId}`} rows={3} maxLength={NOTE_MAX} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </div>

      <div className="lrn-group" role="group" aria-labelledby={`lrn-you-${childId}`}>
        <p className="eyebrow" id={`lrn-you-${childId}`}>Your goal and time</p>
        <OneChoice name={`lrn-goal-${childId}`} legend="What is your main goal?" options={LEARNING_GOALS} value={form.goal}
          onChange={(goal) => setForm((f) => ({ ...f, goal }))} />
        <OneChoice name={`lrn-time-${childId}`} legend="How much time each week?" hint="For math practice at home." options={WEEKLY_TIMES} value={form.weeklyTime}
          onChange={(weeklyTime) => setForm((f) => ({ ...f, weeklyTime }))} />
      </div>

      {failed && <p className="lrn-note" role="alert">We could not save your answers. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
      <div className="lrn-actions">
        <button className="btn sm" type="submit" disabled={busy || (empty && !saved)} aria-busy={busy}>
          {busy ? <span className="spin" role="img" aria-label="Saving" /> : empty && saved ? "Clear answers" : "Save answers"}
        </button>
        {saved ? <button className="btn sm ghost" type="button" onClick={() => setState("saved")} disabled={busy}>Cancel</button>
          : place === "report" && <button className="btn sm ghost" type="button" onClick={skip} disabled={busy}>Skip for now</button>}
      </div>
      {liveRegion}
    </form>
  );
}
