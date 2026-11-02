// Maya's calls (#323, spec #297): one call with Maya about one question, kept as a record from the first word to the
// outcome. Today only admin test calls exist: in admin, a team member picks a supported assessment question of a test
// family's child (D-099), types the child's turns and sees Maya's replies while the board draws
// (src/app/(product)/admin/maya). The voice calls (#326) and the parent's notes (#333) build on the same record.
//
// One request is one input. The call runs in Maya's text adapter (src/lib/maya-text.ts); after each input the module
// saves what the adapter needs to go on (`live`) at the next revision, so two requests never both change a call: the
// second finds a newer revision and is refused (conflict). When the call ends, the module stores the trace (transcript,
// board commands, outcome and versions, src/lib/maya-trace.ts), the board history (src/lib/board-history.ts), the
// outcome fields and counts, and drops `live`. Then it writes the call's one learning event for the target question
// (`learningEvent` of the session, key `call:<id>`, so a retry stores it once) and rebuilds the child's profile.
// "end" on an ended call whose event, rebuild or parent note failed runs those again.
//
// The child's wording history (D-196, #375): `start` reads it before the session is made, so Maya prefers the wordings
// the child has not heard lately; the session keeps it in its saved state for the call's later requests. When the call
// ends, the wordings it said are added to it (before the learning event; again on a retried "end" while the call keeps
// its state, which changes nothing, since each wording keeps its newest time). A history that cannot be read or written
// never stops a call: the call goes on with an empty history, or keeps its outcome without the record.
//
// The parent's note (#331, src/lib/maya-call-note.ts): when a call ends, the same write that stores its outcome keeps
// the note's inputs in `notePending` (the question package and the learning event as code built it). After the event
// and the rebuild, the `note` seam writes the note within NOTE_STEP_MS; once it says "done" (stored, or refused for
// good), `notePending` is cleared, without raising the call's revision (R403-5). A failed, refused-for-now or slow note leaves it, so a retried "end" of the call, or
// the end of a later call of the same child, writes it from those inputs (R403-3, R403-4). The note never holds up the
// learning event, and the call's answer waits for it at most NOTE_STEP_MS.
//
// Test calls never touch a real family: `start` refuses a family the seam does not call a test family, the database
// refuses it again (migration add_maya_calls), and a test call never counts minutes.
//
// Seams: the call store (Supabase: src/lib/maya-call-store.ts; memory: src/lib/maya-call-memory.ts), the wording
// history (Supabase: src/lib/maya-wording-history-store.ts; memory: memoryWordingHistoryStore), the learning events, the profile rebuild, the parent's note (#331), the model by id, the clock, ids and the seed. Pure otherwise: no Next.js, React,
// network or database; node:crypto through the trace's package hash.
import { applyBatch, boardView, createScene, type Batch } from "@/lib/board";
import { createHistory, mayaWrites, type BoardHistory } from "@/lib/board-history";
import { fitView, type PlayStep } from "@/lib/board-svg";
import type { LearningEvents, NewLearningEvent } from "@/lib/learning-events";
import type { NoteStep } from "@/lib/maya-call-note";
import { heardWordings, learningEvent, type Outcome, type WordingHistory, type WordingHistoryStore } from "@/lib/maya";
import { freeTalkFor } from "@/lib/maya-free-talk";
import type { MayaModel } from "@/lib/maya-model";
import type { TalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, type FinishOptions, type SavedTextSession, type TextOutput, type TextSession } from "@/lib/maya-text";
import { packageHash, type MayaTrace } from "@/lib/maya-trace";
import { checkQuestionPackage, type QuestionPackage, type QuestionRef } from "@/lib/question-package";

/** The longest the note step of an ended call may take; after it the note stays pending. */
export const NOTE_STEP_MS = 20_000;
/** The most earlier calls of the child whose pending note a call's end picks up. */
export const NOTE_SWEEP = 3;

/** The version of the call record's shape (record_version). */
export const CALL_RECORD_VERSION = 1;

export type CallKind = "admin_test";
export type CallStatus = "live" | "ended";

