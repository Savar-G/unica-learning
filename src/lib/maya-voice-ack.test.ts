import { describe, expect, it } from "vitest";
import { ACK_LIMIT_MS, ACK_NOT_STREAMED_MS, ACK_PHRASES, acknowledgementProblem, nextAcknowledgement } from "./maya-voice-ack";

// A word list of its own, so a change to the rule cannot quietly pass the bank.
const FORBIDDEN = /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|half|ones|tens|hundreds|place|column|digit|number|add|plus|sum|minus|subtract|take|times|multiply|divide|equal|carry|borrow|regroup|write|look|check|try|answer|right|wrong|correct)\b/i;

describe("the acknowledgement bank (gate check, #532, D-195)", () => {
  it("holds no number, place word, operation word or instruction, and no line twice", () => {
    expect(ACK_PHRASES).toHaveLength(8);
    for (const { id, text } of ACK_PHRASES) {
      expect(acknowledgementProblem(text), id).toBeNull();
      expect(text, id).not.toMatch(FORBIDDEN);
      expect(text.split(/\s+/).length, id).toBeLessThanOrEqual(5);
    }
    expect(new Set(ACK_PHRASES.map((p) => p.id)).size).toBe(ACK_PHRASES.length);
    expect(new Set(ACK_PHRASES.map((p) => p.text.toLowerCase())).size).toBe(ACK_PHRASES.length);
  });

  it.each([
    "Mm-hm, let me look.", // the issue's example: "look" is a work word, and "Mm-hm" can sound like yes
    "Mm-hm, let me think.",
    "I'm thinking.", // it claims a state of mind for an AI
    "Hmm, I'm thinking.",
    "Okay, let me think.",
    "Let me think, you got it.",
    "Let me add them.",
    "Let me see 7 and 9.",
    "Let me see the ones.",
    "Two moments.",
    "Just a second.",
    "Look at the ones.",
    "Try again.",
    "Write it down.",
    "Let me think. Add them.",
    "Keep going.",
    "Good job.",
  ])("refuses %s", (line) => {
    expect(acknowledgementProblem(line)).not.toBeNull();
  });
});

describe("when the acknowledgement comes", () => {
  it("waits 2600 ms for a turn that can stream, after the first streamed sentence of real calls (1.6 to 2.2 s)", () => {
    expect(ACK_LIMIT_MS).toBe(2600);
  });

  it("comes at once for a turn that cannot stream", () => {
    expect(ACK_NOT_STREAMED_MS).toBe(0);
  });
});

describe("the next acknowledgement of a call", () => {
  it("never repeats within a call, and gives nothing once the bank is used", () => {
    const used: string[] = [];
    for (let i = 0; i < ACK_PHRASES.length; i++) {
      const next = nextAcknowledgement("call-a", used)!;
      expect(used).not.toContain(next.id);
      used.push(next.id);
    }
    expect(new Set(used).size).toBe(ACK_PHRASES.length);
    expect(nextAcknowledgement("call-a", used)).toBeNull();
  });

  it("depends only on the call and what it used, and calls start at different phrases", () => {
    expect(nextAcknowledgement("call-a", [])).toEqual(nextAcknowledgement("call-a", []));
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => nextAcknowledgement(`call-${i}`, [])!.id));
    expect(firsts.size).toBeGreaterThan(1);
  });
});
