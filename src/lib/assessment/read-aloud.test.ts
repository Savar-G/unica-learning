import { describe, expect, it } from "vitest";
import { SAMPLE_BANK, fillTemplate, namesChoice, readAloudText, toPublicQuestion } from "@/lib/assessment";

describe("read it to me (#79)", () => {
  it("reads the question, then the choices in the order the buttons show them", () => {
    const question = { readAloud: "Which of these numbers is prime?", choices: ["27", "17", "33", "39"] };
    expect(readAloudText(question, ["33", "17", "39", "27"])).toBe("Which of these numbers is prime? Is it 33, 17, 39, or 27?");
  });

  it("reads a fraction choice as words", () => {
    const question = { readAloud: "Which fraction is equal to 3 out of 4?" };
    expect(readAloudText(question, ["6/8", "3/8"])).toBe("Which fraction is equal to 3 out of 4? Is it 6 out of 8, or 3 out of 8?");
  });

  it("reads a question stored before #79, whose own text already names every choice, only once", () => {
    const old = "A bag has 5 blue marbles and 1 red marble. You pick one without looking. Is picking the red marble unlikely, impossible, or certain?";
    expect(readAloudText({ readAloud: old }, ["Certain", "Unlikely", "Impossible"])).toBe(old);
    const fractions = "Which fraction is larger: 1 out of 3, or 1 out of 5?";
    expect(readAloudText({ readAloud: fractions }, ["1/5", "1/3"])).toBe(fractions);
  });

  it("has no symbols the voice reads badly, for any choice question in the bank", () => {
    for (const template of SAMPLE_BANK.filter((t) => t.format === "choice")) {
      for (const seed of [1, 2, 3, 40, 500]) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        expect(readAloudText(q, q.choices), `${template.id} seed ${seed}`).not.toMatch(/[/:×÷=]/);
      }
    }
  });

  it("a template's own read-aloud text names none of its choices: they are shuffled, so the screen reads them", () => {
    const seeds = Array.from({ length: 200 }, (_, i) => i * 7919 + 1);
    for (const template of SAMPLE_BANK.filter((t) => t.format === "choice")) {
      for (const seed of seeds) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        // A wrong answer can be a number of the question itself ("6 + 3 = ? + 3" offers 6): the prompt shows it too, so
        // the text says it as part of the question, not as a list of choices.
        const ownNumber = (c: string) => /^\d+$/.test(c) && namesChoice(q.prompt, c);
        const named = (q.choices ?? []).filter((c) => namesChoice(q.readAloud, c, q.say) && !ownNumber(c));
        expect(named, `${template.id} seed ${seed}: "${q.readAloud}"`).toEqual([]);
      }
    }
  });
});
