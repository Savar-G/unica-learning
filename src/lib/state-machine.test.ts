import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { moves, next, type Table } from "@/lib/state-machine";

type S = "queued" | "running" | "done";
const RUN: Table<S, "claim" | "finish" | "fail"> = {
  queued: { claim: "running" },
  running: { finish: "done", fail: "queued" },
  done: {},
};

describe("state machine table", () => {
  it("names the next state of each move, and null for a refused event", () => {
    expect(next(RUN, "queued", "claim")).toBe("running");
    expect(next(RUN, "running", "fail")).toBe("queued");
    expect(next(RUN, "queued", "finish")).toBeNull();
    expect(next(RUN, "done", "claim")).toBeNull();
  });

  it("refuses every event in a state the table does not know, without throwing", () => {
    for (const from of ["unexpected", "toString", "__proto__"]) expect(next(RUN, from as S, "claim")).toBeNull();
  });

  it("lists every move in the table's order", () => {
    expect(moves(RUN)).toEqual([["queued", "claim", "running"], ["running", "finish", "done"], ["running", "fail", "queued"]]);
  });

  it("satisfies Table invariants for arbitrary generated state machines", () => {
    const states = ["s0", "s1", "s2", "s3"] as const;
    const events = ["e0", "e1", "e2"] as const;
    const arbTable = fc.dictionary(
      fc.constantFrom(...states),
      fc.dictionary(fc.constantFrom(...events), fc.constantFrom(...states)),
    ).map((partial) => {
      const full = {} as Record<(typeof states)[number], Partial<Record<(typeof events)[number], (typeof states)[number]>>>;
      for (const s of states) full[s] = partial[s] ?? {};
      return full as Table<(typeof states)[number], (typeof events)[number]>;
    });

    fc.assert(
      fc.property(arbTable, fc.string(), fc.constantFrom(...events), (table, unknownState, event) => {
        const listed = moves(table);
        for (const [from, ev, to] of listed) {
          expect(next(table, from, ev)).toBe(to);
        }
        let nonNullCount = 0;
        for (const from of states) {
          for (const ev of events) {
            if (next(table, from, ev) !== null) nonNullCount++;
          }
        }
        expect(listed).toHaveLength(nonNullCount);
        if (!(states as readonly string[]).includes(unknownState)) {
          expect(next(table, unknownState as (typeof states)[number], event)).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });
});
