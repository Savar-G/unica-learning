"use client";
import { SCOPE_LABELS } from "@/lib/maya/scope";

import { formatInZone, PACIFIC_ZONE } from "@/lib/family-time";

// Maya's admin test calls (#323): pick a supported question of a test family's child, type the child's turns, and see
// Maya's replies while she writes on the board. The call runs on the server (src/lib/maya-call.ts); this screen sends
// one input at a time and shows what came back. A finished call shows its outcome, the learning event, the versions and
// a board replay. Admins only; nothing here reaches a family.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { VoicePanel } from "@/components/admin-maya-voice";
import { MayaBoard } from "@/components/maya-board";
import { applyBatch, createScene, boardView } from "@/lib/board";
import type { BoardSnapshot } from "@/lib/board-protocol";
import { fitView } from "@/lib/board-svg";
import { refusedBatches, replayFrame } from "@/lib/board-history";
import { callReplay } from "@/lib/maya-call-review";
import type { PlayStep } from "@/lib/board-svg";
import type { Outcome } from "@/lib/maya";
import type { CallInput, CallView } from "@/lib/maya-call";
import { ALERT_TEXT, FLAG_TEXT, alertNote, modelName, noAlertNote, safetyText } from "@/lib/maya-flag-text";
import type { CallListRow, DemoChild } from "@/lib/maya-call-server";
import { ADMIN_PATH, adminChildProfilePath, adminTestPath } from "@/lib/admin-view";
import "./admin-maya.css";
import "./stroke-replay.css";

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
  safety: "Ended for safety",
};
export const ASSISTANCE_TEXT: Record<Outcome["assistance"], string> = {
  independent: "On their own",
  hint: "Hints",
  worked_example: "Easier example",
  guided: "Guided step by step",
  answer_given: "Maya gave the answer",
};
const PAPER_TEXT: Record<Outcome["paperStatus"], string> = { child_confirmed: "Child wrote it", declined: "Child said no", unknown: "Not known" };
/** Maya's hint levels H0 to H4 (src/lib/maya/proposal.ts), in plain words. */
const HINT_TEXT: Record<NonNullable<Outcome["highestHint"]>, string> = {
  0: "Asked the child to try",
  1: "Pointed to the step",
  2: "Named the operation",
  3: "Showed the step",
  4: "Gave the answer with a reason",
};
const UNDERSTANDING_TEXT: Record<Outcome["understanding"], string> = { evidence_observed: "Showed understanding", uncertain: "Not sure" };
const ERROR_TEXT: Record<string, string> = {
  conflict: "The call changed in another tab. Reload this page to see it.",
  invalid_input: "That turn could not be sent. Type up to 500 characters.",
  invalid_question: "Maya cannot work on that question.",
  not_test_family: "Only test families can have test calls.",
  model_unavailable: "The AI is not available right now.",
  week_used: "This child's Maya time for this week is used up.",
  paused: "Maya's spending ledger cannot be read, so she starts no new work.",
  unavailable: "The server is missing its database key.",
  voice_unavailable: "Voice calls are not set up on this server yet.",
  voice_call: "Maya's voice helper is running this call. Hang up from the call first.",
  failed: "Something went wrong. Try again.",
};

// Pacific time on the server and in the browser alike, so the server render and hydration agree (Vercel runs in UTC).
const when = (iso: string) => formatInZone(iso, PACIFIC_ZONE, { dateStyle: "medium", timeStyle: "short" });
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const named = (text: string, name: string | null) => text.replaceAll("{name}", name ?? "the child");

function ModelChip({ model }: { model: { id: string; fake: boolean } }) {
  return model.fake
    ? <span className="adm-chip is-warn" title="Maya used saved test lines for this call.">Scripted Maya, not the AI</span>
    : <span className="adm-chip is-info">{modelName(model)}</span>;
}

// ---------- the picker ----------

