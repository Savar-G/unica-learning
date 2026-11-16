// Persistent transition rules for the text adapter. No provider, clock, promise or abort signal enters this fold.
import { applyBatch, createScene, type Batch, type Scene } from "@/lib/board";
import { withEmittedHelp, type Assistance } from "@/lib/maya/session";
import { BOARD_FATES, nextActs, speechKey, step, TIME_LIMITS, SAFETY_GUIDANCE, type Act, type BoardFate, type Effect, type MathReview, type Session, type SessionEvent, type TalkReview, type TiedDrawing } from "@/lib/maya";
import { type TraceAttempt, type TraceBoardBatch, type TraceError, type TraceObligation, type TraceTurn } from "@/lib/maya-trace";
import type { TextOutput } from "@/lib/maya-text";

export interface TextLogInitial {
  session: Session;
  endedAt: number | null;
  turns: TraceTurn[];
  board: TraceBoardBatch[];
  approved?: string[];
  obligations?: TraceObligation[];
  childState?: "listening" | "child_speaking";
  problems?: string[];
}
export type TextLogEvent =
  | { kind: "input"; at: number; event: SessionEvent; error?: TraceError }
  /** `filler`: the voice worker's thinking phrase (an acknowledgement id) said when this repair started; absent otherwise. */
  /**
   * `continuation` (2026-11-15, voice fallbacks): a tutor repair that started after streamed sentences and continues them
   * (continuedSay). Fixed when the repair starts: sentences a plain repair streams itself never make it one.
   */
  | { kind: "request"; at: number; requestId: number; source: "model" | "repair"; filler?: string; continuation?: true }
  | { kind: "response"; at: number; requestId: number; proposal?: unknown; error?: TraceError; ms: number; fenced?: true; sent?: string[]; firstSayMs?: number; gateDisagrees?: true; priority?: Record<string, unknown> }
  /**
   * #1107 (chat): one checked sentence of the request in flight, and the drawing fixed for it (`board`), written and
   * saved before the desk gets either. Accepted progress: the sentence is said (as `sent`), its help is in the session,
   * and its batch is committed (`streamed_board`). A later response, repair, fallback or code line keeps both.
   */
  | { kind: "part"; at: number; requestId: number; sentence: string; board?: StreamedBoard }
  /** `mathReviews`: two-layer true math (2026-11-15); absent in an event written before the math-truth review existed. */
  /**
   * `drawMode` (B2): "derive" on a proposal stepped live since B2 derives drawings from Maya's sentences. A saved event
   * without it is replayed exactly as it was stepped (no derived drawing), so a restored call keeps its batches and ids.
   */
  | { kind: "review"; at: number; requestId: number; reviews: TalkReview[]; mathReviews?: MathReview[]; reviewMs?: number; drawMode?: "derive" }
  | { kind: "fallback"; at: number; proposal: unknown; drawMode?: "derive" }
  | { kind: "recover"; at: number }
  | { kind: "cancelled"; at: number }
  | { kind: "delivered"; at: number }
  /** B1: what the child's screen did with board batches Maya sent (boardFates), by transaction id. */
  | { kind: "fates"; at: number; fates: { batchId: string; fate: BoardFate }[] }
  /**
   * Final check 12 (2026-11-15): the help a sentence gave, written the moment it was emitted to the child (the help
   * ledger). Cancellation, a deadline, a hang-up, a replacement turn and an error never take it back.
   */
  | { kind: "help"; at: number; assistance: Assistance };

