// Where the child goes from a question of the test (#249, #253), and its main button (D-132). Pure: no React, no
// network, no clock. The test screen (src/components/test.tsx) asks this module on every Back, Next, step tap and
// failed save.

/**
 * How the child leaves the question on the screen: Back, the main button (Next, or "Back to my answers" in review), a
 * tap on a step (an answered question by its number, or the newest question, null), or (a save failed) back to the
 * question whose save failed.
 */
export type LeaveAction = "back" | "next" | { go: number | null } | { reopen: number };

/** Where the screen goes: an answered question, the newest question, the section's grid, or nowhere (the child stays). */
export type Destination = { to: "question"; number: number } | { to: "newest" } | { to: "grid" } | { to: "stay" };

export interface QuestionPlace {
  /**
   * The child is reviewing (D-132): the section's "Check your answers" grid was reached (the step is "check": complete
   * and not locked), during the test or after a resume that landed on the grid.
   */
  reviewing: boolean;
  /** The open section's answered question numbers, in order. */
  answered: readonly number[];
  /** The answered question on the screen, or null for the newest question (never null in review). */
  viewing: number | null;
  /** The newest question's number (not answered yet); unused in review, where every question is answered. */
  newest: number;
  /** A background save failed for this question, which must open again; null when none failed. */
  failed: number | null;
}

/** The buttons of a question: the main button's words. */
export interface QuestionButtons {
  main: "Next" | "Back to my answers";
}

/** The buttons of the question on the screen. */
export function questionButtons(place: Pick<QuestionPlace, "reviewing">): QuestionButtons {
  return { main: place.reviewing ? "Back to my answers" : "Next" };
}

/**
 * Where leaving the question on the screen goes. A failed save comes first: whatever the child pressed, the question
 * whose save failed opens again. In review (D-132) the main button goes to the grid; before it, Next goes to the
 * following answered question, or the newest question. Back goes to the answered question before (none: the child
 * stays). A step opens its question; the newest question's step does nothing on the newest question itself.
 */
export function leaveDestination(place: QuestionPlace, leave: LeaveAction): Destination {
  if (place.failed !== null) return { to: "question", number: place.failed };
  if (typeof leave === "object" && "reopen" in leave) return { to: "question", number: leave.reopen };
  const here = place.viewing ?? place.newest;
  const question = (n: number | undefined): Destination => (n === undefined ? { to: "stay" } : { to: "question", number: n });
  if (leave === "back") return question(place.answered.filter((n) => n < here).at(-1));
  if (leave === "next") {
    if (place.reviewing) return { to: "grid" };
    const following = place.answered.find((n) => n > here);
    return following === undefined ? { to: "newest" } : question(following);
  }
  if (leave.go !== null) return question(leave.go);
  if (place.reviewing) return { to: "grid" };
  return place.viewing === null ? { to: "stay" } : { to: "newest" };
}
