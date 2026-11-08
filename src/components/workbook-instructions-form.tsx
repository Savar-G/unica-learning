"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * Book instructions on the admin child page (2026-11-08): one section per kind, built from the curriculum, so code
 * applies each one directly. Saved per child; every next "Prepare next workbook" uses them until an admin changes or
 * clears them. The run page shows which ones applied.
 */
export interface FormUnit { code: string; title: string; reviewable: boolean; taught: boolean }
export interface FormLevel { id: string; number: number; title: string; schoolGrade: number; units: FormUnit[] }
export interface FormInstructions {
  startLevel: string | null;
  teachMore: string[];
  teachLess: string[];
  addReview: string[];
  difficulty: "harder" | "usual" | null;
}

const TOPICS_MAX = 8;
const grade = (g: number) => (g === 0 ? "Kindergarten" : `Grade ${g}`);
type Choice = "usual" | "more" | "less";

export function WorkbookInstructionsForm({ childId, child, schoolGrade, levels, autoLevel, saved }: {
  childId: string;
  child: string;
  schoolGrade: number;
  levels: FormLevel[];
  /** The level the automatic placement would choose now, or null when it cannot be worked out here. */
  autoLevel: string | null;
  saved: FormInstructions | null;
}) {
  const router = useRouter();
  const empty: FormInstructions = { startLevel: null, teachMore: [], teachLess: [], addReview: [], difficulty: null };
  const [value, setValue] = useState<FormInstructions>(saved ?? empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const levelId = value.startLevel ?? autoLevel;
  const level = levels.find((l) => l.id === levelId) ?? null;
  const below = useMemo(() => levels.filter((l) => level && l.number < level.number && l.schoolGrade <= schoolGrade)
    .map((l) => ({ ...l, units: l.units.filter((u) => u.reviewable) })).filter((l) => l.units.length > 0).reverse(), [levels, level, schoolGrade]);
  const changed = JSON.stringify(value) !== JSON.stringify(saved ?? empty);

  const setStart = (id: string) => {
    const next = id === "" ? null : id;
    const units = new Set(levels.find((l) => l.id === (next ?? autoLevel))?.units.map((u) => u.code) ?? []);
    const nextLevel = levels.find((l) => l.id === (next ?? autoLevel));
    // Teach more and less are units of the book's level; review is below it.
    setValue((v) => ({
      ...v, startLevel: next,
      teachMore: v.teachMore.filter((c) => units.has(c)), teachLess: v.teachLess.filter((c) => units.has(c)),
      addReview: v.addReview.filter((c) => levels.some((l) => nextLevel && l.number < nextLevel.number && l.units.some((u) => u.code === c))),
    }));
  };
  const choiceOf = (code: string): Choice => (value.teachMore.includes(code) ? "more" : value.teachLess.includes(code) ? "less" : "usual");
  const setChoice = (code: string, choice: Choice) => setValue((v) => ({
    ...v,
    teachMore: choice === "more" ? [...v.teachMore.filter((c) => c !== code), code] : v.teachMore.filter((c) => c !== code),
    teachLess: choice === "less" ? [...v.teachLess.filter((c) => c !== code), code] : v.teachLess.filter((c) => c !== code),
  }));
  const toggleReview = (code: string) => setValue((v) => ({
    ...v, addReview: v.addReview.includes(code) ? v.addReview.filter((c) => c !== code) : [...v.addReview, code],
  }));

  async function send(method: "PUT" | "DELETE") {
    if (busy) return;
    if (method === "DELETE" && !window.confirm(`Clear ${child}'s book instructions? The next workbooks use the automatic plan.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/children/${childId}/workbook-instructions`, {
        method, headers: { "content-type": "application/json" }, ...(method === "PUT" ? { body: JSON.stringify({ version: 1, ...value }) } : {}),
      });
      if (res.status === 404) { setMessage({ kind: "error", text: "This child is unavailable or your admin access has ended." }); return; }
      const result = await res.json() as { ok: boolean; error?: string };
      if (!result.ok) { setMessage({ kind: "error", text: result.error === "unavailable" ? "The database is unavailable. Try again later." : result.error ?? "It was not saved." }); return; }
      if (method === "DELETE") setValue(empty);
      setMessage({ kind: "ok", text: method === "DELETE" ? "Cleared. The next workbooks use the automatic plan." : "Saved. The next workbook uses these instructions." });
      router.refresh();
    } catch { setMessage({ kind: "error", text: "The response was lost. Reload the page to see what was saved." }); }
    finally { setBusy(false); }
  }

  const auto = levels.find((l) => l.id === autoLevel);
  return <form className="adm-ins" aria-labelledby="book-instructions-title" onSubmit={(e) => { e.preventDefault(); void send("PUT"); }}>
    <fieldset>
      <legend>Start level</legend>
      <select aria-label="Start level" value={value.startLevel ?? ""} onChange={(e) => setStart(e.target.value)}>
        <option value="">{auto ? `Automatic (now ${auto.id}, ${grade(auto.schoolGrade)})` : "Automatic"}</option>
        {levels.map((l) => <option key={l.id} value={l.id}>{l.id}, {grade(l.schoolGrade)}: {l.title}</option>)}
      </select>
      <p className="adm-note">One level per book. To give more of a higher grade, choose a higher level; weak topics below it become review checks. Kindergarten children always start at U1.</p>
    </fieldset>

    <fieldset>
      <legend>Teach more or less{level ? ` in ${level.id}` : ""}</legend>
      {!level ? <p className="adm-note">Choose a start level to pick its units.</p> : <ul className="adm-units">
        {level.units.map((u) => <li key={u.code}>
          <span>{u.code} {u.title}</span>
          {u.taught ? <span className="adm-seg" role="radiogroup" aria-label={`${u.code} ${u.title}`}>
            {([["usual", "Usual"], ["more", "Teach more"], ["less", "Teach less"]] as const).map(([c, label]) =>
              <label key={c}><input type="radio" name={`unit-${u.code}`} checked={choiceOf(u.code) === c} onChange={() => setChoice(u.code, c)} />{label}</label>)}
          </span> : <span className="adm-note">Daily warm-up only</span>}
        </li>)}
      </ul>}
      <p className="adm-note">Teach more: the unit goes first and gets an extra practice page on its first day. Teach less: review only in this book.</p>
    </fieldset>

    <fieldset>
      <legend>Add review</legend>
      {!below.length ? <p className="adm-note">No earlier topics to review at this level.</p> : <div className="adm-pick">
        {below.map((l) => {
          const picked = l.units.filter((u) => value.addReview.includes(u.code)).length;
          return <details key={l.id} open={picked > 0}>
            <summary>{l.id}, {grade(l.schoolGrade)}: {l.title}{picked ? ` (${picked} chosen)` : ""}</summary>
            <div>{l.units.map((u) => <label key={u.code}>
              <input type="checkbox" checked={value.addReview.includes(u.code)} disabled={!value.addReview.includes(u.code) && value.addReview.length >= TOPICS_MAX}
                onChange={() => toggleReview(u.code)} />{u.code} {u.title}
            </label>)}</div>
          </details>;
        })}
      </div>}
      <p className="adm-note">Each topic gets 2 Remember these questions on Days 2 to 4 and 1 Friday 5 question. About 4 topics fit in a book; the last ones chosen are left out when there is no room.</p>
    </fieldset>

    <fieldset>
      <legend>Difficulty</legend>
      <span className="adm-seg" role="radiogroup" aria-label="Difficulty">
        {([[null, "Automatic"], ["harder", "Harder from Day 1"], ["usual", "No extra stretch"]] as const).map(([d, label]) =>
          <label key={label}><input type="radio" name="difficulty" checked={value.difficulty === d} onChange={() => setValue((v) => ({ ...v, difficulty: d }))} />{label}</label>)}
      </span>
      <p className="adm-note">Harder: each day&apos;s numbers start 2 days ahead and the Challenge uses its hardest questions. Needs a finished assessment.</p>
    </fieldset>

    <div className="adm-row">
      <button type="submit" className="btn adm-btn" disabled={busy || !changed}>{busy ? "Saving..." : "Save instructions"}</button>
      {saved && <button type="button" className="btn adm-btn" onClick={() => void send("DELETE")} disabled={busy}>Clear all</button>}
      {changed && !busy && <span className="adm-note">Not saved yet.</span>}
    </div>
    {message && <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "ok" ? "adm-note" : undefined}>{message.text}</p>}
  </form>;
}
