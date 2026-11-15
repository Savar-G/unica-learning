import { describe, expect, it } from "vitest";
import { checkTutorSay, tutorStreamContext, unreadMath } from "@/lib/maya/tutor";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import type { OperationPackage } from "@/lib/question-package";

// Pre-launch check 2 of the tutor core (part 2, true math), the core findings. Each sentence reached the child with no
// math review on main d6e32a97e. A fake model, a math review that answers "false", and a passed-in clock.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const ADD = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
/** The check context as the stream builds it for a turn with no child number. */
const ctxOf = (pkg: OperationPackage) => tutorStreamContext(pkg, "", "none", new Set());

async function say(pkg: unknown, line: string, opts: { stream?: boolean; childName?: string } = {}) {
  let now = Date.UTC(2026, 10, 15, 16);
  const parts: string[] = [];
  const math = fakeMathReviewer(() => ({ verdict: "false", reason: "false math" }));
  const model = conversationalFake({ answer: () => reply(line, "guide"), ...(opts.stream ? { stream: { chunk: 7 } } : {}) });
  const session = createTextSession({
    callId: "prelaunch2", package: pkg, model, clock: () => (now += 100), random: 3, tutor: true, reviewTimeLimitMs: 15,
    reviewer: fakeTalkReviewer(), mathReviewer: math, ...(opts.childName ? { childName: opts.childName } : {}),
    ...(opts.stream ? { onSayPart: (x: string) => parts.push(x) } : {}),
  });
  await session.start();
  parts.length = 0;
  const out = await session.child("Help me please.");
  return { said: out.say.join(" "), parts: parts.join(" "), math };
}

describe("F1: a column sum said in a place is read only for the question's own column", () => {
  it("sends \"1 plus 2 plus 3 is 6 hundreds\" in 52 − 28 to the math review, which refuses it", async () => {
    const line = "1 plus 2 plus 3 is 6 hundreds.";
    expect(checkTutorSay(line, ctxOf(SUB))).toMatchObject({ ok: true, math: [line] });
    const r = await say(SUB, line);
    expect(r.said).not.toContain("hundreds");
    expect(r.math.requests.length).toBeGreaterThan(0);
  });
  it("sends the right sum in the wrong place to the review too", () => {
    // 27 + 39: the tens are 1 + 2 + 3 = 6 tens, never 6 hundreds.
    expect(unreadMath("1 plus 2 plus 3 is 6 hundreds.", ctxOf(ADD))).not.toEqual([]);
  });
  it("control: reads the question's own column sum whole, with no review", () => {
    expect(checkTutorSay("1 plus 2 plus 3 is 6 tens.", ctxOf(ADD))).toMatchObject({ ok: true, math: [] });
    expect(checkTutorSay("3 plus 2 plus 1 is 6 tens.", ctxOf(ADD))).toMatchObject({ ok: true, math: [] });
  });
});

describe("F2: a word after a read claim in its clause sends the sentence to the math review", () => {
  it.each(["12 minus 8 is 4 with a negative sign.", "12 minus 8 is 4 in the hundreds place."])("%s", async (line) => {
    expect(unreadMath(line, ctxOf(SUB))).not.toEqual([]);
    const r = await say(SUB, line, { stream: true });
    expect(r.said).not.toContain("12 minus 8 is 4");
    expect(r.parts).not.toContain("12 minus 8 is 4");
    expect(r.math.requests.length).toBeGreaterThan(0);
  });
  it("control: a claim with only link words or a new clause after it passes on code alone", () => {
    for (const line of ["12 minus 8 is 4.", "So 12 minus 8 is 4 too.", "52 is 4 tens and 12 ones.", "12 minus 8 is 4, and 4 tens minus 2 tens is 2 tens."]) {
      expect(unreadMath(line, ctxOf(SUB)), line).toEqual([]);
    }
  });
});

describe("F8: the math review never gets the child's name, in the step facts too", () => {
  it("hides the name the story shares with the child", async () => {
    const r = await say(FIXTURES.CLAIM_DIV, "That 7 needs another look.", { childName: "Mia" });
    const input = r.math.requests[0];
    expect(input.question).not.toContain("Mia");
    expect(JSON.stringify(input.steps)).not.toContain("Mia");
    expect(JSON.stringify(input.steps)).toContain("{name}");
    expect(JSON.stringify(input.easierExample)).not.toContain("Mia");
  });
  it("control: another child's name leaves the story's person as printed", async () => {
    const r = await say(FIXTURES.CLAIM_DIV, "That 7 needs another look.", { childName: "Zed" });
    expect(JSON.stringify(r.math.requests[0].steps)).toContain("Mia");
  });
});
