// A chat that becomes a call (#1200, spec #1137 user story 29): the child switches from chat to "Call Maya" on the same
// question, and the call goes on with the chat's confirmed lesson instead of starting the question again.
//
// - The call's start (`startVoice` with `fromChat`) reads the chat. A chat of another parent, another child, another
//   question, or a call that is not a desk chat refuses the start (`not_found`, as for no call at all).
// - The voice row holds a copy of the confirmed chat checkpoint while the child checks the microphone. When voice
//   starts, it can use that checkpoint only after the chat has ended for that specific call. The chat's closing trace
//   names the call, so a replacement worker can finish the handoff without recording the chat's learning evidence.
// - The call's own time starts when it starts: the session's start moves to that moment (a fresh voice limit), and the
//   chat's time is carried into the learning event's time on the question.
// Pure: no store, no clock (the caller passes the times).
import { boardPaths, type Scene } from "@/lib/board";
import { restoreScene } from "@/lib/board-protocol";
import { voiceBoardHistory } from "@/lib/voice-board-history";
import type { BoardHistory } from "@/lib/board-history";
import type { BoardEvent } from "@/lib/board-protocol";
import type { Session } from "@/lib/maya";
import type { BoardFateReport, SavedTextSession } from "@/lib/maya-text";
import type { QuestionRef } from "@/lib/question-package";

/** The chat a call came from, and the chat revision its copy was taken at. `seeded`: the call holds the chat's lesson. */
export interface ResumeFrom { id: string; revision: number; seeded: boolean; fates?: BoardFateReport[] }

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

export function ownsChat(chat: ChatRow | null, into: Pick<ResumeInto, "parentId" | "childId" | "question">): chat is ChatRow {
  if (!chat || chat.kind !== "chat" || chat.mode !== "text" || chat.parentId !== into.parentId || chat.childId !== into.childId) return false;
  const source = chat.question;
  const destination = into.question;
  if (source.source === "workbook" && destination.source === "workbook") {
    return source.workbookId === destination.workbookId && source.page === destination.page && source.question === destination.question;
  }
  return source.source === "assessment" && destination.source === "assessment" &&
    source.assessmentId === destination.assessmentId && source.questionId === destination.questionId;
}

// The selection record comes from #1152. Keep only the latest answered tap if its original drawing is still visible.
// Keeping an older tap after rejecting the latest one would put stale context back into the tutor brief.
function revalidateSelection(session: Session, scene: Scene): boolean {
  const saved = session as Session & { boardSelections?: { objectId: string; batchId: string; boardRevision: number; result: string }[] };
  if (!Array.isArray(saved.boardSelections)) return false;
  const last = saved.boardSelections.at(-1);
  saved.boardSelections = last?.result === "answer" && last.boardRevision === session.batches &&
    scene.log.findLast((batch) => !batch.undone && batch.steps.some((step) => step.creates.includes(last.objectId)))?.id === last.batchId &&
    boardPaths(scene).some((path) => path.objectId === last.objectId) ? [last] : [];
  return saved.boardSelections.length > 0;
}

/** The session can carry confirmed work only while it is started, settled and safe. */
function canCarry(s: Session): s is Session & { startedAt: number } {
  return s.startedAt !== null && !s.outcome && !s.stopRequested && !s.safety.flagged && s.contentProblem === null &&
    s.turn === null;
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
 * The source is rechecked when the worker starts. `text` and `board`: the chat's lesson, or null for a
 * fresh call. `now` stamps the board log's events.
 */
export function resumePlan(chat: ChatRow | null, into: ResumeInto, now: number): ResumePlan {
  if (!ownsChat(chat, into)) return { ok: false };
  const fresh = { ok: true as const, from: { id: chat.id, revision: chat.revision, seeded: false }, text: null, board: null };
  if (chat.status !== "live" || !chat.live) return fresh;
  const saved = chat.live.text;
  if (chat.live.cancelled || chat.flag || chat.packageHash !== into.packageHash || saved.endedAt !== null || !canCarry(saved.session)) return fresh;
  const session = structuredClone(saved.session);
  const started = session.startedAt;
  session.callId = into.id;
  delete session.channel;
  if (into.limits) session.limits = structuredClone(into.limits);
  else delete session.limits;
  session.carried = { ms: Math.max(0, (session.now ?? started) - started) };
  // The batches the desk said it showed, in order: the call's board log, which the worker's board sends on connect.
  const events: BoardEvent[] = saved.board.filter((b) => b.fate === "shown").map((b) => ({ kind: "batch", batchId: b.transactionId, commands: structuredClone([...b.commands]), at: now }));
  const scene = restoreScene({ events });
  if (!scene) return fresh;
  const selectionConfirmed = revalidateSelection(session, scene);
  if (!selectionConfirmed && !session.turns.some((turn) => turn.speaker === "child")) return fresh;
  let board: BoardHistory;
  try { board = voiceBoardHistory({ events }, now, now); } catch { return fresh; }
  return { ok: true, from: { ...fresh.from, seeded: true }, text: collapsed(saved, session), board };
}

/** The voice clock starts after the source chat ends. Other lesson timing remains as it was confirmed. */
export function resumedAt(saved: SavedTextSession, at: number): SavedTextSession {
  const session = structuredClone(saved.session);
  session.startedAt = at;
  session.now = at;
  if (session.waitingSince !== null) session.waitingSince = at;
  session.silence = "none";
  return collapsed(saved, session);
}

/** A fresh call linked to a chat that already owns the question evidence must not record a second event. */
export function withoutEvidence(saved: SavedTextSession): SavedTextSession {
  const session = structuredClone(saved.session);
  session.carried = { ms: 0, evidence: false };
  return collapsed(saved, session);
}
