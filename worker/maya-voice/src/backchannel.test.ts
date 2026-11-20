import { describe, expect, it } from "vitest";
import { isBackchannel } from "./backchannel";

describe("isBackchannel", () => {
  it("accepts one backchannel word, in any case, with punctuation", () => {
    for (const text of ["mm", "Mm.", "MM.", "mmm", "Mm-hmm.", "mm-hm", "Mhm", "mm hmm", "Uh-huh.", "uh huh", "Okay.", "OK", "okay!", "Yeah.", " yeah "]) {
      expect(isBackchannel(text), text).toBe(true);
    }
  });

  it("refuses a request, an answer, or a second word", () => {
    for (const text of ["wait", "Stop.", "no", "Yes.", "okay I get it", "Okay, okay.", "Mm-hmm, wait.", "yeah no", "hmm", "24", "", "Can you show me how to regroup?"]) {
      expect(isBackchannel(text), text).toBe(false);
    }
  });
});
