import { describe, expect, it } from "vitest";
import { createSession, fallbacks, step, TEMPLATES, type Session, type StepResult } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

// Final #698 review (D-310): with first-ship cheer off, the solved close is calm (close.checked), never close.solved.
const say = (r: StepResult) => r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");
const CHEERFUL_CLOSES = TEMPLATES["close.solved"].map((t) => t.replace("{expr}", "27 + 39"));

describe("first-ship solved close is calm", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i: a child-solved close never says a close.solved wording", (random) => {
    let s: Session = step(createSession({ callId: "fixed-close", package: FIXTURES.A, grade: 2, random }), { type: "start", at: 1000 }).session;
    const fb = () => {
      for (const p of fallbacks(s)) {
        const r = step(s, { type: "proposal", at: s.now!, proposal: p, fallback: true });
        if (!r.refusal) { s = r.session; return r; }
      }
      throw Error("no fallback");
    };
    const child = (text: string) => { s = step(s, { type: "child_turn", at: s.now! + 4000, text }).session; };
    fb(); child("Seven plus nine is sixteen."); fb(); child("Two plus three plus one is six."); fb(); child("66."); fb(); child("I'm done.");
    const close = say(fb());
    for (const cheer of CHEERFUL_CLOSES) expect(close).not.toContain(cheer);
    expect(close).not.toMatch(/Great job|Well done|Nice work|You did it/i);
  });
});
