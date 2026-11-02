import { describe, expect, it } from "vitest";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type SavedTextSession, type TextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";

const T0 = Date.UTC(2026, 10, 1);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const states = ["idle", "model pending", "review pending", "output buffered", "partially delivered", "terminal pending"] as const;
const inputs = ["start", "child", "partial", "approved speech", "other speech", "content", "tick", "writing started", "writing done", "technical", "finish technical", "finish stopped"] as const;
type Input = typeof inputs[number];

describe("input matrix", () => {
  it.each(states.flatMap((state) => inputs.flatMap((input) => [false, true].map((resume) => ({ state, input, resume })))))
  ("$state / $input / resume=$resume", async ({ state, input, resume }) => {
    const base = ruleMayaModel(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let hold = false, aborts = 0, approval = "";
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (hold && state === "model pending") { hold = false; args[1]?.addEventListener("abort", () => { aborts++; }); entered.resolve(); await release.promise; }
      if (hold && state === "review pending") return { version: 2, act: "redirect", reading: { offTopic: true }, parts: [{ talk: "Thanks for telling me." }] };
      return base.propose(...args);
    } };
    const reviewer = { id: "matrix", promptVersion: "test", review: async () => { hold = false; entered.resolve(); await release.promise; return { verdict: "pass" as const }; } };
    const opts = { callId: "matrix", package: SAMPLE_PACKAGES["add-27-39"], model, reviewer, freeTalk: true, clock: () => T0 };
    const s = createTextSession(opts);
    const act = async (live: TextSession) => {
      // saved() captures at invocation, before a queue continuation can deliver buffered output.
      const snapshot = live.saved();
      const target = resume ? createTextSession({ ...opts, resume: json(await snapshot) }) : live;
      const operation = invoke(target, input, approval);
      const receipt: SavedTextSession = json(await target.saved());
      const restored = createTextSession({ ...opts, resume: receipt });
      expect(restored.session).toEqual(receipt.session);
      expect(restored.trace().turns).toEqual(receipt.turns);
      release.resolve();
      const result = await operation;
      if (process.env.MAYA_MATRIX_RESULTS) process.stdout.write(JSON.stringify({ matrix: true, state, input, resume, stateAfter: target.session.state, outcome: target.session.outcome?.reason ?? null, cancelled: "cancelled" in result ? result.cancelled : false, say: "say" in result ? result.say.length : 0, board: "board" in result ? result.board.length : 0 }) + "\n");
      if (input === "partial") {
        expect("say" in result ? result.say : []).toEqual([]);
        const tick = await target.tick(); expect(tick.say).toEqual([]); expect(tick.board).toEqual([]);
      }
      if (input === "approved speech" && approval) expect("cancelled" in result ? result.cancelled : false).toBe(false);
      if (["approved speech", "other speech", "tick", "writing started", "writing done", "start", "content"].includes(input)) expect(aborts).toBe(0);
      if (input === "content") expect(target.session.outcome?.reason).toBe("content_issue");
      if (input.startsWith("finish") || input === "technical") expect(target.session.outcome).not.toBeNull();
      if (input === "partial" && state === "terminal pending") expect(target.session.outcome).toBeNull();
      expect(checkTrace(target.trace()), JSON.stringify(checkTrace(target.trace()))).toMatchObject({ ok: true });
      // Continue the saved receipt independently, not just two copies of the same prefix.
      if (input === "partial") expect((await restored.tick()).say).toEqual([]);
      else if (!input.startsWith("finish") && input !== "technical") await restored.start();
      expect(checkTrace(restored.trace()), JSON.stringify(checkTrace(restored.trace()))).toMatchObject({ ok: true });
    };
    let pending: Promise<unknown> | undefined;
    try {
      if (state === "output buffered") {
        pending = s.start();
        for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.opened) { await act(s); return; } }
        throw new Error("opening buffer boundary missing");
      }
      const opening = await s.start(); approval = opening.say[0];
      if (state === "idle") { await act(s); return; }
      if (state === "partially delivered") {
        const out = await s.child("I don't know how to start.");
        expect(out.say.length).toBeGreaterThan(1); await s.mayaSaid(out.say[0]); approval = out.say[1];
        await act(s); return;
      }
      if (state === "terminal pending") {
        pending = s.child("I want to stop.");
        for (let i = 0; i < 200; i++) { await Promise.resolve(); if (s.session.outcome) { await act(s); return; } }
        throw new Error("terminal buffer boundary missing");
      }
      hold = true; pending = s.child(state === "model pending" ? "66." : "I like cats.");
      await entered.promise; await act(s);
    } finally { release.resolve(); await pending; }
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
