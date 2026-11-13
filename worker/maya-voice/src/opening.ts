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
