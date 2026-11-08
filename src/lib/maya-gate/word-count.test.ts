import { describe, expect, it } from "vitest";
import { allLineTexts, PHRASES, speechWords } from "@/lib/maya";
import type { OperationPackage } from "@/lib/question-package";
import { FIXTURES } from "./fixtures";
import { gateWordCount } from "./word-count";

describe("the independent gate word counter", () => {
  it.each([
    ["7 and 9", 3], ["1,234,567", 11], ["28cm²", 4], ["one hundred and five", 4], ["1 3/8", 4], ["one and three eighths", 4],
    ["You're at 127 + 28 cm².", 12], ["7 + 9 = 16", 5], ["0.85", 4], [".85", 4], ["-28", 3],
    ["1001", 3], ["1234567890", 15], ["15 ÷ 6 = 2 R 3", 8],
  ])("%s has %s spoken words", (text, words) => expect(gateWordCount(text)).toBe(words));

  it("checks every code line and bank wording in the gate fixtures against both counters", () => {
    const texts = Object.values(FIXTURES).flatMap((pkg) => pkg.operation && pkg.easierExample ? allLineTexts(pkg as OperationPackage) : []);
    texts.push(...Object.values(PHRASES).flat());
    expect(texts.length).toBeGreaterThan(1000);
    for (const text of texts) expect(gateWordCount(text), text).toBe(speechWords(text));
  });
});