export function MayaPicker({ children, model, voice }: { children: DemoChild[]; model: { id: string; fake: boolean }; voice: boolean }) {
  const router = useRouter();
  const [childId, setChildId] = useState(children[0]?.childId ?? "");
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const child = children.find((c) => c.childId === childId) ?? null;

  async function start(assessmentId: string, questionId: string) {
    setBusy(`${assessmentId}:${questionId}`);
    setError(null);
    try {
      const res = await fetch(mode === "voice" ? "/api/admin/maya/voice" : "/api/admin/maya/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assessmentId, questionId }) });
      const body = await res.json().catch(() => null);
      if (!body?.ok) throw new Error(body?.error ?? "failed");
      router.push(`${ADMIN_PATH}/maya/${mode === "voice" ? body.callId : body.view.id}`);
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
      <fieldset className="mc-mode">
        <legend>How you talk to Maya</legend>
        <div className="mc-mode-options">
          <label className={mode === "text" ? "is-on" : undefined}>
            <input type="radio" name="mc-mode" value="text" checked={mode === "text"} onChange={() => setMode("text")} />
            <span>Type</span>
          </label>
          <label className={mode === "voice" ? "is-on" : undefined} aria-disabled={!voice || undefined}>
            <input type="radio" name="mc-mode" value="voice" checked={mode === "voice"} disabled={!voice} onChange={() => setMode("voice")} />
            <span>Speak</span>
          </label>
        </div>
        <p className="adm-note">
          {voice
            ? mode === "voice" ? "You speak as the child into the microphone, and Maya answers out loud. The call page checks the microphone first." : "You type what the child says, and read Maya's answers."
            : "Speaking needs the voice setup, which this server does not have yet. Typing works."}
        </p>
      </fieldset>
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
                    <p className="adm-sub">Question {q.number} · Answer {q.answer}{q.skill && <> · {q.skill}</>}</p>
                  </div>
                  <button type="button" className="btn sm adm-btn" disabled={busy !== null} onClick={() => start(q.assessmentId, q.questionId)}>
                    {busy === key ? "Starting…" : mode === "voice" ? "Talk to Maya" : "Call Maya"}
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

function CallPages({ older, newer }: { older?: string | null; newer?: string | null }) {
  if (!older && !newer) return null;
  const href = (cursor: string) => cursor === "start" ? `${ADMIN_PATH}/maya` : `${ADMIN_PATH}/maya?cursor=${encodeURIComponent(cursor)}`;
  return <nav className="mc-pages" aria-label="Call pages">
    {newer && <Link className="btn sm ghost adm-btn" href={href(newer)}>Newer calls</Link>}
    {older && <Link className="btn sm ghost adm-btn" href={href(older)}>Older calls</Link>}
  </nav>;
}

export function MayaCallList({ calls, older, newer }: { calls: CallListRow[]; older?: string | null; newer?: string | null }) {
  return (
    <>
    <CallPages older={older} newer={newer} />
    {calls.length === 0 ? <p className="adm-empty">No calls on this page.</p> :
    <div className="adm-scroll mc-calls">
      <table className="adm-table">
        <thead>
          <tr><th>Started and flag</th><th>Child and question</th><th>How</th><th>Outcome and help</th><th className="adm-num">Call time</th><th className="adm-num">Minutes used</th><th>Numbers Maya checked</th></tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td data-label="Started and flag">
                <Link href={`${ADMIN_PATH}/maya/${c.id}`}>{when(c.createdAt)}</Link>
                {(() => { const t = safetyText(c.flag, c.safetySeverity, c.safetyFlag); return t && <span className="adm-chip is-bad mc-list-flag">{t}</span>; })()}
              </td>
              <td data-label="Child and question">{c.childName ?? "Child"}<span className="adm-sub">{c.questionText}</span></td>
              <td data-label="How">{c.kind === "chat" ? "Chat" : c.mode === "voice" ? "Spoken" : "Typed"}</td>
              <td data-label="Outcome and help">
                {c.status === "live" ? <span className="adm-chip is-info">Live</span> : c.outcome ? <span className={`adm-chip ${c.outcome === "solved" ? "is-ok" : "is-muted"}`}>{REASON_TEXT[c.outcome]}</span> : "-"}
                {c.assistance && <span className="adm-sub">{ASSISTANCE_TEXT[c.assistance]}</span>}
              </td>
              <td data-label="Call time" className="adm-num">{c.seconds === null ? "-" : clock(c.seconds)}</td>
              <td data-label="Minutes used" className="adm-num" title="Chat and test calls do not use voice minutes">0</td>
              <td data-label="Numbers Maya checked" title="Numbers Maya asked to confirm, and times the child said she heard wrong">{c.mishearing ? `${c.mishearing.confirmations} checked, ${c.mishearing.corrections} fixed` : "Not recorded"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>}
    <CallPages older={older} newer={newer} />
    </>
  );
}

// ---------- the call ----------

export function MayaCall({ initial, board: firstBoard, childName }: { initial: CallView; board: BoardView; childName: string | null }) {
  const [view, setView] = useState(initial);
  const [board, setBoard] = useState(initial.mode === "voice" && initial.status === "live" ? { steps: [], viewBox: "0 0 1000 1000" } as BoardView : firstBoard);
  /** Board steps already drawn before the last answer: only the new ones animate. */
  const voiceShown = useRef(-1);
  const [shown, setShown] = useState(initial.status === "ended" ? firstBoard.steps.length : 0);
  const saved = useMemo(() => callReplay(view), [view]);
  // Maya's steps the board could not draw over the child's writing (R625-1): left out of the replay, and said so.
  const notDrawn = useMemo(() => refusedBatches(view.boardHistory).length, [view]);
  const [position, setPosition] = useState(Infinity);
  const cursor = useRef(Infinity);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [selectedLine, setSelectedLine] = useState(-1);
  const seek = (ms: number, line = -1) => { cursor.current = ms; setPosition(ms); setSelectedLine(line); };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const reduced = useReducedMotion();
  const talk = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const live = view.status === "live";
  const voice = view.mode === "voice";

  /** Reads the saved call again (a voice call changes in Maya's voice helper, not here). */
  const drawn = board.steps.length;
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/admin/maya/calls/${view.id}`, { cache: "no-store" }).catch(() => null);
    const body = await res?.json().catch(() => null);
    if (!body?.ok) return;
    if (!voice) { setShown(drawn); setBoard(body.board); }
    setView(body.view);
  }, [view.id, drawn, voice]);

  const activeLine = !live && position !== Infinity ? selectedLine >= 0 && !playing ? selectedLine : view.transcript.findLastIndex((l) => l.second * 1000 <= position) : -1;
  useEffect(() => {
    if (!playing || reduced || live) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(saved.durationMs, cursor.current + (now - last) * speed);
      last = now;
      cursor.current = next;
      setPosition(next);
      if (next >= saved.durationMs) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, saved.durationMs, reduced, live]);

  useEffect(() => {
    if (activeLine < 0) return;
    const list = talk.current;
    const line = list?.children[activeLine] as HTMLElement | undefined;
    if (!list || !line) return;
    const scroll = () => list.scrollTo({ top: Math.max(0, line.offsetTop - 12), behavior: "instant" });
    scroll();
    const observer = new ResizeObserver(scroll);
    observer.observe(list);
    observer.observe(line);
    return () => observer.disconnect();
  }, [activeLine, playing]);

  useEffect(() => {
    if (!live) return;
    // The list scrolls, not the page: the newest line in view.
    const list = talk.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [view.transcript.length, reduced, live]);

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
          <p className="adm-crumb"><Link href={`${ADMIN_PATH}/maya`}>Maya calls</Link> · {view.kind === "chat" ? "Chat" : "Test call"} · {childName ?? "Child"}</p>
          <h1>{view.questionText}</h1>
        </div>
        <div className="mc-chips">
          {live ? <span className="adm-chip is-info">Live</span> : <span className="adm-chip is-muted">Finished</span>}
          {voice && <span className="adm-chip is-muted">Spoken call</span>}
          <ModelChip model={view.model} />
          <span className="adm-chip is-muted">{view.kind === "chat" ? "Chat: no voice minutes used" : "Test family: no minutes used, no parent emails"}</span>
        </div>
      </header>

      {view.flag && <FlagStrip view={view} live={live} onRetry={() => send({ type: "end" })} busy={busy} />}

      <div className="mc-grid">
        <section className="mc-maya" aria-label="The call">
          <header className="mc-maya-head">
            {/* A small fixed picture; the image optimizer adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mc-avatar" src="/desk/maya.webp" alt="" width={40} height={40} />
            <div>
              <h2>Maya</h2>
              <p>{live && view.kind === "chat" ? "The child chats on the desk. This view is read-only." : live ? (voice ? `You speak as ${childName ?? "the child"}.` : busy ? "Maya is thinking…" : `You type as ${childName ?? "the child"}.`) : "The call has ended."}</p>
            </div>
          </header>

          <ol ref={talk} className="mc-talk" aria-live="polite">
            {view.transcript.map((line, i) => (
              <li key={i} className={`mc-line is-${line.speaker}${activeLine === i ? " is-current" : ""}`} aria-current={activeLine === i ? "step" : undefined}>
                {live ? line.speaker !== "note" && <span className="mc-who">{line.speaker === "maya" ? "Maya" : childName ?? "Child"} · {clock(line.second)}</span> :
                  <button type="button" className="mc-who mc-jump" onClick={() => { setPlaying(false); seek(line.second * 1000, i); }} aria-label={`Show board at ${clock(line.second)}, turn ${i + 1}`}>
                    {line.speaker === "maya" ? "Maya" : line.speaker === "child" ? childName ?? "Child" : "Note"} · {clock(line.second)}
                  </button>}

                <p>{named(line.text, childName)}</p>
              </li>
            ))}
            {busy && <li className="mc-line is-maya is-typing" aria-label="Maya is thinking"><p><span /><span /><span /></p></li>}
          </ol>
          {safety && <p className="mc-safety" role="status">{safety}</p>}

          {live && voice ? (
            <VoicePanel
              callId={view.id}
              childName={childName}
              started={view.startedAt !== null}
              onBoard={(snapshot: BoardSnapshot, restored: boolean) => {
                let scene = createScene();
                const steps: PlayStep[] = [];
                for (const event of snapshot.events) {
                  if (event.kind !== "batch") continue;
                  const r = applyBatch(scene, { transactionId: event.batchId, commands: event.commands });
                  if (!r.ok) return;
                  scene = r.scene;
                  steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(scene) });
                }
                if (!restored && steps.length === voiceShown.current) return;
                setShown(restored ? steps.length : Math.max(0, voiceShown.current));
                voiceShown.current = steps.length;
                setBoard({ steps, viewBox: fitView(steps.flatMap(s => s.drawn), 0.03) });
              }}
              onUpdate={refresh}
              onEnded={async () => {
                // The worker stores the end a moment after the room closes.
                for (const wait of [300, 1200, 3000]) {
                  await new Promise((r) => setTimeout(r, wait));
                  await refresh();
                }
              }}
              onCancel={() => void send({ type: "end" })}
              busy={busy}
            />
          ) : live && view.kind !== "chat" ? (
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
          {live && voice && error && <p className="mc-error mc-error-pad" role="alert">{error}</p>}
        </section>

        <section className="mc-board" aria-label="Our board">
          <div className="mc-board-head">
            <h2>Our board</h2>
          </div>
          {!live ? (
            <>
              <div className="replay-controls mc-play" role="group" aria-label="Call replay">
                <button type="button" className="is-primary" disabled={reduced || saved.durationMs === 0} onClick={() => {
                  if (playing) setPlaying(false);
                  else { if (cursor.current >= saved.durationMs) seek(0); setSelectedLine(-1); setPlaying(true); }
                }}>{playing && !reduced ? "Pause" : "Replay the call"}</button>
                <button type="button" onClick={() => { setPlaying(false); seek(Infinity); }}>Show finished</button>
                <label>Speed <select aria-label="Replay speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                  <option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option>
                </select></label>
                <input type="range" min={0} max={saved.durationMs} step={100} value={Math.min(position, saved.durationMs)} aria-label="Call replay position" aria-valuetext={`${clock(Math.floor(Math.min(position, saved.durationMs) / 1000))} of ${clock(Math.ceil(saved.durationMs / 1000))}`} onChange={(e) => seek(Number(e.target.value))} />
                <span className="replay-time">{clock(Math.floor(Math.min(position, saved.durationMs) / 1000))} / {clock(Math.ceil(saved.durationMs / 1000))}</span>
              </div>
              {view.boardHistory.events.length === 0 ? <p className="mc-board-empty">No board work was saved for this call.</p> :
                <MayaBoard steps={board.steps} viewBox={saved.viewBox} label={boardLabel} frame={replayFrame(saved, position)} />}
              {notDrawn > 0 && <p className="adm-note">{notDrawn === 1 ? "1 step of Maya's is not drawn here: it would have covered the child's writing, so the child's board did not show it either." : `${notDrawn} steps of Maya's are not drawn here: they would have covered the child's writing, so the child's board did not show them either.`}</p>}
              <p className="adm-note">{reduced ? "The board stays still because your device asks for less motion. Select a time or a transcript turn to review it." : "The board and the highlighted turn follow the same time. Select a turn to see the board then."}</p>
            </>
          ) : board.steps.length === 0 ? (
            <div className="mc-board-empty">Maya writes here when she works a step.</div>
          ) : (
            <MayaBoard steps={board.steps} viewBox={board.viewBox} label={boardLabel} instant={reduced} shown={shown} />
          )}
        </section>
      </div>

      <section aria-label="Workbook scope refusals">
        <p>Workbook scope refusals in this session: {view.scopeRefusals?.length ?? 0}</p>
        {!!view.scopeRefusals?.length && <ul>{view.scopeRefusals.map((r, i) => <li key={i}>{SCOPE_LABELS[r.reason]}</li>)}</ul>}
      </section>
      {!live && <CallRecordFacts view={view} childName={childName} onRetry={() => send({ type: "end" })} busy={busy} error={error} />}
    </div>
  );
}

/** What each check made of Maya's own words (D-197): the code guards, the review, and what the child heard. */
const REVIEW_TEXT = { pass: "Passed", fail: "Failed", error: "Failed (no answer)", not_run: "Not asked" } as const;

function FreeTalkChecks({ freeTalk }: { freeTalk: CallView["freeTalk"] }) {
  if (!freeTalk.on) return <p className="mc-note">Maya used saved phrases for this call.</p>;
  if (freeTalk.lines.length === 0) return <p className="mc-note">On, review {freeTalk.reviewer ?? "none"}. Maya used no words of her own in this call.</p>;
  return (
    <>
      <p className="mc-note">On, review <span className="adm-mono">{freeTalk.reviewer ?? "none"}</span>. Maya&apos;s own words are said only when the code guards and the review pass; otherwise a saved phrase.</p>
      <div className="mc-talk">
        <table className="adm-table">
          <thead><tr><th>Time</th><th>Maya proposed</th><th>Automatic checks</th><th>Review</th><th>The child heard</th></tr></thead>
          <tbody>
            {freeTalk.lines.map((l, i) => (
              <tr key={i} className={l.said ? undefined : "is-wrong"}>
                <td className="adm-mono">{clock(l.second)}</td>
                <td>{l.proposed}</td>
                <td>{l.code === null ? <span className="adm-chip is-ok">Passed</span> : <><span className="adm-chip is-warn">Failed</span> {l.code}</>}</td>
                <td>
                  <span className={`adm-chip ${l.review === "pass" ? "is-ok" : l.review === "not_run" ? "is-muted" : "is-bad"}`}>{REVIEW_TEXT[l.review]}</span>
                  {l.rules.length > 0 && <> <span className="adm-mono">{l.rules.join(", ")}</span></>}
                  {l.reason && <div className="mc-talk-why">{l.reason}</div>}
                </td>
                <td>{l.shown}{l.said ? "" : " (saved phrase)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The call's flag (#333) and its alert emails to the team: sent, not sent, or not sure. A live call sends a missing or
 * refused alert again with its next turn; an ended call with the button. A failed send's provider answer stays in the closed technical details.
 */
function FlagStrip({ view, live, onRetry, busy }: { view: CallView; live: boolean; onRetry: () => void; busy: boolean }) {
  const flag = view.flag!;
  const current = view.alerts.find((a) => a.level === flag.level);
  const retry = !live && (!current || current.status === "refused");
  return (
    <section className="mc-flag" aria-label="Safety flag">
      <p className="mc-flag-head"><span className="adm-chip is-bad">{FLAG_TEXT[flag.level]}</span> <span>Raised {when(flag.at)} · Read the conversation below to see why.</span></p>
      <ul className="mc-flag-alerts">
        {!current && <li><span className="adm-chip is-warn">No alert email yet</span> <span className="mc-flag-why">{noAlertNote(live)}</span></li>}
        {view.alerts.map((a) => {
          const note = alertNote(a.status, live, a.level === flag.level);
          return (
            <li key={a.level}>
              <span className={`adm-chip ${a.status === "sent" ? "is-ok" : a.status === "sending" ? "is-info" : "is-warn"}`}>{ALERT_TEXT[a.status]}</span>{" "}
              {FLAG_TEXT[a.level]} · {when(a.claimedAt)}
              {note && <span className="mc-flag-why" > {note}</span>}
            </li>
          );
        })}
      </ul>
      {retry && <p className="mc-retry"><button type="button" className="btn sm ghost adm-btn" onClick={onRetry} disabled={busy}>{busy ? "Sending…" : current ? "Send the email again" : "Send the alert email"}</button></p>}
    </section>
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
          <div><dt>Strongest hint</dt><dd>{o.highestHint === null ? "None" : HINT_TEXT[o.highestHint]}</dd></div>
          <div><dt>On paper</dt><dd>{PAPER_TEXT[o.paperStatus]}</dd></div>
          <div><dt>Understanding</dt><dd>{UNDERSTANDING_TEXT[o.understanding]}</dd></div>
          <div><dt>Call time</dt><dd>{clock(Math.round(o.seconds))}</dd></div>
          <div><dt>Turns</dt><dd>{view.counts ? `${view.counts.childTurns} from ${childName ?? "the child"}, ${view.counts.mayaTurns} from Maya` : "-"}</dd></div>
          <div><dt>Backup lines used</dt><dd title="Times the AI's answer could not be used, so Maya said a line from the backup script">{view.counts?.fallbacks ?? "-"}</dd></div>
          <div><dt>Safety</dt><dd>{(() => { const t = safetyText(view.flag?.level ?? null, o.safetySeverity, o.safetyFlag); return t ? <span className="adm-chip is-bad">{t}</span> : "No concern"; })()}</dd></div>
          <div><dt>Numbers Maya checked</dt><dd>{o.mishearing.confirmations} checked, {o.mishearing.corrections} fixed</dd></div>
        </dl>
      )}

      <dl className="adm-facts">
        <div><dt>Minutes used</dt><dd>0 <span className="adm-sub">{view.kind === "chat" ? "Chat does not use voice minutes." : "Test calls do not use the child’s minutes."}</span></dd></div>
        {view.voice && <div><dt>Connected time</dt><dd>{view.voice.connectedSeconds === null ? "Not recorded" : clock(view.voice.connectedSeconds)}</dd></div>}
      </dl>

      <h3 className="mc-sub">Child&apos;s record</h3>
      <dl className="adm-facts">
        <div><dt>Saved to child&apos;s record</dt><dd>{view.learningEventId ? <span className="adm-chip is-ok">Yes</span> : <span className="adm-chip is-warn">Not yet</span>}</dd></div>
        <div><dt>Child&apos;s profile updated</dt><dd>{view.profileRebuiltAt ? when(view.profileRebuiltAt) : "Not yet"}</dd></div>
        <div><dt>Child&apos;s profile</dt><dd><Link href={adminChildProfilePath(view.childId)}>Open the profile</Link></dd></div>
        <div><dt>Question</dt><dd>{question.source === "assessment" ? <Link href={adminTestPath(question.assessmentId)}>Open the test</Link> : `Workbook page ${question.page}, number ${question.question}`}</dd></div>
      </dl>
      {(!view.learningEventId || !view.profileRebuiltAt) && (
        <p className="mc-retry">
          <button type="button" className="btn sm ghost adm-btn" onClick={onRetry} disabled={busy}>{busy ? "Trying…" : "Try saving again"}</button>
          {error && <span className="mc-error" role="alert">{error}</span>}
        </p>
      )}

      <details className="mc-tech">
        <summary>Technical details</summary>
        <h3 className="mc-sub">Generated speech checks</h3>
        <FreeTalkChecks freeTalk={view.freeTalk} />
        <dl className="adm-facts">
          {view.voice && <>
            <div><dt>Speech to text version</dt><dd className="adm-mono">{view.voice.speechToText ?? "Not recorded"}</dd></div>
            <div><dt>Voice version</dt><dd className="adm-mono">{view.voice.voice ?? "Not recorded"}</dd></div>
          </>}
          {view.technicalNotes.map((note, i) => <div key={`note-${i}`}><dt>Service detail</dt><dd>{note}</dd></div>)}
          {view.alerts.filter((a) => a.error).map((a) => <div key={a.level}><dt>Alert service detail</dt><dd>{a.error}</dd></div>)}
          <div><dt>Maya</dt><dd>{modelName(view.model)} <span className="adm-mono">{view.model.id}</span></dd></div>
          <div><dt>Instructions version</dt><dd className="adm-mono">{view.model.promptVersion}</dd></div>
          <div><dt>Saved phrases version</dt><dd className="adm-mono">{String(view.versions.lines)}</dd></div>
          <div><dt>Call rules version</dt><dd>{view.versions.session}</dd></div>
          <div><dt>Suggested steps version</dt><dd>{view.versions.proposal}</dd></div>
          <div><dt>Call record version</dt><dd>{view.versions.trace}</dd></div>
          <div><dt>Question package</dt><dd className="adm-mono" title={view.packageHash}>{view.packageHash.slice(0, 19)}…</dd></div>
          <div><dt>Call id</dt><dd className="adm-mono">{view.id}</dd></div>
        </dl>
      </details>
    </section>
  );
}