/** #1107: a drawing streamed with its sentence: the batch, its keys, and its place in the message's drawings (`tied`). */
export interface StreamedBoard { batch: Batch; keys: string[]; tied: TiedDrawing }
/** `ties` (B2): the sentence each batch is tied to, by transaction id; a batch not in it goes at the end of the turn. */
type PendingOutput = { entry: Extract<TraceTurn, { kind: "maya" }>; act: Act; say: string[]; batches: Batch[]; ties?: Record<string, number>; obligations: number[]; control: number };
export interface TextFold {
  session: Session;
  /** Upper bound on persisted event content for one live call. */
  historyBytes: number;
  scene: Scene;
  endedAt: number | null;
  turns: TraceTurn[];
  board: TraceBoardBatch[];
  approved: string[];
  approvals: { outputId: number; turn: number; text: string; cancelled: boolean; acknowledged: boolean }[];
  nextOutputId: number;
  initialSession: Session;
  initialScene: Scene;
  controls: { event: SessionEvent; replaceTurn?: boolean; cancelled?: boolean }[];
  obligations: TraceObligation[];
  childState: "listening" | "child_speaking";
  request: { id: number; source: "model" | "repair"; filler?: string; continuation?: true } | null;
  candidate: { requestId: number; proposal: unknown; ms: number; source: "model" | "repair"; fenced?: true; firstSayMs?: number; gateDisagrees?: true; filler?: string; continuation?: true } | null;
  /** D-341: sentences of the current Maya turn already streamed to the child; every later attempt of the turn starts with them. */
  sent?: string[];
  /**
   * #1107 (chat): how many of `sent` came as saved parts, and the drawings committed with them, in order. The turn's
   * output carries these batches first; its own drawings never draw those sentences again.
   */
  parts?: number;
  streamBoard?: StreamedBoard[];
  attempts: TraceAttempt[];
  deferred: { event: SessionEvent; childId: number | null }[];
  pending: PendingOutput[];
  output: Pick<TextOutput, "say" | "board" | "cancelled">;
  /**
   * B1, before B2's review: the batches the child's screen skipped or cancelled, undone one by one. No longer written:
   * the server's board is rebuilt from the batch fates (`shownScene`). Kept so an older checkpoint still reads.
   */
  undos?: { at: number; transactionId: string }[];
  /** B1: words from the screen that came while an output was pending, applied once it is delivered. */
  lateFates?: { at: number; batchId: string; fate: BoardFate }[];
}
export type TextCheckpoint = Omit<TextFold, "scene" | "initialScene" | "endedAt"> & { sceneBatches: Batch[]; initialSceneBatches: Batch[] };
export function saveTextCheckpoint(s: TextFold): TextCheckpoint {
  const { scene: _scene, initialScene: _initialScene, endedAt: _endedAt, ...data } = s;
  void _scene; void _initialScene; void _endedAt;
  const committed = s.board.map((b) => ({ transactionId: b.transactionId, commands: b.commands }));
  // #1107: streamed drawings are on the board after the pending outputs; with none pending, their controls are committed.
  const streamed = (s.streamBoard ?? []).map((b) => b.batch);
  return structuredClone({ ...data, sceneBatches: [...committed, ...s.pending.flatMap((p) => p.batches), ...streamed], initialSceneBatches: [...committed, ...(s.pending.length ? [] : streamed)] });
}
/**
 * B1 and B2 (review of #1094): the server's board as the child's screen holds it, rebuilt from the batch fates: every
 * batch Maya sent, in order, except the ones the screen skipped or cancelled, then `extra` (batches still pending). One
 * undo cannot take a skipped batch off when a later shown batch builds on the board after it (per-sentence batches), so
 * the board is rebuilt, never undone. A batch that no longer fits without a skipped one is left out (fail closed). A
 * batch that does not fit while nothing was skipped means the saved board is broken: it throws.
 */
