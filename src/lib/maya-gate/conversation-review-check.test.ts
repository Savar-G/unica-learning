import { beforeAll, expect, it, vi } from "vitest";
import { createTextSession } from "@/lib/maya-text";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { judge, type Behaviour } from "@/lib/maya-gate/gate";
import type { MayaTrace } from "@/lib/maya-trace";
vi.mock("server-only", () => ({}));
let trace: MayaTrace;
const b: Behaviour = { id: "reviewed-chat", title: "reviewed conversational chat", fixture: "B", status: "passing", steps: [], expect: { outcome: {} } };
beforeAll(async () => {
  const model = conversationalFake({ answer: () => reply("Good start. What can you do in the ones?", "guide", { step: "ones", level: 0 }) });
  const text = createTextSession({ callId: b.id, package: FIXTURES.B, clock: () => 1000, random: 3, model, reviewer: fakeTalkReviewer(), channel: "chat", freeTalk: false });
  await text.start();
  const out = await text.child("Can we start?");
  expect(out.say.join(" ")).toContain("Good start.");
  trace = await text.finish({ reason: "child_stopped" });
  expect(trace.turns.flatMap(t => t.kind === "maya" ? t.attempts.flatMap(a => a.talk ?? []) : []).some(x => x.shown === "Good start." && x.code === null && x.review === "pass")).toBe(true);
});
const codes = (t: MayaTrace, behaviour = b) => judge(behaviour, JSON.stringify(t)).failures.map(f => f.code);
it("accepts passed conversational review with the open-ended free-talk switch off", () => {
  expect(codes(trace)).not.toContain("free_talk_unchecked");
});
it("keeps the same conversational review rule on a child math-claim turn", () => {
  expect(codes(trace, { ...b, steps: [{ child: "Can we start?", mathClaim: true }] })).not.toContain("free_talk_unchecked");
});
it.each(["not_run", "fail"] as const)("rejects an absent or failed sentence review: %s", status => {
  const t = structuredClone(trace);
  for (const turn of t.turns) if (turn.kind === "maya") for (const attempt of turn.attempts) for (const talk of attempt.talk ?? []) if (talk.shown === "Good start.") talk.review = status;
  expect(codes(t)).toContain("trace_invalid");
});
it("keeps the legacy free-talk-off guard", () => {
  const t = structuredClone(trace);
  t.model.promptVersion = "maya-legacy";
  const first = t.turns.find(t => t.kind === "maya");
  if (first?.kind !== "maya") throw new Error("missing opening");
  first.attempts[0].source = "model";
  expect(codes(t)).toContain("free_talk_unchecked");
});
it("keeps the legacy math-claim guard with free talk on", () => {
  const t = structuredClone(trace);
  t.model.promptVersion = "maya-legacy"; t.freeTalk = true;
  const first = t.turns.find(t => t.kind === "maya");
  if (first?.kind !== "maya") throw new Error("missing opening");
  first.attempts[0].source = "model";
  expect(codes(t, { ...b, steps: [{ child: "Can we start?", mathClaim: true }] })).toContain("free_talk_unchecked");
});
