import { expect, it } from "vitest";
import { TEMPLATES } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import type { MayaTrace } from "@/lib/maya-trace";
import { backupStop } from "./practice";

function trace(misses: number[], extra = ""): MayaTrace {
  const turns = misses.map((finalMisses, i) => ({ kind: "maya", finalMisses, output: {
    act: i === misses.length - 1 ? "close" : "guide", say: [i === misses.length - 1 ? `${TEMPLATES["close.stuck"][0]} We worked on 27 + 39 together today.${extra ? ` ${extra}` : ""}` : "Try the next step."], board: [],
  }, attempts: [{ proposal: { parts: i === misses.length - 1 ? [{ line: "close.stuck" }, { line: "close.together" }] : [] } }] }));
  return { version: 10, outcome: { reason: "child_stopped" }, turns, board: [] } as unknown as MayaTrace;
}

it("accepts the recorded replacement after two committed misses", () => {
  expect(backupStop(trace([0, 1, 2]), FIXTURES.A)).toBe(true);
});
it.each([[0, 0], [0, 1], [0, 2]])("refuses an early stop or an unproven jump: %s", (...misses) => {
  expect(backupStop(trace(misses), FIXTURES.A)).toBe(false);
});
it("refuses any trace that says or draws the answer", () => {
  expect(backupStop(trace([0, 1, 2], "66"), FIXTURES.A)).toBe(false);
  const drawn = trace([0, 1, 2]);
  drawn.board = [{ at: 1, turn: 0, transactionId: "b", commands: [{ op: "write", value: "66" }] }];
  expect(backupStop(drawn, FIXTURES.A)).toBe(false);
});
it("does not infer committed misses from an older trace", () => {
  const old = trace([0, 1, 2]); old.version = 9;
  expect(backupStop(old, FIXTURES.A)).toBe(false);
});

it("accepts only close.stuck for 3 + 0 and only the pair for 27 + 39", () => {
  const pkg = { ...FIXTURES.A, operation: { kind: "add" as const, operands: [3, 0] as [number, number] }, answer: { value: { type: "number" as const, value: 3 }, accepted: [], unit: null } };
  const single = trace([0, 1, 2]);
  const last = single.turns.at(-1)!;
  if (last.kind !== "maya" || !last.output) throw new Error("missing close");
  last.output.say = [TEMPLATES["close.stuck"][0]];
  (last.attempts[0].proposal as { parts: { line: string }[] }).parts = [{ line: "close.stuck" }];
  expect(backupStop(single, pkg)).toBe(true);
  expect(backupStop(single, FIXTURES.A)).toBe(false);
  expect(backupStop(trace([0, 1, 2]), pkg)).toBe(false);
});

it("rejects a spoken fraction answer anywhere in the call", () => {
  const t = trace([0, 1, 2]);
  const first = t.turns[0];
  const close = t.turns.at(-1)!;
  if (first.kind !== "maya" || !first.output || close.kind !== "maya" || !close.output) throw new Error("missing turns");
  first.output.say = ["Seven eighths."];
  close.output.say = [`${TEMPLATES["close.stuck"][0]} We worked on 3/4 + 1/8 together today.`];
  expect(backupStop(t, FIXTURES.D)).toBe(false);
});

it("rejects a fraction answer in a board fraction command", () => {
  const t = trace([0, 1, 2]);
  const close = t.turns.at(-1)!;
  if (close.kind !== "maya" || !close.output) throw new Error("missing close");
  close.output.say = [`${TEMPLATES["close.stuck"][0]} We worked on 3/4 + 1/8 together today.`];
  expect(backupStop(t, FIXTURES.D)).toBe(true);
  t.board = [{ at: 1, turn: 0, transactionId: "b", commands: [{ op: "fraction", id: "fraction", numerator: "7", denominator: "8" }] }];
  expect(backupStop(t, FIXTURES.D)).toBe(false);
});