/** One call as stored. */
export interface CallRecord {
  id: string;
  createdAt: string;
  recordVersion: number;
  kind: CallKind;
  mode: "text" | "voice";
  startedBy: string | null;
  parentId: string;
  childId: string;
  question: QuestionRef;
  packageId: string;
  packageHash: string;
  questionText: string | null;
  status: CallStatus;
  revision: number;
  startedAt: string | null;
  endedAt: string | null;
  model: string;
  promptVersion: string;
  versions: { proposal: number; lines: number | string; session: number; trace: number };
  outcome: Outcome | null;
  counts: { mayaTurns: number; childTurns: number; fallbacks: number } | null;
  /** While live: what the text adapter needs to go on, with the package it runs on. Null once ended. */
  live: { package: QuestionPackage; text: SavedTextSession } | null;
  trace: MayaTrace | null;
  boardHistory: BoardHistory | null;
  learningEventId: string | null;
  profileRebuiltAt: string | null;
  /** An ended call whose parent note is not written yet: the note's inputs, kept for a retry. Null once done. */
  notePending: { package: QuestionPackage; event: NewLearningEvent | null } | null;
}

/** The fields an update may change. */
export type CallChange = Partial<Pick<CallRecord, "status" | "startedAt" | "endedAt" | "outcome" | "counts" | "live" | "trace" | "boardHistory" | "learningEventId" | "profileRebuiltAt" | "notePending">>;

/** The store seam. */
export interface CallStore {
  insert(record: CallRecord): Promise<void>;
  get(id: string): Promise<CallRecord | null>;
  /** Writes the change and raises the revision by one, only when the stored revision is `revision`. False otherwise. */
  update(id: string, revision: number, change: CallChange): Promise<boolean>;
  /** The child's ended calls whose note is pending, oldest end first, at most `limit`. */
  pendingNotes(childId: string, limit: number): Promise<CallRecord[]>;
  /**
   * Clears an ended call's pending note without raising its revision (review R403-5): the note is not part of the
   * call's requests, so a clear that is still writing when the note time is up never makes the revision a request
   * holds stale. True when the call had a pending note.
   */
  clearNote(id: string): Promise<boolean>;
}

export interface CallSeams {
  store: CallStore;
  /** The children's wording history: read before a call, added to when it ends. */
  history: WordingHistoryStore;
  events: LearningEvents;
  /** Rebuilds the child's profile; true when it was built. Never throws. */
  rebuild(childId: string): Promise<boolean>;
  /**
   * The model to use: `null` asks for the model a new call uses now (the real one when the server has its key, else
   * the fake); an id asks for that model again, or null when it is no longer available.
   */
  model(id: string | null): MayaModel | null;
  /**
   * The free-talk review (D-197) for a call on this model, or null (then every free-talk piece becomes a bank phrase).
   * Optional: without it a call has no review.
   */
  reviewer?(modelId: string): TalkReviewer | null;
  /** True when the family is marked as a test family (public.test_accounts). */
  isTestFamily(parentId: string): Promise<boolean>;
  /**
   * The parent's note of an ended call (#331, src/lib/maya-call-note.ts), run after the learning event. Optional.
   * "done" when the note is stored or refused for good (the note module refuses test calls and test families itself);
   * "pending", a throw or no answer within NOTE_STEP_MS keeps the call's `notePending` for a retry. Never changes the call
   * otherwise.
   */
  note?(ended: { call: CallRecord; package: QuestionPackage; event: NewLearningEvent | null }): Promise<NoteStep>;
  /** The note step's time limit in milliseconds; NOTE_STEP_MS when not set. */
  noteMs?: number;
  clock(): number;
  newId(): string;
  /** A random 32-bit seed for the wording. */
  seed(): number;
}

/**
 * One input to a live call. "end" hangs up on purpose (the call ends as child_stopped, unless safety, content or a
 * solved question comes first), or finishes an ended call's steps.
 */
export type CallInput = { type: "child"; text: string } | { type: "tick" } | { type: "writing"; status: "started" | "done" } | { type: "end" };

/** The most characters of one typed child turn. */
export const MAX_CHILD_TEXT = 500;

/** One line of the transcript, as the admin reads it. */
export interface TranscriptLine {
  speaker: "maya" | "child" | "note";
  text: string;
  /** Seconds from the start of the call. */
  second: number;
}

