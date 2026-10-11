import { describe, expect, it } from "vitest";
import { SAMPLE_BANK, fillTemplate, readAloudText, sayChoice, toPublicQuestion } from "@/lib/assessment";

describe("read it to me (#79)", () => {
  it("reads the question, then the choices in the order the buttons show them", () => {
    const question = { readAloud: "Which of these numbers is prime?", choices: ["27", "17", "33", "39"] };
    expect(readAloudText(question, ["33", "17", "39", "27"])).toBe("Which of these numbers is prime? Is it 33, 17, 39, or 27?");
  });

  it("reads a fraction choice as words", () => {
    const question = { readAloud: "Which fraction is equal to 3 out of 4?" };
    expect(readAloudText(question, ["6/8", "3/8"])).toBe("Which fraction is equal to 3 out of 4? Is it 6 out of 8, or 3 out of 8?");
  });

  it("has no symbols the voice reads badly, for any choice question in the bank", () => {
    for (const template of SAMPLE_BANK.filter((t) => t.format === "choice")) {
      for (const seed of [1, 2, 3, 40, 500]) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        expect(readAloudText(q, q.choices), `${template.id} seed ${seed}`).not.toMatch(/[/:×÷=]/);
      }
    }
  });

  it("a template's own read-aloud text never lists its choices: they are shuffled, so the screen reads them", () => {
    for (const template of SAMPLE_BANK.filter((t) => t.format === "choice")) {
      for (const seed of [1, 2, 3, 40, 500]) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        const own = q.readAloud.toLowerCase();
        const named = (q.choices ?? []).filter((c) => own.includes(sayChoice(c, q.say).toLowerCase()));
        expect(named.length, `${template.id} seed ${seed}: "${q.readAloud}" names ${named}`).toBeLessThan(q.choices!.length);
      }
    }
  });
});