function shownScene(board: readonly { transactionId: string; commands: readonly unknown[]; fate?: BoardFate; after?: readonly string[] }[], extra: readonly Batch[] = []): Scene {
  let scene = createScene();
  let hidden = false;
  const off = new Set<string>();
  for (const b of [...board, ...extra.map((x) => ({ ...x, fate: undefined }))]) {
    // B2: a batch that builds on one the screen did not show is off the board too.
    if (b.fate === "skipped" || b.fate === "cancelled" || b.after?.some((id) => off.has(id))) { hidden = true; off.add(b.transactionId); continue; }
    const applied = applyBatch(scene, { transactionId: b.transactionId, commands: b.commands as Batch["commands"] });
    if (applied.ok) scene = applied.scene;
    else if (!hidden) throw new Error(`maya text: the saved board batch ${b.transactionId} does not apply again`);
  }
  return scene;
}
export function restoreTextCheckpoint(checkpoint: TextCheckpoint): TextFold {
  const { sceneBatches: _sceneBatches, initialSceneBatches: _initialSceneBatches, ...data } = structuredClone(checkpoint);
  void _sceneBatches; void _initialSceneBatches;
  // The batches of the checkpoint are its committed board and its pending outputs, in that order (saveTextCheckpoint).
  const streamed = (data.streamBoard ?? []).map((b) => b.batch);
  return { ...data, endedAt: data.session.outcome ? data.session.now : null, scene: shownScene(data.board, [...data.pending.flatMap((p) => p.batches), ...streamed]), initialScene: shownScene(data.board, data.pending.length ? [] : streamed) };
}
export const MAX_TEXT_HISTORY_BYTES = 262144;
const emptyOutput = (): TextFold["output"] => ({ say: [], board: [], cancelled: false });
export function textOutput(s: TextFold): TextOutput {
  return { ...structuredClone(s.output), ended: s.session.outcome, safetyMessage: s.session.outcome && s.session.safety.flagged ? SAFETY_GUIDANCE[s.session.safety.severity!] : null };
}
const due = (s: TextFold, kind: TraceObligation["kind"]) => s.obligations.filter((o) => o.kind === kind && o.status === "pending");
function owe(s: TextFold, kind: TraceObligation["kind"], at: number, extra = {}) {
  const o: TraceObligation = { id: (s.obligations.at(-1)?.id ?? -1) + 1, kind, at, status: "pending", ...extra };
  s.obligations.push(o);
  return o;
}
function drop(o: TraceObligation, reason: string) { o.status = "dropped"; o.reason = reason; }
function terminal(s: TextFold) {
  if (!s.session.outcome) return;
  const protectedIds = s.pending.flatMap((p) => p.obligations);
  for (const o of s.obligations) if (o.status === "pending" && !protectedIds.includes(o.id)) drop(o, `call ended: ${s.session.outcome.reason}`);
}
function refreshOutput(s: TextFold) {
  s.output.say = s.pending.flatMap((p) => p.say);
  s.output.board = s.pending.flatMap((p) => p.batches);
  s.endedAt = s.session.outcome ? s.session.now : null;
}
/** Recompute controller state after an output decision. Inputs and priority readings remain in their original order. */
function replayControls(s: TextFold, count = s.controls.length) {
  let session = structuredClone(s.initialSession);
  let scene = s.initialScene;
  for (const c of s.controls.slice(0, count)) {
    let event = c.event;
    if (c.replaceTurn) session.turn = null;
    if (c.cancelled && event.type === "proposal") {
      const reading = event.proposal && typeof event.proposal === "object" ? (event.proposal as { reading?: unknown }).reading : undefined;
      event = { type: "proposal", at: event.at, proposal: { reading } };
    }
    const r = step(session, event);
    session = r.session;
    if (!r.refusal) for (const e of r.effects) if (e.kind === "board") {
      const applied = applyBatch(scene, e.batch);
      if (applied.ok) scene = applied.scene;
    }
    // A fate is heard only with no output pending, so the board then is the committed board with its fates.
    if (event.type === "board_fate" && event.fate !== "shown") scene = shownScene(s.board);
  }
  return { session, scene };
}
function rebuildController(s: TextFold) { Object.assign(s, replayControls(s)); }
/** Commit every control before the first output that can still be cancelled. */
function commitControls(s: TextFold) {
  const count = Math.min(s.controls.length, ...s.pending.map((p) => p.control));
  if (!count) return;
  const checkpoint = replayControls(s, count);
  s.initialSession = checkpoint.session; s.initialScene = checkpoint.scene;
  s.controls.splice(0, count);
  for (const p of s.pending) p.control -= count;
}
export function matchesApproval(s: TextFold, text: string) {
  return s.approvals.find((a) => !a.cancelled && !a.acknowledged && a.text.split(/(?<=[.?!])\s+/).some((_sentence, i, all) => speechKey(text) === speechKey(all.slice(0, i + 1).join(" "))));
}
function controllerStep(s: TextFold, event: SessionEvent, replaceTurn = false) {
  s.controls.push({ event: structuredClone(event), ...(replaceTurn ? { replaceTurn: true } : {}) });
  if (replaceTurn) s.session.turn = null;
  return step(s.session, event);
}
function cancel(s: TextFold, reason: string, urgent = false, revoke = true) {
  const hadRequest = s.request !== null || s.candidate !== null;
  if (revoke) { for (const a of s.approvals) a.cancelled = true; s.approved = []; }
  s.request = null;
  s.candidate = null;
  s.attempts = [];
  // #1107: saved parts are accepted progress, not speculative state: their sentences (and drawings) stay with the turn.
  const kept = s.parts ? s.sent : undefined;
  delete s.sent;
  if (kept?.length) s.sent = kept;
  // These controller outputs are debts, not speculative state. Cancellation never undoes them.
  const keep = urgent ? ["safety"] : ["open", "repair", "safety"];
  s.pending = s.pending.filter((p) => {
    if (keep.includes(p.act)) return true;
    s.controls[p.control].cancelled = true;
    for (const id of p.obligations) {
      const o = s.obligations.find((o) => o.id === id);
      if (o?.status === "pending") drop(o, reason);
    }
    return false;
  });
  if (hadRequest || s.pending.length || s.output.say.length) s.output.cancelled = true;
  rebuildController(s);
  refreshOutput(s);
}
function syncSafety(s: TextFold, at: number) {
  if (!s.session.safety.flagged || !s.session.safety.severity) return;
  const severity = s.session.safety.severity;
  const old = due(s, "safety_due")[0];
  if (old?.severity === "concern" && severity === "immediate") {
    s.pending = s.pending.filter((p) => {
      if (p.act !== "safety") return true;
      s.controls[p.control].cancelled = true;
      return false;
    });
    rebuildController(s);
    old.severity = severity;
    refreshOutput(s);
  }
  if (!s.session.safety.guided) {
    if (!old) owe(s, "safety_due", at, { severity });
    else old.severity = severity;
  }
}
function receiveReading(s: TextFold, reading: unknown, at: number, gate?: unknown) {
  // Invalid shape applies only the controller's priority reading. It cannot score or speak.
  const r = controllerStep(s, { type: "proposal", at, proposal: { reading, ...(gate === undefined ? {} : { gate }) } });
  const previous = s.session.safety.severity;
  s.session = r.session;
  syncSafety(s, at);
  if (s.session.safety.severity !== previous) {
    // Words already streamed stay said: the guidance follows them in the saved turn (round 4).
    const request = s.request, candidate = s.candidate, attempts = s.attempts, sent = s.sent;
    cancel(s, "superseded by safety", true);
    s.request = request; s.candidate = candidate; s.attempts = attempts;
    if (sent?.length) s.sent = sent;
  }
  takeEffects(s, r.effects, at);
}
function takeEffects(s: TextFold, effects: Effect[], at: number, attempts: TraceAttempt[] = [], stateBefore = s.session.state) {
  for (const e of effects) {
    if (e.kind === "cancel_output") s.output.cancelled = true;
  }
  const says = effects.filter((e) => e.kind === "say");
  const batches = effects.flatMap((e) => e.kind === "board" ? [e.batch] : []);
  const ties = Object.fromEntries(effects.flatMap((e) => (e.kind === "board" && e.sentence !== undefined ? [[e.batch.transactionId, e.sentence] as const] : [])));
  if (says.length || attempts.length) {
    const act = says.at(-1)?.act ?? (attempts.at(-1)?.proposal as { act?: Act } | null)?.act ?? "close";
    const entry: Extract<TraceTurn, { kind: "maya" }> = { kind: "maya", at, state: stateBefore, stateAfter: s.session.state, finalMisses: s.session.finalMisses ?? 0, attempts: attempts.length ? attempts : [{ source: "controller", proposal: null, refusal: null }], output: null };
    if (says.length || (attempts.length && !attempts.at(-1)?.refusal && !attempts.at(-1)?.error)) {
      const kinds: TraceObligation["kind"][] = act === "open" ? ["opening_due"] : act === "repair" ? ["repair_due"] : act === "safety" ? ["safety_due"] : act === "close" ? ["child_turn_pending", "content_problem"] : s.session.turn === null ? ["child_turn_pending"] : [];
      const ids = s.obligations.filter((o) => o.status === "pending" && kinds.includes(o.kind) && !s.pending.some((p) => p.obligations.includes(o.id))).map((o) => o.id);
      s.pending.push({ entry, act, say: says.map((e) => e.text), batches, ...(Object.keys(ties).length ? { ties } : {}), obligations: ids, control: s.controls.length - 1 });
    }
  }
  refreshOutput(s);
  terminal(s);
}
function applyInput(s: TextFold, event: SessionEvent, error?: TraceError, record = true) {
  const at = Math.max(event.at, s.session.now ?? 0);
  event = { ...event, at };
  if (event.type === "start" && s.session.startedAt !== null) return;
  if (s.session.outcome || (event.type !== "start" && s.session.startedAt === null)) return;
  let start: TraceObligation | undefined;
  if (event.type === "start") start = owe(s, "start_pending", at);
  if (event.type === "child_turn") {
    if (event.final === false) s.childState = "child_speaking";
    else {
      for (const o of due(s, "child_turn_pending")) if (!s.pending.some((p) => p.obligations.includes(o.id))) drop(o, "replaced by the next complete transcript");
      owe(s, "child_turn_pending", at, { text: event.text, ...(event.uncertain !== undefined ? { uncertain: event.uncertain } : {}), ...(event.alternatives ? { alternatives: event.alternatives } : {}) });
      s.childState = "listening";
    }
  }
  if (event.type === "maya_said") {
    const match = matchesApproval(s, event.text);
    event = { ...event, approvedTurn: match?.turn ?? -1 };
    if (match) match.acknowledged = true;
    s.approved = s.approvals.filter((a) => !a.cancelled && !a.acknowledged).map((a) => a.text);
  }
  if (event.type === "content_problem") owe(s, "content_problem", at, { text: event.detail });
  const before = s.session.state;
  const r = event.type === "tick" && s.childState === "child_speaking" && s.session.startedAt !== null && at - s.session.startedAt < TIME_LIMITS.endAtMs ? { session: s.session, effects: [] as Effect[], refusal: null } : controllerStep(s, event, event.type === "child_turn" && event.final !== false);
  if (r.refusal) return;
  s.session = r.session;
  const cancelled = r.effects.some((e) => e.kind === "cancel_output");
  if (record) switch (event.type) {
    case "start": s.turns.push({ kind: "start", at }); break;
    case "child_turn": s.turns.push(event.final === false ? { kind: "partial", at, text: event.text, cancelled: true } : { kind: "child", at, text: event.text, ...(event.uncertain ? { uncertain: true } : {}) }); break;
    case "maya_said": s.turns.push({ kind: "maya_said", at, text: event.text, cancelled }); break;
    case "content_problem": s.turns.push({ kind: "content_problem", at, detail: event.detail, cancelled }); break;
    case "technical": s.turns.push({ kind: "technical", at, detail: event.detail, ...(error ? { error } : {}) }); break;
    case "hang_up": s.turns.push({ kind: "hang_up", at }); break;
    case "tick": s.turns.push({ kind: "tick", at }); break;
    case "writing": s.turns.push({ kind: "writing", at, status: event.status }); break;
  }
  if (start) { start.status = "served"; start.servedBy = s.turns.length - 1; if (s.session.package) owe(s, "opening_due", at); }
  if (event.type === "maya_said" && cancelled && s.session.state === "REPAIR_MAYA" && !due(s, "repair_due").length) owe(s, "repair_due", at, { text: event.text });
  syncSafety(s, at);
  takeEffects(s, r.effects, at, [], before);
}
function flushDeferred(s: TextFold) {
  if (s.request || s.candidate || s.attempts.length) return;
  // Writing belongs to the complete turn before it. Replacing that turn cannot transfer its writing to another answer.
  while (s.deferred.length) {
    const entry = s.deferred[0];
    const child = entry.childId === null ? null : s.obligations.find((o) => o.id === entry.childId);
    if (child?.status === "pending" && !s.pending.some((p) => p.obligations.includes(child.id))) return;
    s.deferred.shift();
    if (child?.status !== "dropped") applyInput(s, entry.event, undefined, false);
  }
}
function proposal(s: TextFold, value: unknown, at: number, attempt: TraceAttempt, reviews?: TalkReview[], mathReviews?: MathReview[], drawMode?: "derive", continues = false) {
  const before = s.session.state;
  // Two-layer true math: every math-truth review of this attempt is kept in the trace, whatever the step decides.
  if (mathReviews?.length) attempt.math = mathReviews.map((r) => ({ sentence: r.text, verdict: r.result.verdict, reason: r.result.reason, ...(r.result.retried ? { retried: true as const } : {}) }));
  // 2026-11-15 (voice fallbacks): a tutor repair that started after streamed sentences continues them (continuedSay).
  const continuation = continues && attempt.source === "repair" && !!s.sent?.length && !!s.session.tutor;
  // #1107: sentences streamed as saved parts keep the drawing fixed when each went out.
  const streamed = s.parts ? { streamed: { drawings: (s.streamBoard ?? []).map((b) => structuredClone(b.tied)) } } : {};
  const event: SessionEvent = { type: "proposal", at: Math.max(at, s.session.now ?? 0), proposal: value, talkReviews: reviews, ...(mathReviews ? { mathReviews } : {}), ...(attempt.source === "fallback" ? { fallback: true } : {}), ...(s.sent?.length ? { sent: [...s.sent] } : {}), ...(drawMode ? { drawMode } : {}), ...(continuation ? { continuation: true } : {}), ...streamed };
  // B2: the trace says how this attempt's drawings were made.
  if (drawMode && s.session.tutor) attempt.drawMode = drawMode;
  let r = step(s.session, event);
  let controlEvent = event;
  let scene = s.scene;
  if (!r.refusal) for (const e of r.effects) if (e.kind === "board") {
    const applied = applyBatch(scene, e.batch);
    // D-345: a tutor message the board cannot draw keeps its words: the same message is stepped again with no drawing.
    // B2: the drawings are read from the sentences, so the retry also says "no draw" for every sentence.
    if (!applied.ok && s.session.tutor && value && typeof value === "object") {
      controlEvent = { ...event, proposal: { ...(value as Record<string, unknown>), draw: [], noDraw: "all" } };
      r = step(s.session, controlEvent);
      scene = s.scene;
      if (r.refusal) break;
      for (const again of r.effects) if (again.kind === "board") { const redo = applyBatch(scene, again.batch); if (redo.ok) scene = redo.scene; }
      break;
    }
    if (!applied.ok) {
      const reading = value && typeof value === "object" ? (value as { reading?: unknown }).reading : undefined;
      controlEvent = { type: "proposal", at, proposal: { reading } };
      r = step(s.session, controlEvent);
      r.refusal = { code: "invalid_proposal", reason: `The board refused batch ${e.batch.transactionId}: ${applied.refusal.code}`, allowed: nextActs(r.session).acts };
      break;
    }
    scene = applied.scene;
  }
  s.controls.push({ event: structuredClone(controlEvent) });
  s.session = r.session;
  syncSafety(s, at);
  attempt.refusal = r.refusal;
  const talk = r.effects.flatMap((e) => e.kind === "say" ? e.talk ?? [] : []);
  if (talk.length) attempt.talk = talk;
  const dropped = r.effects.flatMap((e) => e.kind === "say" ? e.dropped ?? [] : []);
  if (dropped.length) attempt.dropped = dropped;
  // B2: each clause code read as a board action, drawn or why not (board-ties.ts), on the attempt whose words were said.
  const boardReads = r.refusal ? [] : r.effects.flatMap((e) => e.kind === "say" ? e.boardReads ?? [] : []);
  if (boardReads.length) attempt.boardReads = boardReads;
  if (attempt.source !== "fallback" || !r.refusal) s.attempts.push(attempt);
  if (r.refusal && !s.session.outcome) { takeEffects(s, r.effects, at); return; }
  s.scene = scene;
  // #1107: the turn's words start with the streamed parts, so its output carries their drawings first (already on the
  // board and counted), tied to their sentences, whatever line follows them (the message, a repair, code's line, safety).
  const carried = s.parts && r.effects.some((e) => e.kind === "say") ? (s.streamBoard ?? []).map((b): Effect => ({ kind: "board", batch: structuredClone(b.batch), sentence: b.tied.sentence })) : [];
  takeEffects(s, [...carried, ...r.effects], at, s.attempts, before);
  s.attempts = [];
  delete s.sent;
  if (carried.length || s.parts) { delete s.parts; delete s.streamBoard; }
  flushDeferred(s);
}
/**
 * B1: the child's screen said what it did with Maya's batches. The first word for a batch she sent stands and goes in the
 * trace; any other word changes nothing. While the call is live, the session hears it (a skipped or cancelled drawing
 * is no longer counted as drawn) and the server's board is rebuilt from the fates (`shownScene`), so it matches the
 * child's screen. Words that come while an output is pending wait until it is delivered, so the board they rebuild is
 * the committed board.
 */