/** One piece of Maya's own words in a call (D-197), as the admin reads it: both checks and what was said. */
export interface FreeTalkLine {
  /** Seconds from the start of the call. */
  second: number;
  proposed: string;
  /** The code guards: null when they passed, else why not. */
  code: string | null;
  review: "pass" | "fail" | "error" | "not_run";
  rules: string[];
  reason: string | null;
  shown: string;
  said: boolean;
}

/** What the admin screens show of a call: no saved session state. */
export interface CallView {
  id: string;
  kind: CallKind;
  status: CallStatus;
  revision: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  parentId: string;
  childId: string;
  question: QuestionRef;
  questionText: string | null;
  packageHash: string;
  model: { id: string; fake: boolean; promptVersion: string };
  versions: CallRecord["versions"];
  transcript: TranscriptLine[];
  /** D-197: whether free talk was on, the review's model, and every piece of Maya's own words with both checks. */
  freeTalk: { on: boolean; reviewer: string | null; lines: FreeTalkLine[] };
  /** Maya's board batches, in order. */
  batches: Batch[];
  outcome: Outcome | null;
  counts: CallRecord["counts"];
  learningEventId: string | null;
  profileRebuiltAt: string | null;
  /** The call's parent note is not written yet. */
  notePending: boolean;
}

export type CallResult =
  | { ok: true; view: CallView; output: { say: string[]; newBatches: number; safetyMessage: string | null } }
  | { ok: false; error: "not_found" | "not_test_family" | "invalid_question" | "invalid_input" | "conflict" | "model_unavailable" };

export interface MayaCalls {
  start(input: { kind: CallKind; parentId: string; childId: string; childName: string | null; package: unknown; startedBy: string | null }): Promise<CallResult>;
  input(id: string, revision: number, input: CallInput, childName: string | null): Promise<CallResult>;
  view(id: string): Promise<CallView | null>;
}

const iso = (ms: number) => new Date(ms).toISOString();
/** The model id of the fake rule player (src/lib/maya-model-fake.ts). */
export const FAKE_MODEL_ID = "fake";

/** The board batches of a trace or a live session, as the board core took them. */
const batchesOf = (board: readonly { transactionId: string; commands: readonly unknown[] }[]): Batch[] => board.map((b) => ({ transactionId: b.transactionId, commands: b.commands }));

/** The transcript from a trace: the child's turns, Maya's words, and notes for writing, waits and failures. */
function transcriptOf(trace: MayaTrace): TranscriptLine[] {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? trace.turns[0]?.at ?? 0;
  const second = (at: number) => Math.max(0, Math.round((at - start) / 1000));
  const lines: TranscriptLine[] = [];
  for (const t of trace.turns) {
    if (t.kind === "child") lines.push({ speaker: "child", text: t.text, second: second(t.at) });
    else if (t.kind === "maya" && t.output && t.output.say.length) lines.push({ speaker: "maya", text: t.output.say.join(" "), second: second(t.at) });
    else if (t.kind === "writing") lines.push({ speaker: "note", text: t.status === "started" ? "The child started writing." : "The child finished writing.", second: second(t.at) });
    else if (t.kind === "tick") lines.push({ speaker: "note", text: "The child stayed quiet.", second: second(t.at) });
    else if (t.kind === "technical") lines.push({ speaker: "note", text: `The call stopped: ${t.detail}.`, second: second(t.at) });
    else if (t.kind === "hang_up") lines.push({ speaker: "note", text: "The child hung up.", second: second(t.at) });
  }
  return lines;
}

/** Every piece of Maya's own words in a trace, with both checks and what was said (D-197). */
function freeTalkOf(trace: MayaTrace): CallView["freeTalk"] {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? trace.turns[0]?.at ?? 0;
  const lines: FreeTalkLine[] = [];
  for (const t of trace.turns) {
    if (t.kind !== "maya" || !t.output) continue;
    for (const x of t.attempts.at(-1)?.talk ?? []) {
      lines.push({
        second: Math.max(0, Math.round((t.at - start) / 1000)), proposed: x.proposed, code: x.code, review: x.review, rules: x.rules ?? [],
        reason: x.reason ?? null, shown: x.shown, said: x.code === null && x.review === "pass",
      });
    }
  }
  return { on: trace.freeTalk, reviewer: trace.reviewer?.id ?? null, lines };
}

