"use client";

// Parent goals (D-323): three select-one questions about one child, right after signup and before the test. Every
// question needs an answer (Savar's choice: required, no skip). Analytics get only that the step was saved, never an
// answer. The server checks the answers again (src/app/api/account/children/[id]/goals/route.ts).
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GOAL_QUESTIONS, type ChildGoals, type GoalKey } from "@/lib/child-goals";
import { SUPPORT_EMAIL, SUPPORT_HREF } from "@/lib/contact";
import { track } from "@/lib/track";
import "./child-goals.css";

type Draft = { [K in GoalKey]: ChildGoals[K] | null };

export function ChildGoalsForm({ childId, name, start, next }: { childId: string; name: string; start: Draft; next: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Draft>(start);
  const [missing, setMissing] = useState<GoalKey[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const empty = GOAL_QUESTIONS.map((q) => q.key).filter((k) => !form[k]);
    setMissing(empty);
    setFailed(false);
    if (empty.length) {
      document.querySelector<HTMLInputElement>(`input[name="goal-${empty[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    let status = 0;
    try {
      const res = await fetch(`/api/account/children/${childId}/goals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      status = res.status;
    } catch {}
    if (status === 401) {
      router.push(`/sign-in?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
      return;
    }
    if (status !== 200) {
      setBusy(false);
      setFailed(true);
      return;
    }
    track("goals_saved");
    router.replace(next);
    router.refresh();
  };

  return (
    <form className="goals" onSubmit={(e) => void submit(e)} noValidate>
      {GOAL_QUESTIONS.map((q, i) => {
        const bad = missing.includes(q.key);
        return (
          <fieldset key={q.key} className={`goals-q${bad ? " bad" : ""}`} aria-describedby={bad ? `goal-err-${q.key}` : undefined}>
            <legend><span className="goals-n" aria-hidden="true">{i + 1}</span>{q.question.replace("{name}", name)}</legend>
            <div className="goals-picks">
              {q.options.map((o) => (
                <label key={o.id} className="goals-pick">
                  <input
                    type="radio"
                    name={`goal-${q.key}`}
                    value={o.id}
                    checked={form[q.key] === o.id}
                    onChange={() => {
                      setForm((f) => ({ ...f, [q.key]: o.id }));
                      setMissing((m) => m.filter((k) => k !== q.key));
                    }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {bad && <p className="goals-err" id={`goal-err-${q.key}`}>Choose one answer.</p>}
          </fieldset>
        );
      })}
      {failed && <p className="acct-alert" role="alert">We could not save your answers. Try again in a moment. If this keeps happening, email <a href={SUPPORT_HREF}>{SUPPORT_EMAIL}</a>.</p>}
      <button className="btn" type="submit" disabled={busy} aria-busy={busy}>
        {busy ? <span className="spin" aria-label="Saving" /> : <>Continue <span className="arr" aria-hidden="true">→</span></>}
      </button>
    </form>
  );
}
