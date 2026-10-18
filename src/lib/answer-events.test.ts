import { describe, expect, it } from "vitest";
import { answerRecorder } from "@/lib/answer-events";

// What the browser records on one visit of a question (#184). #249: on a question the child went back to, the answer
// already on the screen is not a change; only the changes the child makes in the visit are.
describe("the answer recorder on a revisit (#249)", () => {
  it("does not count the answer on the screen as a change; the child's changes count", () => {
    const recorder = answerRecorder("12");
    recorder.change("12", 0);
    recorder.change("1", 900);
    recorder.change("13", 1_400);
    expect(recorder.events(2_000).changes).toEqual([{ value: "1", atMs: 900 }, { value: "13", atMs: 1_400 }]);
  });

  it("a look with no change records no change, and still counts read-aloud and time away", () => {
    const recorder = answerRecorder("Rolling an odd number");
    recorder.change("Rolling an odd number", 0);
    recorder.readAloud(300);
    recorder.hidden(1_000);
    recorder.visible(1_500);
    expect(recorder.events(2_000)).toEqual({ changes: [], readAloud: { count: 1, atMs: [300] }, away: { count: 1, ms: 500 } });
  });

  it("on a new question every first answer is a change, as before", () => {
    const recorder = answerRecorder();
    recorder.change("7", 2_000);
    recorder.change("7", 2_100);
    expect(recorder.events(3_000).changes).toEqual([{ value: "7", atMs: 2_000 }]);
  });
});