/** The board history of a finished call: Maya's batches at their times from the start (no child ink in a text call). */
export function boardHistoryOf(trace: MayaTrace): BoardHistory {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? 0;
  let h = createHistory();
  for (const b of trace.board) {
    const r = mayaWrites(h, { transactionId: b.transactionId, commands: b.commands }, Math.max(0, b.at - start));
    if (r.ok) h = r.history;
  }
  return h;
}

/** The board for the screen: each batch as the board core draws it, and a view box around all the work. */
export function boardPlayback(batches: readonly Batch[]): { steps: PlayStep[]; viewBox: string } {
  let scene = createScene();
  const steps: PlayStep[] = [];
  for (const b of batches) {
    const r = applyBatch(scene, b);
    if (!r.ok) break;
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(r.scene) });
  }
  return { steps, viewBox: fitView(steps.flatMap((s) => s.drawn), 0.03) };
}

export function callView(record: CallRecord, trace: MayaTrace): CallView {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    revision: record.revision,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    parentId: record.parentId,
    childId: record.childId,
    question: record.question,
    questionText: record.questionText,
    packageHash: record.packageHash,
    model: { id: record.model, fake: record.model === FAKE_MODEL_ID, promptVersion: record.promptVersion },
    versions: record.versions,
    transcript: transcriptOf(trace),
    freeTalk: freeTalkOf(trace),
    batches: batchesOf(trace.board),
    outcome: record.outcome ?? trace.outcome,
    counts: record.counts,
    learningEventId: record.learningEventId,
    profileRebuiltAt: record.profileRebuiltAt,
    notePending: record.notePending !== null,
  };
}

const countsOf = (trace: MayaTrace): NonNullable<CallRecord["counts"]> => ({
  mayaTurns: trace.turns.filter((t) => t.kind === "maya" && t.output).length,
  childTurns: trace.turns.filter((t) => t.kind === "child").length,
  fallbacks: trace.counts.fallbacks,
});

function checkInput(input: CallInput): boolean {
  if (input.type === "child") return typeof input.text === "string" && input.text.trim().length > 0 && input.text.length <= MAX_CHILD_TEXT;
  if (input.type === "writing") return input.status === "started" || input.status === "done";
  return input.type === "tick" || input.type === "end";
}

/** What the admin screens show of a stored call: an ended call from its trace, a live one from its saved session. */
export function recordView(record: CallRecord): CallView | null {
  if (record.trace) return callView(record, record.trace);
  if (!record.live) return null;
  const session = createTextSession({ callId: record.id, package: record.live.package, model: idleModel(record), clock: () => 0, runner: "text", resume: record.live.text });
  return callView(record, session.trace());
}

/** A stand-in for a call's model where no model is asked: reading a saved call, or ending it. */
const idleModel = (record: CallRecord): MayaModel => ({
  id: record.model,
  promptVersion: record.promptVersion,
  propose: async () => {
    throw new Error("the model is not asked here");
  },
});

