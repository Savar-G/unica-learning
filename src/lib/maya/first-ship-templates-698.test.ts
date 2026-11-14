import { describe, expect, it } from "vitest";
import { createSession, fallbacks, step, TEMPLATES, type Session, type StepResult } from "@/lib/maya";
import { celebratoryTemplate, firstShipWordings } from "@/lib/maya/session";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

// Final #698 re-check (D-310): with first-ship cheer off, no fixed template wording that celebrates is said.
const say = (r: StepResult) => r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");
const num = (value: number) => ({ type: "number" as const, value });

describe("first-ship template wordings are calm", () => {
  it("every template keeps at least one calm wording, so no line loses all its wordings", () => {
    const empty = Object.entries(TEMPLATES).filter(([, ws]) => firstShipWordings(ws as readonly string[]).length === 0).map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("no celebratory wording is ever chosen while cheer is off", () => {
    for (const [key, ws] of Object.entries(TEMPLATES)) {
      for (const i of firstShipWordings(ws as readonly string[])) expect(celebratoryTemplate((ws as readonly string[])[i]), `${key}#${i}`).toBe(false);
    }
  });

  it("correctness feedback is not treated as celebration", () => {
    expect(celebratoryTemplate("That's right: 27 + 39 = 66.")).toBe(false);
    expect(celebratoryTemplate("Tell me how you did it.")).toBe(false);
    expect(celebratoryTemplate("Well done! 27 + 39 = 66.")).toBe(true);
    expect(celebratoryTemplate("You did it: 27 + 39 is done!")).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("seed %i: an accepted right answer never says a celebratory answer.right wording", (random) => {
    let s: Session = step(createSession({ callId: "template-recheck", package: FIXTURES.A, grade: 4, random }), { type: "start", at: 1000 }).session;
    for (const p of fallbacks(s)) { const r = step(s, { type: "proposal", at: 1000, proposal: p, fallback: true }); if (!r.refusal) { s = r.session; break; } }
    s = step(s, { type: "child_turn", at: 5000, text: "66." }).session;
    const r = step(s, { type: "proposal", at: 5000, proposal: { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } } });
    expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
    expect(say(r)).not.toMatch(/Well done|Nice!|Smart!|Great job/);
  });
});
