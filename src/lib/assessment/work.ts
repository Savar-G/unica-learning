// Shown work on the whiteboard (#67, D-083). The session decides which questions require it (Question.showWork);
// these rules decide what work may go with an answer. The browser and the answer route use the same rules.
import { bandFor } from "./constants";
import { nextQuestion } from "./session";
import type { Session } from "./types";

/** What the child left on the whiteboard for one question. */
export interface BoardWork {
  /** True when the drawing has at least one stroke. */
  drawn: boolean;
  /** The typed working, as the child typed it. */
  text: string;
}

/** "work_required": a show-your-work question with an empty board. "typing_off": typed working in grades 1-2, which draw only. */
export type WorkProblem = "work_required" | "typing_off";

/** True when the board has a drawing or typed working. Only spaces and line breaks are not work. */
export const hasWork = (work: BoardWork): boolean => work.drawn || work.text.trim().length > 0;

/** Why this work cannot go with an answer to the current question, or null when it can. Throws on a complete test. */
export function workProblem(session: Session, work: BoardWork): WorkProblem | null {
  const q = nextQuestion(session);
  if (!q) throw new Error("The test is already complete");
  if (!bandFor(session.profile.grade).whiteboardTyping && work.text.trim().length > 0) return "typing_off";
  if (q.showWork && !hasWork(work)) return "work_required";
  return null;
}
