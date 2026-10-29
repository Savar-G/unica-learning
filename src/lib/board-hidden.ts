/** The whiteboard is open on every test question; the child's choice to hide it sticks for the test session. */
export const BOARD_KEY = "unica.test.boardHidden";

interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The kept choice. Storage that is missing, blocked or throwing counts as "not hidden". */
export function readBoardHidden(store: () => Store): boolean {
  try {
    return store().getItem(BOARD_KEY) === "1";
  } catch {
    return false;
  }
}

/** Keeps the choice for a reload. A failure is ignored: the choice still holds in memory. */
export function writeBoardHidden(store: () => Store, hidden: boolean): void {
  try {
    store().setItem(BOARD_KEY, hidden ? "1" : "0");
  } catch {}
}

/** A question opens with the board visible unless the child hid it; stored or restored work always shows it. */
export function boardStartsOpen(hasWork: boolean, hidden: boolean): boolean {
  return hasWork || !hidden;
}
