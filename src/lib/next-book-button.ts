// What the admin child page shows for "Prepare from snapshot" (#476). The planner is checked first: with no planner the
// page reads nothing for the button. The button's own read can fail without breaking the rest of the child page.

/** hidden: no delivered book 1. not-ready: no planner yet (nothing read). unavailable: the delivery read failed. */
export type NextBookButtonState = "hidden" | "not-ready" | "ready" | "unavailable";

export async function nextBookButtonState(input: { ready: boolean; book1Id: string | null; delivered(bookId: string): Promise<boolean> }): Promise<NextBookButtonState> {
  if (!input.book1Id) return "hidden";
  if (!input.ready) return "not-ready";
  try {
    return await input.delivered(input.book1Id) ? "ready" : "hidden";
  } catch {
    return "unavailable";
  }
}
