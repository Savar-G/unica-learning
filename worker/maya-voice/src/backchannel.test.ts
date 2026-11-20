import { describe, expect, it } from "vitest";
import { clearBackchannel, isBackchannel } from "./backchannel";

describe("isBackchannel", () => {
  it("accepts one backchannel word, in any case, with punctuation", () => {
    for (const text of ["mm", "Mm.", "MM.", "mmm", "Mm-hmm.", "mm-hm", "Mhm", "mm hmm", "Uh-huh.", "uh huh", "Okay.", "OK", "okay!", "Yeah.", " yeah "]) {
      expect(isBackchannel(text), text).toBe(true);
    }
  });

  it("refuses a request, an answer, a number, or a second word", () => {
    for (const text of ["wait", "Stop.", "no", "Yes.", "okay I get it", "Okay, okay.", "Mm-hmm, wait.", "yeah no", "hmm", "24", "Okay, 4.", "okay 4", "4 okay", "", "Can you show me how to regroup?"]) {
      expect(isBackchannel(text), text).toBe(false);
    }
  });
});

describe("clearBackchannel", () => {
  it("is a sure, lone backchannel whose other readings are backchannels too", () => {
    expect(clearBackchannel([{ text: "Okay.", confidence: 0.95 }])).toBe(true);
    expect(clearBackchannel([{ text: "Mm-hmm.", confidence: 0.9 }, { text: "Mhm." }])).toBe(true);
    expect(clearBackchannel([{ text: "Okay." }])).toBe(true);
  });

  it("goes on to the hearing and safety checks when unsure, or when another reading has other words", () => {
    expect(clearBackchannel([{ text: "Okay.", confidence: 0.4 }, { text: "Okay, he hits me." }])).toBe(false);
    expect(clearBackchannel([{ text: "Okay.", confidence: 0.4 }])).toBe(false);
    expect(clearBackchannel([{ text: "Okay.", confidence: 0.95 }, { text: "Okay, 4." }])).toBe(false);
    expect(clearBackchannel([])).toBe(false);
  });
});
