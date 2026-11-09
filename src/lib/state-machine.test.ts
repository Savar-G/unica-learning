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

  it("lists every move in the table's order", () => {
    expect(moves(RUN)).toEqual([["queued", "claim", "running"], ["running", "finish", "done"], ["running", "fail", "queued"]]);
  });
});
