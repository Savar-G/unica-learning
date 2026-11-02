import { describe, expect, it, vi } from "vitest";
import { allLineTexts, PHRASES, speechWords } from "@/lib/maya";
import type { OperationPackage } from "@/lib/question-package";
import { BEHAVIOURS } from "./behaviours";
import { runGateBehaviour, judgeSaved } from "./call";
import { memoryTraceStore, type Behaviour } from "./gate";
import { FIXTURES } from "./fixtures";
import { gateWordCount } from "./word-count";

vi.mock("server-only", () => ({}));

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

  it.each([1, 4])("all emitted turns and fallbacks obey the grade %s limit", async (grade) => {
    let outputs = 0;
    let fallbacks = 0;
    for (const original of BEHAVIOURS) {
      // Keep each scenario and its safety checks. Original exact flow counts apply to its own grade and seed only.
      const b: Behaviour = { ...original, grade, expect: { outcome: {}, flag: original.expect.flag, safety: original.expect.safety } };
      for (const seed of [1, 9, 31]) {
        const store = memoryTraceStore();
        expect((await runGateBehaviour(b, store, { seed })).error, `${b.id}, seed ${seed}`).toBeNull();
        const v = judgeSaved(b, store);
        expect(v.failures.filter((f) => f.detail === "Maya exceeded the spoken word limit"), `${b.id}, seed ${seed}`).toEqual([]);
        for (const t of v.trace!.turns) {
          if (t.kind !== "maya" || !t.output || t.output.act === "safety") continue;
          outputs++;
          const count = gateWordCount(t.output.say.join(" "));
          expect(count, `${b.id}, seed ${seed}: ${t.output.say.join(" ")}`).toBeLessThanOrEqual(grade <= 3 ? 25 : 45);
          if (t.attempts.at(-1)?.source === "fallback") fallbacks++;
        }
      }
    }
    expect(outputs).toBeGreaterThan(1000);
    expect(fallbacks).toBeGreaterThan(0);
  });
});
