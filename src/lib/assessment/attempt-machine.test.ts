// The stored test's moves (docs/state-machines.md, item 3). The table must give, for every status and event, exactly
// what the code decided before the table: a test moves only while its stored status is "in_progress".
import { describe, expect, it } from "vitest";
import { ATTEMPT_MOVES, ATTEMPT_STATUSES, type AttemptEvent } from "@/lib/assessment";
import { moves, next } from "@/lib/state-machine";

const EVENTS: readonly AttemptEvent[] = ["finish", "expire"];

describe("test attempt moves", () => {
  it("lists the statuses in the order the admin shows them", () => {
    expect(ATTEMPT_STATUSES).toEqual(["in_progress", "completed", "expired"]);
  });

  it.each(ATTEMPT_STATUSES.flatMap((status) => EVENTS.map((event) => [status, event] as const)))("%s + %s equals the rule before the table", (status, event) => {
    // Before the table, finishOnce and openTest each asked `attempt.status === "in_progress"`.
    const before = status === "in_progress" ? (event === "finish" ? "completed" : "expired") : null;
    expect(next(ATTEMPT_MOVES, status, event)).toBe(before);
  });

  it("has only the two moves out of a test in progress", () => {
    expect(moves(ATTEMPT_MOVES)).toEqual([["in_progress", "finish", "completed"], ["in_progress", "expire", "expired"]]);
  });
});
