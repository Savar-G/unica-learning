// A chat that becomes a call (#1200, spec #1137 user story 29): the child switches from chat to "Call Maya" on the same
// question, and the call goes on with the chat's confirmed lesson instead of starting the question again.
//
// - The call's start (`startVoice` with `fromChat`) reads the chat. A chat of another parent, another child, another
//   question, or a call that is not a desk chat refuses the start (`not_found`, as for no call at all).
// - A live chat with confirmed state (it started, the child spoke, nothing ended or flagged it, the same package) gives
//   the call its lesson: the session (steps, hints, teaching state, the transcript), with the call's own id and limits,
//   and the batches the desk confirmed it showed, as the call's board log. Anything else starts the call fresh.
// - The chat stays live while the child checks the microphone, so a call that never starts leaves it as it was. When
//   the call starts (`resume`, or the fresh call's `start`), the chat ends handed on: no learning event and no parent
//   note of its own, so the question counts once, in the call's event. A chat that moved on in between (another answer)
//   is not ended: it keeps its own lesson and evidence, and the call's event is not written.
// - The call's own time starts when it starts: the session's start moves to that moment (a fresh voice limit), and the
//   chat's time is carried into the learning event's time on the question.
// Pure: no store, no clock (the caller passes the times).
import { voiceBoardHistory } from "@/lib/voice-board-history";
import type { BoardHistory } from "@/lib/board-history";
import type { BoardEvent } from "@/lib/board-protocol";
import type { Session } from "@/lib/maya";
import type { SavedTextSession } from "@/lib/maya-text";
import type { QuestionRef } from "@/lib/question-package";

/** The chat a call came from, and the chat revision its copy was taken at. `seeded`: the call holds the chat's lesson. */
export interface ResumeFrom { id: string; revision: number; seeded: boolean }

/** The fields of a stored call the resume reads. */
export interface ChatRow {
  id: string;
  kind: string;
  mode: string;
  parentId: string;
  childId: string;
  question: QuestionRef;
  packageHash: string;
  status: "live" | "ended";
  revision: number;
  flag: unknown;
  live: { text: SavedTextSession; cancelled?: true } | null;
}

/** The new call the chat is resumed into. `limits`: the call's own limits (the fresh session's). */
export interface ResumeInto { id: string; parentId: string; childId: string; question: QuestionRef; packageHash: string; limits: Session["limits"] }

export type ResumePlan =
  | { ok: false }
  | { ok: true; from: ResumeFrom | null; text: SavedTextSession | null; board: BoardHistory | null };

const sameRef = (a: QuestionRef, b: QuestionRef) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The seam for the child's board selection (#1152, PR #1196): a selection the chat holds goes to the call only while the
 * object it names is on the call's board (a batch the desk showed). Kept loose here so that change merges cleanly; its
 * own checks (`selectedObject`) still compare the board the child pointed at when the selection is used.
 */
export function keepSelectionsOnBoard(session: Session, onBoard: ReadonlySet<string>): void {
  const s = session as Session & { boardSelections?: { batchId: string }[] };
  if (Array.isArray(s.boardSelections)) s.boardSelections = s.boardSelections.filter((x) => onBoard.has(x.batchId));
}

/** The chat's session holds a lesson worth carrying: started, the child spoke, and nothing ended, held or flagged it. */
function confirmed(s: Session): boolean {
  return s.startedAt !== null && !s.outcome && !s.stopRequested && !s.safety.flagged && s.contentProblem === null &&
    s.turn === null && s.turns.some((t) => t.speaker === "child");
}

/** A saved session as one fold with no log: `session` (already edited) and the derived turns and board of `saved`. */
function collapsed(saved: SavedTextSession, session: Session): SavedTextSession {
  const turns = structuredClone(saved.turns);
  const board = structuredClone(saved.board);
  const obligations = saved.obligations ? structuredClone(saved.obligations) : undefined;
  return {
    v: 6, initial: { session: structuredClone(session), endedAt: null, turns, board, ...(obligations ? { obligations } : {}) }, log: [],
    ...(saved.nextRequestId !== undefined ? { nextRequestId: saved.nextRequestId } : {}),
    session, endedAt: null, turns: structuredClone(turns), board: structuredClone(board), ...(obligations ? { obligations: structuredClone(obligations) } : {}),
  };
}

/**
 * What a call made from `chat` starts with. `{ ok: false }`: the chat is not one this call may take (refuse the start).
 * `from`: a live chat the call's start must hand on, else null. `text` and `board`: the chat's lesson, or null for a
 * fresh call. `now` stamps the board log's events.
 */
export function resumePlan(chat: ChatRow | null, into: ResumeInto, now: number): ResumePlan {
  if (!chat || chat.kind !== "chat" || chat.mode !== "text" || chat.parentId !== into.parentId || chat.childId !== into.childId || !sameRef(chat.question, into.question)) return { ok: false };
  if (chat.status !== "live" || !chat.live) return { ok: true, from: null, text: null, board: null };
  const fresh = { ok: true as const, from: { id: chat.id, revision: chat.revision, seeded: false }, text: null, board: null };
  const saved = chat.live.text;
  if (chat.live.cancelled || chat.flag || chat.packageHash !== into.packageHash || !confirmed(saved.session)) return fresh;
  const session = structuredClone(saved.session);
  const started = session.startedAt!;
  session.callId = into.id;
  delete session.channel;
  if (into.limits) session.limits = structuredClone(into.limits);
  else delete session.limits;
  session.carried = { ms: Math.max(0, (session.now ?? started) - started) };
  // The batches the desk said it showed, in order: the call's board log, which the worker's board sends on connect.
  const events: BoardEvent[] = saved.board.filter((b) => b.fate === "shown").map((b) => ({ kind: "batch", batchId: b.transactionId, commands: structuredClone([...b.commands]), at: now }));
  keepSelectionsOnBoard(session, new Set(events.map((e) => (e.kind === "batch" ? e.batchId : ""))));
  let board: BoardHistory;
  try { board = voiceBoardHistory({ events }, now, now); } catch { return fresh; }
  return { ok: true, from: { ...fresh.from, seeded: true }, text: collapsed(saved, session), board };
}

/**
 * The call's saved session when it starts at `at`: its own time starts now (the session's start, its clock and any
 * wait), so its limits count from here. `evidence` false: the chat kept its own lesson, so this call writes no event.
 */
export function resumedAt(saved: SavedTextSession, at: number, evidence: boolean): SavedTextSession {
  const session = structuredClone(saved.session);
  session.startedAt = at;
  session.now = at;
  if (session.waitingSince !== null) session.waitingSince = at;
  session.silence = "none";
  if (!evidence) session.carried = { ms: session.carried?.ms ?? 0, evidence: false };
  return collapsed(saved, session);
}