export function mayaCalls(seams: CallSeams): MayaCalls {
  const { store } = seams;

  /** A call's text session. Admin test calls have free talk on (D-197), with the model's review; a resumed call keeps its flag. */
  function textSession(record: Pick<CallRecord, "id">, pkg: QuestionPackage, model: MayaModel, childName: string | null, saved?: SavedTextSession, seed?: number, history?: WordingHistory): TextSession {
    return createTextSession({
      callId: record.id, package: pkg, model, clock: seams.clock, random: seed, history, childName, runner: "text", resume: saved,
      freeTalk: freeTalkFor("admin_test"), reviewer: seams.reviewer?.(model.id) ?? null,
    });
  }

  /** The child's wording history before a new call; an empty one when it cannot be read. */
  async function readHistory(childId: string): Promise<WordingHistory> {
    try {
      return await seams.history.read(childId);
    } catch (e) {
      console.error("[maya call] wording history read failed", childId, e instanceof Error ? e.message : String(e));
      return {};
    }
  }

  /** Adds the wordings an ended call said to the child's history. Never throws. */
  async function recordHeard(record: CallRecord, ended: TextSession) {
    const heard = heardWordings(ended.session);
    if (Object.keys(heard).length === 0) return;
    try {
      await seams.history.record(record.childId, heard);
    } catch (e) {
      console.error("[maya call] wording history record failed", record.id, e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * The wording history, the learning event and the profile rebuild of an ended call; the event and the rebuild run
   * until each has worked once. `ended` is the call's final session; the record keeps it in `live` until the event is
   * written, so a later "end" can try again (and adds the same wordings again, which changes nothing).
   */
  async function afterEnd(record: CallRecord, ended: TextSession | null, sweep = false): Promise<CallRecord> {
    let current = record;
    if (ended) await recordHeard(current, ended);
    if (!current.learningEventId && ended) {
      const event = learningEvent(ended.session, { parentId: current.parentId, childId: current.childId });
      let eventId: string | null = null;
      let done = event === null;
      if (event) {
        try {
          const appended = await seams.events.append(event);
          if (appended.ok || appended.error === "key_conflict") [eventId, done] = [appended.event.id, true];
          else {
            // A refused event is refused again on a retry: the call goes on without one.
            console.error("[maya call] learning event refused", current.id, appended.error, "reason" in appended ? appended.reason : "");
            done = true;
          }
        } catch (e) {
          console.error("[maya call] learning event failed", current.id, e instanceof Error ? e.message : String(e));
        }
      }
      if (done) {
        const change: CallChange = { learningEventId: eventId, live: null };
        if (!(await store.update(current.id, current.revision, change))) return current;
        current = { ...current, ...change, revision: current.revision + 1 };
      }
    }
    if (current.learningEventId && !current.live && !current.profileRebuiltAt && (await seams.rebuild(current.childId))) {
      const at = iso(seams.clock());
      if (await store.update(current.id, current.revision, { profileRebuiltAt: at })) current = { ...current, profileRebuiltAt: at, revision: current.revision + 1 };
    }
    return notes(current, sweep);
  }

  /**
   * The parent's notes after the event and the rebuild: this call's pending note, then (`sweep`, at a call's first end)
   * up to NOTE_SWEEP earlier calls of the child whose note is still pending. All of it within the note time limit: once
   * it is up the call answers, and no late result changes the call's revision (a written note is found on the next try).
   */
  async function notes(record: CallRecord, sweep: boolean): Promise<CallRecord> {
    const note = seams.note;
    if (!note || (!record.notePending && !sweep)) return record;
    let current = record;
    let late = false;
    const one = async (r: CallRecord): Promise<CallRecord> => {
      if (!r.notePending) return r;
      let step: NoteStep = "pending";
      try {
        step = await note({ call: r, package: r.notePending.package, event: r.notePending.event });
      } catch (e) {
        console.error("[maya call] note failed", r.id, e instanceof Error ? e.message : String(e));
      }
      if (step !== "done" || late || !(await store.clearNote(r.id))) return r;
      return { ...r, notePending: null };
    };
    const work = (async () => {
      const done = await one(current);
      if (!late) current = done;
      if (!sweep) return;
      for (const other of await store.pendingNotes(record.childId, NOTE_SWEEP + 1)) {
        if (late) return;
        if (other.id !== record.id && other.status === "ended") await one(other);
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeUp = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), seams.noteMs ?? NOTE_STEP_MS);
    });
    try {
      if ((await Promise.race([work.then(() => "done" as const), timeUp])) === "late") {
        late = true;
        console.error("[maya call] note step ran out of time", record.id);
      }
    } catch (e) {
      console.error("[maya call] note step failed", record.id, e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
    work.catch(() => {});
    return current;
  }

  /** Stores the outcome of a call that has just ended, then writes its event and rebuilds the profile. Null on a conflict. */
  async function end(record: CallRecord, pkg: QuestionPackage, session: TextSession, how: FinishOptions = {}): Promise<CallRecord | null> {
    const trace = await session.finish(how);
    const change: CallChange = {
      status: "ended",
      // Kept until the learning event is written (afterEnd).
      live: { package: pkg, text: await session.saved() },
      // Kept until the parent's note is written (notes).
      notePending: seams.note ? { package: pkg, event: learningEvent(session.session, { parentId: record.parentId, childId: record.childId }) } : null,
      trace,
      boardHistory: boardHistoryOf(trace),
      outcome: trace.outcome,
      counts: countsOf(trace),
      startedAt: trace.startedAt,
      endedAt: trace.endedAt ?? iso(seams.clock()),
    };
    if (!(await store.update(record.id, record.revision, change))) return null;
    return afterEnd({ ...record, ...change, revision: record.revision + 1 }, session, true);
  }

  /** Saves a live call after an input, or ends it when the call has ended. Null on a conflict. */
  async function save(record: CallRecord, pkg: QuestionPackage, session: TextSession): Promise<CallRecord | null> {
    if (session.ended) return end(record, pkg, session);
    const change: CallChange = { live: { package: pkg, text: await session.saved() }, startedAt: session.trace().startedAt };
    if (!(await store.update(record.id, record.revision, change))) return null;
    return { ...record, ...change, revision: record.revision + 1 };
  }

  const result = (record: CallRecord, trace: MayaTrace, out: TextOutput | null): CallResult => ({
    ok: true,
    view: callView(record, trace),
    output: { say: out?.say ?? [], newBatches: out?.board.length ?? 0, safetyMessage: out?.safetyMessage ?? null },
  });

  return {
    async start(input) {
      if (!(await seams.isTestFamily(input.parentId))) return { ok: false, error: "not_test_family" };
      const check = checkQuestionPackage(input.package);
      if (!check.ok) return { ok: false, error: "invalid_question" };
      const pkg = check.package;
      const model = seams.model(null);
      if (!model) return { ok: false, error: "model_unavailable" };
      const id = seams.newId();
      const session = textSession({ id }, pkg, model, input.childName, undefined, seams.seed(), await readHistory(input.childId));
      const empty = session.trace();
      let record: CallRecord = {
        id,
        createdAt: iso(seams.clock()),
        recordVersion: CALL_RECORD_VERSION,
        kind: input.kind,
        mode: "text",
        startedBy: input.startedBy,
        parentId: input.parentId,
        childId: input.childId,
        question: pkg.ref,
        packageId: pkg.id,
        packageHash: packageHash(pkg),
        questionText: pkg.text,
        status: "live",
        revision: 0,
        startedAt: null,
        endedAt: null,
        model: model.id,
        promptVersion: model.promptVersion,
        versions: { ...empty.versions, trace: empty.version },
        outcome: null,
        counts: null,
        live: { package: pkg, text: await session.saved() },
        trace: null,
        boardHistory: null,
        learningEventId: null,
        profileRebuiltAt: null,
        notePending: null,
      };
      await store.insert(record);
      let out: TextOutput | null = null;
      try {
        out = await session.start();
      } finally {
        const saved = await save(record, pkg, session);
        if (saved) record = saved;
      }
      return result(record, record.trace ?? session.trace(), out);
    },

    async input(id, revision, input, childName) {
      if (!checkInput(input)) return { ok: false, error: "invalid_input" };
      const record = await store.get(id);
      if (!record) return { ok: false, error: "not_found" };
      if (record.revision !== revision) return { ok: false, error: "conflict" };
      if (record.status === "ended") {
        if (input.type !== "end" || !record.trace) return { ok: false, error: "conflict" };
        // An ended call: write the event and rebuild the profile when an earlier try did not.
        const final = record.live ? textSession(record, record.live.package, idleModel(record), childName, record.live.text) : null;
        const done = await afterEnd(record, final);
        return result(done, done.trace!, null);
      }
      if (!record.live) return { ok: false, error: "conflict" };
      const { package: pkg, text: saved } = record.live;
      const model = seams.model(record.model);
      if (!model) {
        // The model this call started with is gone (the key was removed): the call ends, recorded with its own model.
        const session = textSession(record, pkg, idleModel(record), childName, saved);
        const ended = await end(record, pkg, session, { detail: "the model this call started with is no longer available" });
        return ended ? result(ended, ended.trace!, null) : { ok: false, error: "conflict" };
      }
      const session = textSession(record, pkg, model, childName, saved);
      let out: TextOutput | null = null;
      let saved2: CallRecord | null = null;
      if (input.type === "end") {
        saved2 = await end(record, pkg, session, { reason: "child_stopped" });
      } else {
        try {
          out = input.type === "child" ? await session.child(input.text.trim()) : input.type === "tick" ? await session.tick() : await session.writing(input.status);
        } finally {
          saved2 = await save(record, pkg, session);
        }
      }
      if (!saved2) return { ok: false, error: "conflict" };
      return result(saved2, saved2.trace ?? session.trace(), out);
    },

    async view(id) {
      const record = await store.get(id);
      return record && recordView(record);
    },
  };
}
