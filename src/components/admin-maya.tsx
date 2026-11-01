"use client";

// Maya's admin test calls (#323): pick a supported question of a test family's child, type the child's turns, and see
// Maya's replies while she writes on the board. The call runs on the server (src/lib/maya-call.ts); this screen sends
// one input at a time and shows what came back. A finished call shows its outcome, the learning event, the versions and
// a board replay. Admins only; nothing here reaches a family.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { MayaBoard } from "@/components/maya-board";
import type { PlayStep } from "@/lib/board-svg";
import type { Outcome } from "@/lib/maya";
import type { CallInput, CallView } from "@/lib/maya-call";
import type { CallListRow, DemoChild } from "@/lib/maya-call-server";
import { ADMIN_PATH, adminChildProfilePath, adminTestPath } from "@/lib/admin-view";
import "./admin-maya.css";

export interface BoardView {
  steps: PlayStep[];
  viewBox: string;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribe = (change: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const useReducedMotion = () => useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);

export const REASON_TEXT: Record<Outcome["reason"], string> = {
  solved: "Solved",
  child_stopped: "Child stopped",
  time_limit: "Time limit",
  no_response: "No answer from the child",
  technical_issue: "Technical issue",
  content_issue: "Question problem",
  safety: "Safety flag",
};
export const ASSISTANCE_TEXT: Record<Outcome["assistance"], string> = {
  independent: "On their own",
  hint: "Hints",
  worked_example: "Easier example",
  guided: "Guided step by step",
  answer_given: "Maya gave the answer",
};
const PAPER_TEXT: Record<Outcome["paperStatus"], string> = { child_confirmed: "Child wrote it", declined: "Child said no", unknown: "Not known" };
const UNDERSTANDING_TEXT: Record<Outcome["understanding"], string> = { evidence_observed: "Showed understanding", uncertain: "Not sure" };
const ERROR_TEXT: Record<string, string> = {
  conflict: "The call changed in another tab. Reload this page to see it.",
  invalid_input: "That turn could not be sent. Type up to 500 characters.",
  invalid_question: "Maya cannot work on that question.",
  not_test_family: "Only test families can have test calls.",
  model_unavailable: "The model is not available.",
  unavailable: "The server is missing its database key.",
  failed: "Something went wrong. Try again.",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const named = (text: string, name: string | null) => text.replaceAll("{name}", name ?? "the child");

function ModelChip({ model }: { model: { id: string; fake: boolean } }) {
  return model.fake
    ? <span className="adm-chip is-warn" title="The server has no OpenRouter key: Maya's words come from code's rule player.">Fake model (no AI key)</span>
    : <span className="adm-chip is-info">{model.id}</span>;
}

// ---------- the picker ----------

export function MayaPicker({ children, model }: { children: DemoChild[]; model: { id: string; fake: boolean } }) {
  const router = useRouter();
  const [childId, setChildId] = useState(children[0]?.childId ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const child = children.find((c) => c.childId === childId) ?? null;

  async function start(assessmentId: string, questionId: string) {
    setBusy(`${assessmentId}:${questionId}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/maya/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assessmentId, questionId }) });
      const body = await res.json().catch(() => null);
      if (!body?.ok) throw new Error(body?.error ?? "failed");
      router.push(`${ADMIN_PATH}/maya/${body.view.id}`);
    } catch (e) {
      setError(ERROR_TEXT[e instanceof Error ? e.message : "failed"] ?? ERROR_TEXT.failed);
      setBusy(null);
    }
  }

  if (children.length === 0) {
    return <p className="adm-empty">No test family has a test with a question Maya can work on yet. Mark a family as a test family, and have its child take a Grade 2 test.</p>;
  }
  return (
    <section className="mc-pick" aria-labelledby="mc-pick-title">
      <div className="mc-pick-head">
        <h2 id="mc-pick-title">Start a test call</h2>
        <p className="adm-note">Model for a new call: <ModelChip model={model} /></p>
      </div>
      <label className="mc-field">
        <span>Test child</span>
        <select value={childId} onChange={(e) => setChildId(e.target.value)}>
          {children.map((c) => <option key={c.childId} value={c.childId}>{c.firstName}</option>)}
        </select>
      </label>
      {child?.tests.map((t) => (
        <div key={t.assessmentId} className="mc-test">
          <p className="adm-crumb">Test of {when(t.startedAt)} · <Link href={adminTestPath(t.assessmentId)}>Open the test</Link></p>
          <ul className="mc-questions">
            {t.questions.map((q) => {
              const key = `${q.assessmentId}:${q.questionId}`;
              return (
                <li key={key}>
                  <div>
                    <p className="mc-q-text">{q.text}</p>
                    <p className="adm-sub">Question {q.number} · answer {q.answer} · {q.templateId}</p>
                  </div>
                  <button type="button" className="btn sm adm-btn" disabled={busy !== null} onClick={() => start(q.assessmentId, q.questionId)}>
                    {busy === key ? "Starting…" : "Call Maya"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {error && <p className="mc-error" role="alert">{error}</p>}
    </section>
  );
}

export function MayaCallList({ calls }: { calls: CallListRow[] }) {
  if (calls.length === 0) return <p className="adm-empty">No test calls yet.</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr><th>Started</th><th>Child</th><th>Question</th><th>Outcome</th><th>Help</th><th className="adm-num">Time</th><th>Model</th><th>Event</th></tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td className="adm-nowrap"><Link href={`${ADMIN_PATH}/maya/${c.id}`}>{when(c.createdAt)}</Link></td>
              <td>{c.childName ?? "Child"}</td>
              <td>{c.questionText}</td>
              <td>{c.status === "live" ? <span className="adm-chip is-info">Live</span> : c.outcome ? <span className={`adm-chip ${c.outcome === "solved" ? "is-ok" : "is-muted"}`}>{REASON_TEXT[c.outcome]}</span> : "-"}</td>
              <td>{c.assistance ? ASSISTANCE_TEXT[c.assistance] : "-"}</td>
              <td className="adm-num">{c.seconds === null ? "-" : clock(c.seconds)}</td>
              <td className="adm-mono">{c.model}</td>
              <td>{c.status === "live" ? "-" : c.learningEvent ? "Written" : "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- the call ----------

export function MayaCall({ initial, board: firstBoard, childName }: { initial: CallView; board: BoardView; childName: string | null }) {
  const [view, setView] = useState(initial);
  const [board, setBoard] = useState(firstBoard);
  /** Board steps already drawn before the last answer: only the new ones animate. */
  const [shown, setShown] = useState(initial.status === "ended" ? firstBoard.steps.length : 0);
  const [replay, setReplay] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const reduced = useReducedMotion();
  const talk = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const live = view.status === "live";

  useEffect(() => {
    // The list scrolls, not the page: the newest line in view.
    const list = talk.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [view.transcript.length, reduced]);

  async function send(next: CallInput) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/maya/calls/${view.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ revision: view.revision, input: next }) });
      const body = await res.json().catch(() => null);
      if (!body?.ok) throw new Error(body?.error ?? "failed");
      setShown(board.steps.length);
      setBoard(body.board);
      setView(body.view);
      if (body.output.safetyMessage) setSafety(body.output.safetyMessage);
      if (next.type === "child") setText("");
      if (next.type === "writing") setWriting(next.status === "started");
      return true;
    } catch (e) {
      setError(ERROR_TEXT[e instanceof Error ? e.message : "failed"] ?? ERROR_TEXT.failed);
      return false;
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim() && !busy) void send({ type: "child", text: text.trim() });
  }

  const boardLabel = `Our board: ${view.questionText ?? "the question"}, as Maya wrote it`;
  return (
    <div className="mc-call">
      <header className="mc-head">
        <div className="mc-head-q">
          <p className="adm-crumb"><Link href={`${ADMIN_PATH}/maya`}>Maya calls</Link> · Test call · {childName ?? "Child"}</p>
          <h1>{view.questionText}</h1>
        </div>
        <div className="mc-chips">
          {live ? <span className="adm-chip is-info">Live</span> : <span className="adm-chip is-muted">Finished</span>}
          <ModelChip model={view.model} />
          <span className="adm-chip is-muted">Test family · no minutes, no emails</span>
        </div>
      </header>

      <div className="mc-grid">
        <section className="mc-maya" aria-label="The call">
          <header className="mc-maya-head">
            {/* A small fixed picture; the image optimizer adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mc-avatar" src="/desk/maya.webp" alt="" width={40} height={40} />
            <div>
              <h2>Maya</h2>
              <p>{live ? (busy ? "Maya is thinking…" : `You type as ${childName ?? "the child"}.`) : "The call has ended."}</p>
            </div>
          </header>

          <ol ref={talk} className="mc-talk" aria-live="polite">
            {view.transcript.map((line, i) => (
              <li key={i} className={`mc-line is-${line.speaker}`}>
                {line.speaker !== "note" && <span className="mc-who">{line.speaker === "maya" ? "Maya" : childName ?? "Child"} · {clock(line.second)}</span>}
                <p>{named(line.text, childName)}</p>
              </li>
            ))}
            {busy && <li className="mc-line is-maya is-typing" aria-label="Maya is thinking"><p><span /><span /><span /></p></li>}
          </ol>
          {safety && <p className="mc-safety" role="status">{safety}</p>}

          {live ? (
            <form className="mc-say" onSubmit={submit}>
              <label className="mc-say-box">
                <span className="sr-only">What {childName ?? "the child"} says</span>
                <textarea
                  ref={input}
                  rows={2}
                  maxLength={500}
                  value={text}
                  placeholder={`What ${childName ?? "the child"} says…`}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) submit(e);
                  }}
                  disabled={busy}
                />
              </label>
              <div className="mc-say-row">
                <button type="submit" className="btn sm adm-btn" disabled={busy || !text.trim()}>Send</button>
                <button type="button" className="btn sm ghost adm-btn" disabled={busy} onClick={() => send({ type: "tick" })} title="The time moves on with no answer from the child">Stay quiet</button>
                <button type="button" className="btn sm ghost adm-btn" disabled={busy} onClick={() => send({ type: "writing", status: writing ? "done" : "started" })}>
                  {writing ? "Done writing" : "Writing on paper"}
                </button>
                <button type="button" className="btn sm ghost adm-btn mc-hang" disabled={busy} onClick={() => send({ type: "end" })}>Hang up</button>
              </div>
              {error && <p className="mc-error" role="alert">{error}</p>}
            </form>
          ) : null}
        </section>

        <section className="mc-board" aria-label="Our board">
          <div className="mc-board-head">
            <h2>Our board</h2>
            {!live && board.steps.length > 0 && (
              <button type="button" className="btn sm ghost adm-btn" onClick={() => { setShown(0); setReplay((n) => n + 1); }}>Replay the board</button>
            )}
          </div>
          {board.steps.length === 0 ? (
            <div className="mc-board-empty">Maya writes here when she works a step.</div>
          ) : (
            <MayaBoard key={`${replay}`} steps={board.steps} viewBox={board.viewBox} label={boardLabel} instant={reduced} shown={shown} />
          )}
          {reduced && <p className="adm-note">Your device asks for less motion, so the board shows the finished work.</p>}
        </section>
      </div>

      {!live && <CallRecordFacts view={view} childName={childName} onRetry={() => send({ type: "end" })} busy={busy} error={error} />}
    </div>
  );
}

function CallRecordFacts({ view, childName, onRetry, busy, error }: { view: CallView; childName: string | null; onRetry: () => void; busy: boolean; error: string | null }) {
  const o = view.outcome;
  const question = view.question;
  return (
    <section className="mc-record" aria-labelledby="mc-record-title">
      <h2 id="mc-record-title">What was saved</h2>
      {o && (
        <dl className="adm-facts">
          <div><dt>Outcome</dt><dd><span className={`adm-chip ${o.reason === "solved" ? "is-ok" : "is-muted"}`}>{REASON_TEXT[o.reason]}</span></dd></div>
          <div><dt>Help</dt><dd>{ASSISTANCE_TEXT[o.assistance]}</dd></div>
          <div><dt>Highest hint</dt><dd>{o.highestHint === null ? "None" : `H${o.highestHint}`}</dd></div>
          <div><dt>On paper</dt><dd>{PAPER_TEXT[o.paperStatus]}</dd></div>
          <div><dt>Understanding</dt><dd>{UNDERSTANDING_TEXT[o.understanding]}</dd></div>
          <div><dt>Call time</dt><dd>{clock(Math.round(o.seconds))}</dd></div>
          <div><dt>Turns</dt><dd>{view.counts ? `${view.counts.childTurns} from ${childName ?? "the child"}, ${view.counts.mayaTurns} from Maya` : "-"}</dd></div>
          <div><dt>Code fallbacks</dt><dd>{view.counts?.fallbacks ?? "-"}</dd></div>
          <div><dt>Safety</dt><dd>{o.safetyFlag ? <span className="adm-chip is-bad">Flagged{o.safetySeverity ? ` (${o.safetySeverity})` : ""}</span> : "No flag"}</dd></div>
          <div><dt>Number checks</dt><dd>{o.mishearing.confirmations} asked, {o.mishearing.corrections} corrected</dd></div>
        </dl>
      )}

      <h3 className="mc-sub">Learning record</h3>
      <dl className="adm-facts">
        <div><dt>Learning event</dt><dd>{view.learningEventId ? <span className="adm-chip is-ok">Written</span> : <span className="adm-chip is-warn">Not written</span>}</dd></div>
        <div><dt>Profile rebuilt</dt><dd>{view.profileRebuiltAt ? when(view.profileRebuiltAt) : "Not yet"}</dd></div>
        <div><dt>Child profile</dt><dd><Link href={adminChildProfilePath(view.childId)}>Open the profile</Link></dd></div>
        <div><dt>Question</dt><dd>{question.source === "assessment" ? <Link href={adminTestPath(question.assessmentId)}>Test question {question.questionId}</Link> : `Workbook page ${question.page}, number ${question.question}`}</dd></div>
      </dl>
      {(!view.learningEventId || !view.profileRebuiltAt) && (
        <p className="mc-retry">
          <button type="button" className="btn sm ghost adm-btn" onClick={onRetry} disabled={busy}>{busy ? "Trying…" : "Try the learning record again"}</button>
          {error && <span className="mc-error" role="alert">{error}</span>}
        </p>
      )}

      <h3 className="mc-sub">Versions</h3>
      <dl className="adm-facts">
        <div><dt>Model</dt><dd className="adm-mono">{view.model.id}{view.model.fake ? " (rule player, no AI)" : ""}</dd></div>
        <div><dt>Prompt</dt><dd className="adm-mono">{view.model.promptVersion}</dd></div>
        <div><dt>Lines</dt><dd className="adm-mono">{String(view.versions.lines)}</dd></div>
        <div><dt>Session · proposal · trace</dt><dd className="adm-mono">{view.versions.session} · {view.versions.proposal} · {view.versions.trace}</dd></div>
        <div><dt>Question package</dt><dd className="adm-mono" title={view.packageHash}>{view.packageHash.slice(0, 19)}…</dd></div>
        <div><dt>Call id</dt><dd className="adm-mono">{view.id}</dd></div>
      </dl>
    </section>
  );
}
