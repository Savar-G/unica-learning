// Shown work on the whiteboard (#67, D-083). The whiteboard is optional on every question (D-125), including those the
// session marks show-your-work (Question.showWork): these rules decide what work may go with an answer. The browser and
// the answer route use the same rules.
import { bandFor } from "./constants";
import { nextQuestion } from "./session";
import type { Question, Session } from "./types";

/** What the child left on the whiteboard for one question. */
export interface BoardWork {
  /** True when the drawing has at least one stroke. */
  drawn: boolean;
  /** The typed working, as the child typed it. */
  text: string;
}

/** "typing_off": typed working in grades 1-2, which draw only. */
export type WorkProblem = "typing_off";

/** True when the board has a drawing or typed working. Only spaces and line breaks are not work. */
export const hasWork = (work: BoardWork): boolean => work.drawn || work.text.trim().length > 0;

/**
 * Why this work cannot go with an answer to `question`, or null when it can. The question is the current one unless
 * given (#249: a change checks the question being changed). Throws when there is no question (a complete test).
 */
export function workProblem(session: Session, work: BoardWork, question: Question | null = nextQuestion(session)): WorkProblem | null {
  if (!question) throw new Error("The test is already complete");
  if (!bandFor(session.profile.grade).whiteboardTyping && work.text.trim().length > 0) return "typing_off";
  return null;
}
