import { describe, expect, it } from "vitest";
import { createSession, lineOffers, step, type LineId, type Session, type Slots } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

// An evaluate part's addition keeps the carry guard of a plain addition (review of #760): after the child says they
// did not carry, Maya explains the carry again before any hint that takes the carried 1 for granted.
const T0 = Date.UTC(2026, 10, 12, 10, 0, 0);
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });

describe("an evaluate part's carry", () => {
  it("is explained again after the child denies it, as in a plain addition", () => {
    let s: Session = createSession({ callId: "ev-carry", package: FIXTURES.EV_ADD_FIRST });
    let at = T0;
    const send = (e: Parameters<typeof step>[1]) => { const r = step(s, e); s = r.session; return r; };
    const child = (text: string) => { at += 4000; return send({ type: "child_turn", at, text }); };
    const propose = (p: object) => send({ type: "proposal", at, proposal: { version: 2, ...p } as never });
    const regroupOffered = () => (lineOffers(s).guide ?? []).some((o) => o.line === "step.regroup" && o.slots.step === "e1.tens");

    send({ type: "start", at });
    const open = propose({ act: "open", parts: [ln("open.hello"), ln("question.problem")] });
    expect(open.refusal, JSON.stringify(open.refusal)).toBeNull();
    child("7 plus 8 is 15.");
    const first = propose({ act: "guide", step: "e1.tens", level: 1, parts: [ln("check.right_step", { step: "e1.ones" }), ln("step.regroup", { step: "e1.tens" })], reading: { answers: [{ value: { type: "number", value: 15 }, step: "e1.ones", verdict: "right" }] } });
    expect(first.refusal, JSON.stringify(first.refusal)).toBeNull();
    child("Um.");
    expect(regroupOffered()).toBe(false);
    child("I didn't carry anything.");
    expect(regroupOffered()).toBe(true);
    expect(propose({ act: "guide", step: "e1.tens", level: 1, parts: [ln("step.point", { step: "e1.tens" })] }).refusal?.code).toBe("line_not_offered");
  });
});
