import { expect, it } from "vitest";
import { likelihoodChoicesProblem, likelihoodWord } from "./workbook-likelihood";
import { curriculumFor } from "./workbook-curriculum";
import { stepOf, templateProblem } from "./workbook-step-items";

it("allows never, sometimes and always and comparisons, and refuses every other likelihood word", () => {
  expect(likelihoodWord("Will a stone grow legs? Circle never, sometimes or always.")).toBeNull();
  expect(likelihoodWord("A spinner has 3 red and 1 blue parts. Which colour is more likely?")).toBeNull();
  expect(likelihoodWord("Which colour is least likely?")).toBeNull();
  for (const [text, word] of [["Which is right? You eat breakfast. A) likely  B) unlikely", "likely"], ["Is that uncertain?", "uncertain"], ["It is certain.", "certain"], ["Picking a toy car is impossible.", "impossible"], ["Ava says it is likely.", "likely"]] as const)
    expect(likelihoodWord(text)).toBe(word);
  expect(likelihoodChoicesProblem(["never", "sometimes", "always"])).toBeNull();
  expect(likelihoodChoicesProblem(["true", "false"])).toBeNull();
  expect(likelihoodChoicesProblem(["more likely", "less likely", "equally likely"])).toMatch(/never, sometimes or always/);
});

it("prints no likelihood template that rates with another word, at any level", () => {
  const c = curriculumFor("bc")!;
  for (const [skill, step] of [["K10-likelihood-words", 1], ["K10-likelihood-words", 2], ["2.11-compare-likelihood", 1], ["3.13-simulated-likelihood", 4]] as const)
    for (const t of stepOf(c, skill, step)?.templates ?? []) for (const level of [4, 10, 16])
      if (likelihoodWord(t.text.replace(/\{[^}]*\}/g, "#")) || /\blikely\b|\bcertain\b|\bpossible\b/i.test(t.answer)) expect(templateProblem(t, level), t.text).not.toBeNull();
  // The allow-listed step still prints.
  expect((stepOf(c, "1.10-likelihood-words", 1)?.templates ?? []).some(t => !templateProblem(t, 4))).toBe(true);
});
