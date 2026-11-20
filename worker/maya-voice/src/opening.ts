// The opening the worker speaks itself, the moment the child is connected (Savar, 2026-11-13: "As soon as I start the
// call, it should say 'Hi there, I'm Maya...' right away"). In a conversational call (D-341) the opening is code's own
// line (`openingLine` in src/lib/maya), and the call's start records the same line with no model call
// (`start({ openingSpoken: true })`), so the spoken and the recorded words are the same.
import { openingLine, type Session } from "@/lib/maya";

/**
 * The opening for the worker to speak, or null when the call's own start must give the words: a call already started,
 * a session that is not conversational (its opening is the model's), or a question with no operation. A workbook call
 * that confirms its printed reference names the page and the number, as the session's own opening does.
 */
export function voiceOpening(session: Session): string | null {
  const pkg = session.package;
  if (!pkg || session.startedAt !== null || session.conversational !== true) return null;
  return openingLine(pkg, session.confirmWorkbook && pkg.ref.source === "workbook" ? { page: pkg.ref.page, number: pkg.ref.question } : undefined);
}

/** The id under which the continuation line is saved in the call's acknowledged list, so it is said once per call. */
export const CONTINUE_ID = "continue.lesson";

/**
 * #1200: the line a call that goes on with a chat's lesson says when the child joins, instead of the opening: a short
 * continuation, then the last question Maya asked in the chat (words she already said there), so the child knows what
 * to answer. Null for any other call, and once the call has taken the lesson over (a rejoin or a new worker).
 */
export function voiceContinuation(call: { readonly resumed?: boolean; readonly session: Session }): string | null {
  if (!call.resumed) return null;
  const last = call.session.turns.findLast((t) => t.speaker === "maya")?.text ?? "";
  const question = last.match(/[^.!?]*\?/g)?.at(-1)?.trim();
  return question ? `Let's keep going. ${question}` : "Let's keep going from where we were.";
}
