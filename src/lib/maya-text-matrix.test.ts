import { describe, expect, it } from "vitest";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextSession } from "@/lib/maya-text";
import { checkTrace, type MayaTrace } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const states = ["idle", "model pending", "review pending", "output buffered", "partially delivered", "terminal pending"] as const;
const inputs = ["start", "child", "partial", "approved speech", "other speech", "content", "tick", "writing started", "writing done", "technical", "finish technical", "finish stopped"] as const;
type Input = typeof inputs[number];
type State = typeof states[number];
type Debt = "served" | "pending" | `dropped: ${string}`;
type Expected = {
  state: string; acts: string[]; boards: number; solved: "child" | null; lastResult: "right" | null; wrote: boolean;
  reason: "content_issue" | "technical_issue" | "child_stopped" | null;
  children: Debt[]; opening: Debt; repair?: Debt; content?: Debt;
};
const cell = (state: string, acts: string[], boards = 0, extra: Partial<Expected> = {}): Expected => ({
  state, acts, boards, solved: null, lastResult: extra.solved ? "right" : null, wrote: false, reason: null, children: [], opening: "served", ...extra,
});
const O = ["open"], A = ["open", "accept_answer"], X = ["open", "example_step", "example_step", "example_step"];
const replaced: Debt = "dropped: replaced by the next complete transcript";
const priority: Debt = "dropped: superseded by priority input";
const endTechnical: Debt = "dropped: call ended: technical_issue";
const endStopped: Debt = "dropped: call ended: child_stopped";
// Columns follow inputs above. These are the results stated in PR #424, not values derived from the controller.
const expected: Record<State, Expected[]> = {
  idle: [
    cell("OPEN", O), cell("CHECK", A, 1, { solved: "child", children: ["served"] }), cell("OPEN", O), cell("OPEN", O), cell("OPEN", O),
    cell("CLOSE", [...O, "close"], 0, { reason: "content_issue", content: "served" }),
    cell("OPEN", O), cell("OPEN", O), cell("OPEN", O),
    cell("CLOSE", O, 0, { reason: "technical_issue" }), cell("CLOSE", O, 0, { reason: "technical_issue" }), cell("CLOSE", O, 0, { reason: "child_stopped" }),
  ],
  "model pending": [
    cell("CHECK", A, 1, { solved: "child", children: ["served"] }),
    cell("CHECK", A, 1, { solved: "child", children: [replaced, "served"] }),
    cell("ASSESS", O, 0, { children: ["pending"] }),
    cell("CHECK", A, 1, { solved: "child", children: ["served"] }),
    cell("CHECK", [...O, "repair", "accept_answer"], 1, { solved: "child", children: ["served"], repair: "served" }),
    cell("CLOSE", [...O, "close"], 0, { children: ["served"], reason: "content_issue", content: "served" }),
    cell("CHECK", A, 1, { solved: "child", children: ["served"] }),
    cell("WAIT_WRITE", A, 1, { solved: "child", children: ["served"] }),
    cell("CHECK", A, 1, { solved: "child", wrote: true, children: ["served"] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [endTechnical] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [endTechnical] }),
    cell("CLOSE", O, 0, { reason: "child_stopped", children: [endStopped] }),
  ],
  "review pending": [
    cell("REDIRECT", [...O, "redirect"], 0, { children: ["served"] }),
    cell("CHECK", A, 1, { solved: "child", children: [replaced, "served"] }),
    cell("ASSESS", O, 0, { children: ["pending"] }),
    cell("REDIRECT", [...O, "redirect"], 0, { children: ["served"] }),
    cell("TRY_TARGET", [...O, "repair", "try_target"], 0, { children: ["served"], repair: "served" }),
    cell("CLOSE", [...O, "close"], 0, { children: ["served"], reason: "content_issue", content: "served" }),
    cell("REDIRECT", [...O, "redirect"], 0, { children: ["served"] }),
    cell("REDIRECT", [...O, "redirect"], 0, { children: ["served"] }),
    cell("REDIRECT", [...O, "redirect"], 0, { children: ["served"] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [endTechnical] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [endTechnical] }),
    cell("CLOSE", O, 0, { reason: "child_stopped", children: [endStopped] }),
  ],
  "output buffered": [
    cell("OPEN", O), cell("CHECK", A, 1, { solved: "child", children: ["served"] }),
    cell("OPEN", [], 0, { opening: "pending" }), cell("OPEN", O), cell("OPEN", O),
    cell("CLOSE", ["close"], 0, { reason: "content_issue", opening: priority, content: "served" }),
    cell("OPEN", O), cell("OPEN", O), cell("OPEN", O),
    cell("CLOSE", [], 0, { reason: "technical_issue", opening: priority }),
    cell("CLOSE", [], 0, { reason: "technical_issue", opening: priority }),
    cell("CLOSE", [], 0, { reason: "child_stopped", opening: priority }),
  ],
  "partially delivered": [
    cell("MODEL_EXAMPLE", X, 3, { children: ["served"] }),
    cell("CHECK", [...X, "accept_answer"], 4, { solved: "child", children: ["served", "served"] }),
    cell("MODEL_EXAMPLE", X, 3, { children: ["served"] }),
    cell("MODEL_EXAMPLE", X, 3, { children: ["served"] }),
    cell("MODEL_EXAMPLE", [...X, "repair"], 4, { children: ["served"], repair: "served" }),
    cell("CLOSE", [...X, "close"], 3, { children: ["served"], reason: "content_issue", content: "served" }),
    cell("MODEL_EXAMPLE", X, 3, { children: ["served"] }), cell("WAIT_WRITE", X, 3, { children: ["served"] }), cell("MODEL_EXAMPLE", X, 3, { children: ["served"] }),
    cell("CLOSE", X, 3, { reason: "technical_issue", children: ["served"] }),
    cell("CLOSE", X, 3, { reason: "technical_issue", children: ["served"] }),
    cell("CLOSE", X, 3, { reason: "child_stopped", children: ["served"] }),
  ],
  "terminal pending": [
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["served"] }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", lastResult: "right", children: [priority, "served"] }),
    cell("ASSESS", O, 0, { children: ["dropped: cancelled by partial transcript"] }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["served"] }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["dropped: superseded by speech repair"], repair: endStopped }),
    cell("CLOSE", [...O, "close"], 0, { reason: "content_issue", children: [priority], content: "served" }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["served"] }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["served"] }),
    cell("CLOSE", [...O, "close"], 0, { reason: "child_stopped", children: ["served"] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [priority] }),
    cell("CLOSE", O, 0, { reason: "technical_issue", children: [priority] }),
    cell("CLOSE", O, 0, { reason: "child_stopped", children: [priority] }),
  ],
};
const cancellation: Record<State, [boolean, boolean][]> = {
  idle: [[false,false],[false,false],[true,true],[false,false],[false,false],[true,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
  "model pending": [[false,false],[true,false],[true,true],[false,false],[false,true],[false,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
  "review pending": [[false,false],[true,true],[true,true],[false,false],[false,true],[false,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
  "output buffered": [[false,false],[true,true],[true,true],[false,true],[false,true],[false,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
  "partially delivered": [[false,false],[false,false],[true,true],[false,false],[true,true],[true,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
  "terminal pending": [[false,false],[true,true],[true,true],[false,false],[false,true],[false,true],[false,false],[false,false],[false,false],[true,true],[false,false],[false,false]],
};
function assertCell(s: TextSession, want: Expected, prefixBoard: MayaTrace["board"]) {
  const trace = s.trace();
  expect(s.session.state).toBe(want.state);
  expect(s.session.solved).toBe(want.solved);
  expect(s.session.lastResult).toBe(want.lastResult);
  expect(s.session.wrote ?? false).toBe(want.wrote);
  expect(s.session.outcome?.reason ?? null).toBe(want.reason);
  expect(trace.outcome?.reason ?? null).toBe(want.reason);
  expect(s.ended).toBe(want.reason !== null);
  expect(trace.turns.flatMap(t => t.kind === "maya" && t.output ? [t.output.act] : [])).toEqual(want.acts);
  expect(trace.board).toHaveLength(want.boards);
  expect(trace.board.slice(0, prefixBoard.length)).toEqual(prefixBoard);
  for (const b of trace.board.slice(prefixBoard.length)) expect(b.commands).toEqual([
    { op: "columns", id: "question", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } },
  ]);
  const debts = (kind: string) => trace.obligations!.filter(o => o.kind === kind).map(o => o.status === "dropped" ? `dropped: ${o.reason}` : o.status);
  expect(debts("start_pending")).toEqual(["served"]);
  expect(debts("opening_due")).toEqual([want.opening]);
  expect(debts("child_turn_pending")).toEqual(want.children);
  expect(debts("repair_due")).toEqual(want.repair ? [want.repair] : []);
  expect(debts("content_problem")).toEqual(want.content ? [want.content] : []);
  expect(trace.obligations).toHaveLength(2 + want.children.length + Number(!!want.repair) + Number(!!want.content));
  for (const o of trace.obligations!.filter(o => o.status === "served")) {
    const turn = trace.turns[o.servedBy!];
    expect(turn).toBeDefined();
    if (o.kind === "child_turn_pending") expect(o.servedBy!).toBeGreaterThan(trace.turns.findLastIndex((t, i) => i < o.servedBy! && t.kind === "child" && t.text === o.text));
  }
  expect(checkTrace(trace), JSON.stringify(checkTrace(trace))).toMatchObject({ ok: true });
}

describe("input matrix", () => {
  const cases = states.flatMap(state => inputs.flatMap((input, column) => [false, true].flatMap(resume => [false, true].map(checkpoint => ({ state, input, column, resume, checkpoint })))));
  it.each(cases)("$state / $input / resume=$resume / checkpoint=$checkpoint", async ({ state, input, column, resume, checkpoint }) => {
    const base = ruleMayaModel(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let hold = false, aborts = 0, approval = "", proposals = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      proposals++;
      if (hold && state === "model pending") { hold = false; args[1]?.addEventListener("abort", () => { aborts++; }); entered.resolve(); await release.promise; }
      if (hold && state === "review pending") return { version: 2, act: "redirect", reading: { offTopic: true }, parts: [{ talk: "Thanks for telling me." }] };
      return base.propose(...args);
    } };
    const reviewer = { id: "matrix", promptVersion: "test", review: async () => { hold = false; entered.resolve(); await release.promise; return { verdict: "pass" as const }; } };
    const opts = { callId: "matrix", package: SAMPLE_PACKAGES["add-27-39"], model, reviewer, freeTalk: true, clock: () => T0 };
    const s = createTextSession(opts);
    let pending: ReturnType<TextSession["start"]> | undefined;
    const ticks: ReturnType<TextSession["tick"]>[] = [];
    const act = async () => {
      // Append public, non-interrupting inputs synchronously at the fixture boundary.
      // This creates a real checkpoint while the original response or buffered output still exists.
      if (checkpoint && state === "output buffered") for (let i = 0; i < 64; i++) ticks.push(s.tick());
      const snapshot = s.saved();
      const prefixBoard = s.trace().board;
      const target = resume ? createTextSession({ ...opts, resume: json(await snapshot) }) : s;
      const beforeProposals = proposals;
      const operation = invoke(target, input, approval);
      const receipt = json(await target.saved());
      expect(receipt.checkpoint !== undefined).toBe(checkpoint);
      const restored = createTextSession({ ...opts, resume: receipt });
      release.resolve();
      const result = await operation;
      expect("cancelled" in result ? result.cancelled : false).toBe(cancellation[state][column][Number(resume)]);
      const pendingApproval = input === "approved speech" && ["model pending", "review pending"].includes(state);
      expect(target.session.state).toBe(pendingApproval ? "ASSESS" : expected[state][column].state);
      if (input === "partial") {
        expect("say" in result ? result.say : []).toEqual([]);
        expect("board" in result ? result.board : []).toEqual([]);
        expect(await target.tick()).toMatchObject({ say: [], board: [], ended: null });
      }
      if (["approved speech", "other speech", "tick", "writing started", "writing done", "start", "content"].includes(input)) expect(aborts).toBe(0);
      if (input === "approved speech") expect(proposals).toBe(beforeProposals);
      const original = !resume ? await pending : undefined;
      const queued = !resume ? await Promise.all(ticks) : [];
      // An approval returns immediately. Continue both it and its saved receipt to deliver the original work.
      const drained = await target.start();
      const delivery = [original, ...queued, "say" in result ? result : undefined, drained].filter(o => o !== undefined);
      const newTurns = target.trace().turns.slice((await snapshot).turns.length);
      const deliveredSay = newTurns.flatMap(t => t.kind === "maya" && t.output ? t.output.say : []);
      const deliveredBoard = target.trace().board.slice(prefixBoard.length).map(b => ({ transactionId: b.transactionId, commands: b.commands }));
      expect(delivery.flatMap(o => o.say)).toEqual(deliveredSay);
      expect(delivery.flatMap(o => o.board)).toEqual(deliveredBoard);
      assertCell(target, expected[state][column], prefixBoard);
      if (input === "partial") expect(await restored.tick()).toMatchObject({ say: [], board: [], ended: null });
      else {
        const continued = await restored.start();
        const turns = restored.trace().turns.slice(receipt.turns.length);
        expect(continued.say).toEqual(turns.flatMap(t => t.kind === "maya" && t.output ? t.output.say : []));
        expect(continued.board).toEqual(restored.trace().board.slice(receipt.board.length).map(b => ({ transactionId: b.transactionId, commands: b.commands })));
      }
      assertCell(restored, expected[state][column], prefixBoard);
      if (input.startsWith("finish")) expect(result).toMatchObject({ kind: target.trace().kind, outcome: { reason: expected[state][column].reason } });
      // Reporting a later example utterance proves that the partial revoked all remaining approvals.
      if (input === "partial" && state === "partially delivered") {
        for (const live of [target, restored]) {
          expect(await live.mayaSaid(approval)).toMatchObject({ cancelled: true, say: [], board: [] });
          expect(live.session.state).toBe("REPAIR_MAYA");
        }
      }
      if (input === "approved speech" && approval) {
        for (const live of [target, restored]) expect((await live.saved()).approved).not.toContain(approval);
      }
      if (process.env.MAYA_MATRIX_RESULTS) process.stdout.write(JSON.stringify({ matrix: true, state, input, resume, checkpoint }) + "\n");
    };
    try {
      if (state === "output buffered") {
        pending = s.start();
        for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.opened) { await act(); return; } }
        throw new Error("opening buffer boundary missing");
      }
      const opening = await s.start(); approval = opening.say[0];
      if (checkpoint) for (let i = 0; i < 40; i++) await s.tick();
      if (state === "idle") { await act(); return; }
      if (state === "partially delivered") {
        const out = await s.child("I don't know how to start.");
        expect(out.say.length).toBeGreaterThan(1); await s.mayaSaid(out.say[0]); approval = out.say[1];
        await act(); return;
      }
      if (state === "terminal pending") {
        pending = s.child("I want to stop.");
        for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.outcome) { await act(); return; } }
        throw new Error("terminal buffer boundary missing");
      }
      hold = true; pending = s.child(state === "model pending" ? "66." : "I like cats.");
      await entered.promise; await act();
    } finally { release.resolve(); await pending; await Promise.all(ticks); }
  });
});

function invoke(s: TextSession, input: Input, approval: string) {
  switch (input) {
    case "start": return s.start();
    case "child": return s.child("66.");
    case "partial": return s.partial("Wait");
    case "approved speech": return s.mayaSaid(approval);
    case "other speech": return s.mayaSaid("Seven plus nine is fifteen.");
    case "content": return s.contentProblem("wrong key");
    case "tick": return s.tick();
    case "writing started": return s.writing("started");
    case "writing done": return s.writing("done");
    case "technical": return s.technical("connection lost");
    case "finish technical": return s.finish({ reason: "technical_issue" });
    case "finish stopped": return s.finish({ reason: "child_stopped" });
  }
}