function applyFates(s: TextFold, fates: readonly { at: number; batchId: string; fate: BoardFate }[]) {
  if (s.pending.length) { s.lateFates = [...(s.lateFates ?? []), ...fates]; return; }
  // Latest batch first: an earlier batch a later one builds on can then be undone too.
  const order = (id: string) => s.board.findIndex((b) => b.transactionId === id);
  for (const f of [...fates].sort((a, b) => order(b.batchId) - order(a.batchId))) {
    const b = s.board.find((x) => x.transactionId === f.batchId);
    if (!b || b.fate || !BOARD_FATES.includes(f.fate)) continue;
    b.fate = f.fate;
    if (s.session.outcome || s.session.startedAt === null) continue;
    const at = Math.max(f.at, s.session.now ?? 0);
    const r = controllerStep(s, { type: "board_fate", at, batch: f.batchId, fate: f.fate });
    if (r.refusal) { s.controls.pop(); continue; }
    s.session = r.session;
    if (f.fate === "shown") continue;
    s.scene = shownScene(s.board);
  }
  // B2: a batch that builds on one the screen skipped or cancelled is not on the screen either (the desk skips it); with
  // no word of its own it counts as skipped, so the session does not count it as drawn.
  for (const b of s.board) {
    if (b.fate || !b.after?.some((id) => ["skipped", "cancelled"].includes(s.board.find((x) => x.transactionId === id)?.fate ?? ""))) continue;
    b.fate = "skipped";
    if (s.session.outcome || s.session.startedAt === null) continue;
    const r = controllerStep(s, { type: "board_fate", at: s.session.now ?? 0, batch: b.transactionId, fate: "skipped" });
    if (r.refusal) { s.controls.pop(); continue; }
    s.session = r.session;
  }
}
export function initialTextState(initial: TextLogInitial): TextFold {
  const s: TextFold = { ...structuredClone(initial), historyBytes: 0, scene: createScene(), initialSession: structuredClone(initial.session), initialScene: createScene(), controls: [], approvals: [], nextOutputId: 0, approved: structuredClone(initial.approved ?? initial.session.turns.filter((t) => t.speaker === "maya").slice(-1).map((t) => t.text)), obligations: structuredClone(initial.obligations ?? []), childState: initial.childState ?? "listening", request: null, candidate: null, attempts: [], deferred: [], pending: [], output: emptyOutput() };
  s.scene = shownScene(s.board);
  s.initialScene = s.scene;
  s.approvals = s.approved.map((text) => ({ outputId: 0, turn: s.session.turns.findLastIndex((t) => t.speaker === "maya" && t.text === text), text, cancelled: false, acknowledged: false }));
  if (!initial.childState) for (const t of s.turns) { if (t.kind === "partial") s.childState = "child_speaking"; if (t.kind === "child") s.childState = "listening"; }
  if (!initial.obligations && !s.session.outcome) {
    if (s.session.startedAt !== null && !s.session.opened && s.session.package) owe(s, "opening_due", s.session.now ?? 0);
    if (s.session.state === "REPAIR_MAYA") owe(s, "repair_due", s.session.now ?? 0);
    if (s.session.turn) owe(s, "child_turn_pending", s.session.now ?? 0, { text: s.session.turn.text, uncertain: s.session.turn.uncertain });
    if (s.session.contentProblem) owe(s, "content_problem", s.session.now ?? 0, { text: s.session.contentProblem });
  }
  syncSafety(s, s.session.now ?? 0);
  for (const detail of initial.problems ?? []) applyInput(s, { type: "content_problem", at: s.session.now ?? 0, detail });
  refreshOutput(s);
  return s;
}
/** Apply one log record. The caller owns the cache; replay calls the same reducer with the same initial state. */
export function foldTextEvent(s: TextFold, e: TextLogEvent): TextFold {
  if (!s.session.outcome) {
    const bytes = new TextEncoder().encode(JSON.stringify(e)).byteLength;
    if (s.historyBytes + bytes > MAX_TEXT_HISTORY_BYTES) {
      // A current response's safety duty survives the budget. Ordinary content is discarded.
      if (e.kind === "response" && !e.error && s.request?.id === e.requestId) {
        const reading = e.proposal && typeof e.proposal === "object" ? (e.proposal as { reading?: unknown }).reading : undefined;
        if (reading && typeof reading === "object") receiveReading(s, { safety: (reading as { safety?: unknown }).safety }, e.at);
      }
      cancel(s, "call record limit reached", true);
      applyInput(s, { type: "technical", at: e.at, detail: "the call record limit was reached" });
      commitControls(s); refreshOutput(s);
      return s;
    }
    s.historyBytes += bytes;
  }
  switch (e.kind) {
    case "input": {
      const event = e.event;
      if (event.type === "writing" || event.type === "tick") {
        if (s.request || s.candidate || s.attempts.length || (s.session.turn && nextActs(s.session).expect === "maya")) {
          s.deferred.push({ event, childId: event.type === "writing" ? due(s, "child_turn_pending").at(-1)?.id ?? null : null });
          if (!s.session.outcome) s.turns.push(event.type === "writing" ? { kind: "writing", at: e.at, status: event.status } : { kind: "tick", at: e.at });
          break;
        }
      } else if (event.type === "maya_said") {
        if (!matchesApproval(s, event.text)) {
          const request = s.request, candidate = s.candidate, attempts = s.attempts;
          cancel(s, "superseded by speech repair");
          s.request = request; s.candidate = candidate; s.attempts = attempts;
        }
      } else if (event.type === "content_problem") {
        const request = s.request, candidate = s.candidate;
        cancel(s, "superseded by priority input", true);
        s.request = request; s.candidate = candidate;
      } else if (event.type !== "start") {
        cancel(s, event.type === "child_turn" && event.final === false ? "cancelled by partial transcript" : "superseded by priority input", ["content_problem", "technical", "hang_up"].includes(event.type), event.type !== "child_turn" || event.final === false);
      }
      applyInput(s, event, e.error);
      flushDeferred(s);
      break;
    }
    case "request": s.request = { id: e.requestId, source: e.source, ...(e.filler ? { filler: e.filler } : {}), ...(e.continuation ? { continuation: true as const } : {}) }; break;
    case "response": {
      if (s.request?.id !== e.requestId) break;
      const source = s.request.source;
      const filler = s.request.filler ? { filler: s.request.filler } : {};
      const continuation = s.request.continuation ? { continuation: true as const } : {};
      if (e.sent?.length) {
        s.sent = [...(s.sent ?? []), ...e.sent];
        // Final check 11 (2026-11-15): the single point where streamed sentences are accepted. Their help is in the session
        // now, before this response or any later input (an error, a priority reading, a stop, the end) builds an outcome.
        s.session = withEmittedHelp(s.session, s.sent);
      }
      if (e.error) {
        s.attempts.push({ source, proposal: null, refusal: null, error: e.error, ms: e.ms, ...(e.firstSayMs !== undefined ? { firstSayMs: e.firstSayMs } : {}), ...filler });
        s.request = null;
        // Final check 6: a priority value the stream held before the model failed (a cut-off or malformed reply) still
        // applies, through the same priority path as a reading: the guidance or the disclosure is due.
        if (e.priority) receiveReading(s, e.priority, e.at);
      } else {
        s.candidate = { requestId: e.requestId, proposal: e.proposal, ms: e.ms, source, ...(e.fenced ? { fenced: true as const } : {}), ...(e.firstSayMs !== undefined ? { firstSayMs: e.firstSayMs } : {}), ...(e.gateDisagrees ? { gateDisagrees: true as const } : {}), ...filler, ...continuation };
        const reading = e.proposal && typeof e.proposal === "object" ? (e.proposal as { reading?: unknown }).reading : undefined;
        // The tutor's gate (2026-11-15) is a priority reading too: a "safety" gate raises safety at once.
        const gate = e.proposal && typeof e.proposal === "object" ? (e.proposal as { gate?: unknown }).gate : undefined;
        receiveReading(s, reading, e.at, gate);
      }
      break;
    }
    case "review": {
      if (s.request?.id !== e.requestId || s.candidate?.requestId !== e.requestId) break;
      const candidate = s.candidate;
      s.request = null; s.candidate = null;
      proposal(s, candidate.proposal, e.at, { source: candidate.source, proposal: candidate.proposal, refusal: null, ms: candidate.ms, ...(candidate.fenced ? { fenced: true as const } : {}), ...(candidate.firstSayMs !== undefined ? { firstSayMs: candidate.firstSayMs } : {}), ...(candidate.gateDisagrees ? { gateDisagrees: true as const } : {}), ...(e.reviewMs !== undefined ? { reviewMs: e.reviewMs } : {}), ...(candidate.filler ? { filler: candidate.filler } : {}) }, e.reviews, e.mathReviews, e.drawMode, candidate.continuation === true);
      break;
    }
    case "fallback": proposal(s, e.proposal, e.at, { source: "fallback", proposal: e.proposal, refusal: null }, undefined, undefined, e.drawMode); break;
    case "part": {
      if (s.request?.id !== e.requestId || s.candidate || s.session.outcome) break;
      s.sent = [...(s.sent ?? []), e.sentence];
      s.parts = (s.parts ?? 0) + 1;
      // Final check 11: the single point where a streamed sentence is accepted; its help is in the session at once.
      s.session = withEmittedHelp(s.session, s.sent);
      if (e.board) {
        const r = controllerStep(s, { type: "streamed_board", at: e.at, batch: e.board.batch, keys: e.board.keys });
        if (r.refusal) { s.controls.pop(); break; }
        const applied = applyBatch(s.scene, e.board.batch);
        if (!applied.ok) { s.controls.pop(); break; }
        s.session = r.session;
        s.scene = applied.scene;
        s.streamBoard = [...(s.streamBoard ?? []), structuredClone(e.board)];
      }
      break;
    }
    case "recover": if (!s.candidate) s.request = null; break;
    case "cancelled": s.output.cancelled = false; break;
    // A control, so a cancellation's replay keeps it.
    case "help": s.session = controllerStep(s, { type: "help", at: e.at, assistance: e.assistance }).session; break;
    case "delivered": {
      const last = s.turns.at(-1);
      const terminalTurn = last && ["hang_up", "technical"].includes(last.kind) ? s.turns.pop() : undefined;
      for (const p of s.pending) {
        const turn = p.entry;
        const index = s.turns.length;
        turn.at = Math.max(turn.at, s.turns.at(-1)?.at ?? 0);
        s.turns.push(turn);
        if (turn.kind === "maya") turn.output = { act: p.act, say: p.say, board: p.batches.map((b) => b.transactionId) };
        for (const id of p.obligations) {
          const o = s.obligations.find((o) => o.id === id)!;
          if (o.status === "pending") { o.status = "served"; o.servedBy = index; }
        }
        for (const b of p.batches) s.board.push({ at: turn.at, turn: index, transactionId: b.transactionId, commands: b.commands, ...(p.ties?.[b.transactionId] === undefined ? {} : { sentence: p.ties[b.transactionId] }), ...(b.after?.length ? { after: [...b.after] } : {}) });
      }
      if (terminalTurn) s.turns.push(terminalTurn);
      if (s.output.say.length) {
        const outputId = ++s.nextOutputId;
        s.approvals = s.output.say.map((text) => ({ outputId, turn: s.session.turns.findLastIndex((t) => t.speaker === "maya" && t.text === text), text, cancelled: false, acknowledged: false }));
        s.approved = [...s.output.say];
      }
      s.pending = []; s.output = emptyOutput(); terminal(s); flushDeferred(s);
      if (s.lateFates?.length && !s.pending.length) { const late = s.lateFates; delete s.lateFates; applyFates(s, late); }
      break;
    }
    case "fates": applyFates(s, e.fates.map((f) => ({ at: e.at, batchId: f.batchId, fate: f.fate }))); break;
  }
  commitControls(s);
  refreshOutput(s);
  return s;
}
