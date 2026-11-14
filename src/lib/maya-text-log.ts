// Persistent transition rules for the text adapter. No provider, clock, promise or abort signal enters this fold.
import { applyBatch, createScene, type Batch, type Scene } from "@/lib/board";
import { nextActs, speechKey, step, TIME_LIMITS, SAFETY_GUIDANCE, type Act, type Effect, type Session, type SessionEvent, type TalkReview } from "@/lib/maya";
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
  | { kind: "request"; at: number; requestId: number; source: "model" | "repair" }
  | { kind: "response"; at: number; requestId: number; proposal?: unknown; error?: TraceError; ms: number; fenced?: true; sent?: string[]; firstSayMs?: number }
  | { kind: "review"; at: number; requestId: number; reviews: TalkReview[]; reviewMs?: number }
  | { kind: "fallback"; at: number; proposal: unknown }
  | { kind: "recover"; at: number }
  | { kind: "cancelled"; at: number }
  | { kind: "delivered"; at: number };

type PendingOutput = { entry: Extract<TraceTurn, { kind: "maya" }>; act: Act; say: string[]; batches: Batch[]; obligations: number[]; control: number };
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
  request: { id: number; source: "model" | "repair" } | null;
  candidate: { requestId: number; proposal: unknown; ms: number; source: "model" | "repair"; fenced?: true; firstSayMs?: number } | null;
  /** D-341: sentences of the current Maya turn already streamed to the child; every later attempt of the turn starts with them. */
  sent?: string[];
  attempts: TraceAttempt[];
  deferred: { event: SessionEvent; childId: number | null }[];
  pending: PendingOutput[];
  output: Pick<TextOutput, "say" | "board" | "cancelled">;
}
export type TextCheckpoint = Omit<TextFold, "scene" | "initialScene" | "endedAt"> & { sceneBatches: Batch[]; initialSceneBatches: Batch[] };
export function saveTextCheckpoint(s: TextFold): TextCheckpoint {
  const { scene: _scene, initialScene: _initialScene, endedAt: _endedAt, ...data } = s;
  void _scene; void _initialScene; void _endedAt;
  const committed = s.board.map((b) => ({ transactionId: b.transactionId, commands: b.commands }));
  return structuredClone({ ...data, sceneBatches: [...committed, ...s.pending.flatMap((p) => p.batches)], initialSceneBatches: committed });
}
export function restoreTextCheckpoint(checkpoint: TextCheckpoint): TextFold {
  const { sceneBatches, initialSceneBatches, ...data } = structuredClone(checkpoint);
  const restore = (batches: Batch[]) => {
    let scene = createScene();
    for (const batch of batches) {
      const result = applyBatch(scene, batch);
      if (!result.ok) throw new Error("maya text: checkpoint board does not apply");
      scene = result.scene;
    }
    return scene;
  };
  return { ...data, endedAt: data.session.outcome ? data.session.now : null, scene: restore(sceneBatches), initialScene: restore(initialSceneBatches) };
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
  delete s.sent;
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
function receiveReading(s: TextFold, reading: unknown, at: number) {
  // Invalid shape applies only the controller's priority reading. It cannot score or speak.
  const r = controllerStep(s, { type: "proposal", at, proposal: { reading } });
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
  if (says.length || attempts.length) {
    const act = says.at(-1)?.act ?? (attempts.at(-1)?.proposal as { act?: Act } | null)?.act ?? "close";
    const entry: Extract<TraceTurn, { kind: "maya" }> = { kind: "maya", at, state: stateBefore, stateAfter: s.session.state, finalMisses: s.session.finalMisses ?? 0, attempts: attempts.length ? attempts : [{ source: "controller", proposal: null, refusal: null }], output: null };
    if (says.length || (attempts.length && !attempts.at(-1)?.refusal && !attempts.at(-1)?.error)) {
      const kinds: TraceObligation["kind"][] = act === "open" ? ["opening_due"] : act === "repair" ? ["repair_due"] : act === "safety" ? ["safety_due"] : act === "close" ? ["child_turn_pending", "content_problem"] : s.session.turn === null ? ["child_turn_pending"] : [];
      const ids = s.obligations.filter((o) => o.status === "pending" && kinds.includes(o.kind) && !s.pending.some((p) => p.obligations.includes(o.id))).map((o) => o.id);
      s.pending.push({ entry, act, say: says.map((e) => e.text), batches, obligations: ids, control: s.controls.length - 1 });
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
function proposal(s: TextFold, value: unknown, at: number, attempt: TraceAttempt, reviews?: TalkReview[]) {
  const before = s.session.state;
  const event: SessionEvent = { type: "proposal", at: Math.max(at, s.session.now ?? 0), proposal: value, talkReviews: reviews, ...(attempt.source === "fallback" ? { fallback: true } : {}), ...(s.sent?.length ? { sent: [...s.sent] } : {}) };
  let r = step(s.session, event);
  let controlEvent = event;
  let scene = s.scene;
  if (!r.refusal) for (const e of r.effects) if (e.kind === "board") {
    const applied = applyBatch(scene, e.batch);
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
  if (attempt.source !== "fallback" || !r.refusal) s.attempts.push(attempt);
  if (r.refusal && !s.session.outcome) { takeEffects(s, r.effects, at); return; }
  s.scene = scene;
  takeEffects(s, r.effects, at, s.attempts, before);
  s.attempts = [];
  delete s.sent;
  flushDeferred(s);
}
export function initialTextState(initial: TextLogInitial): TextFold {
  const s: TextFold = { ...structuredClone(initial), historyBytes: 0, scene: createScene(), initialSession: structuredClone(initial.session), initialScene: createScene(), controls: [], approvals: [], nextOutputId: 0, approved: structuredClone(initial.approved ?? initial.session.turns.filter((t) => t.speaker === "maya").slice(-1).map((t) => t.text)), obligations: structuredClone(initial.obligations ?? []), childState: initial.childState ?? "listening", request: null, candidate: null, attempts: [], deferred: [], pending: [], output: emptyOutput() };
  for (const b of s.board) {
    const applied = applyBatch(s.scene, { transactionId: b.transactionId, commands: b.commands });
    if (!applied.ok) throw new Error(`maya text: the saved board batch ${b.transactionId} does not apply again`);
    s.scene = applied.scene;
  }
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
    case "request": s.request = { id: e.requestId, source: e.source }; break;
    case "response": {
      if (s.request?.id !== e.requestId) break;
      const source = s.request.source;
      if (e.sent?.length) s.sent = [...(s.sent ?? []), ...e.sent];
      if (e.error) {
        s.attempts.push({ source, proposal: null, refusal: null, error: e.error, ms: e.ms, ...(e.firstSayMs !== undefined ? { firstSayMs: e.firstSayMs } : {}) });
        s.request = null;
      } else {
        s.candidate = { requestId: e.requestId, proposal: e.proposal, ms: e.ms, source, ...(e.fenced ? { fenced: true as const } : {}), ...(e.firstSayMs !== undefined ? { firstSayMs: e.firstSayMs } : {}) };
        const reading = e.proposal && typeof e.proposal === "object" ? (e.proposal as { reading?: unknown }).reading : undefined;
        receiveReading(s, reading, e.at);
      }
      break;
    }
    case "review": {
      if (s.request?.id !== e.requestId || s.candidate?.requestId !== e.requestId) break;
      const candidate = s.candidate;
      s.request = null; s.candidate = null;
      proposal(s, candidate.proposal, e.at, { source: candidate.source, proposal: candidate.proposal, refusal: null, ms: candidate.ms, ...(candidate.fenced ? { fenced: true as const } : {}), ...(candidate.firstSayMs !== undefined ? { firstSayMs: candidate.firstSayMs } : {}), ...(e.reviewMs !== undefined ? { reviewMs: e.reviewMs } : {}) }, e.reviews);
      break;
    }
    case "fallback": proposal(s, e.proposal, e.at, { source: "fallback", proposal: e.proposal, refusal: null }); break;
    case "recover": if (!s.candidate) s.request = null; break;
    case "cancelled": s.output.cancelled = false; break;
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
        for (const b of p.batches) s.board.push({ at: turn.at, turn: index, transactionId: b.transactionId, commands: b.commands });
      }
      if (terminalTurn) s.turns.push(terminalTurn);
      if (s.output.say.length) {
        const outputId = ++s.nextOutputId;
        s.approvals = s.output.say.map((text) => ({ outputId, turn: s.session.turns.findLastIndex((t) => t.speaker === "maya" && t.text === text), text, cancelled: false, acknowledged: false }));
        s.approved = [...s.output.say];
      }
      s.pending = []; s.output = emptyOutput(); terminal(s); flushDeferred(s);
      break;
    }
  }
  commitControls(s);
  refreshOutput(s);
  return s;
}
