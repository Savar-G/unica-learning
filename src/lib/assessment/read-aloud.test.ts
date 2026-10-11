import { describe, expect, it } from "vitest";
import { GRADE_1_2_BANK, SAMPLE_BANK, fillTemplate, namesChoice, readAloudText, toPublicQuestion, type Template } from "@/lib/assessment";

const say = (choices: string[]) => readAloudText({ readAloud: "Q?" }, choices).replace(/^Q\? Choose one\. /, "");

describe("read it to me (#79)", () => {
  it("reads the question, then the choices in the order the buttons show them, one per sentence", () => {
    const question = { readAloud: "Which of these numbers is prime?", choices: ["27", "17", "33", "39"] };
    expect(readAloudText(question, ["33", "17", "39", "27"])).toBe("Which of these numbers is prime? Choose one. 33. 17. 39. 27.");
  });

  it("reads a fraction choice as words", () => {
    expect(say(["6/8", "3/8", "5 2/3"])).toBe("6 out of 8. 3 out of 8. 5 and 2 out of 3.");
  });

  it("reads shape glyphs as their names, and a glyph with its name only once", () => {
    expect(say(["● circle", "▲", "■ ● ■ ●", "▮"])).toBe("circle. triangle. square, circle, square, circle. rectangle.");
  });

  it("reads sums and pattern letters as words", () => {
    expect(say(["7 + 8", "9 + 6 = 10 + 5", "12 − 4", "A B B"])).toBe("7 plus 8. 9 plus 6 is the same as 10 plus 5. 12 minus 4. letter A, letter B, letter B.");
  });

  it("reads a drawn line by its place, so the voice does not give the lengths away", () => {
    expect(say(["▬▬▬▬▬▬▬▬▬▬", "They are the same length", "▬▬▬▬▬▬▬▬"])).toBe("the first line. They are the same length. the second line.");
  });

  it("does not end a sentence twice", () => {
    expect(say(["8:30 p.m.", "Yes!"])).toBe("8:30 p.m. Yes!");
  });
});

const BANK = [...SAMPLE_BANK, ...GRADE_1_2_BANK];
const SEEDS = Array.from({ length: 120 }, (_, i) => i * 7919 + 1);
const choiceTemplates = (bank: readonly Template[]) => bank.filter((t) => t.format === "choice");

describe("the banks' read-aloud text (#79)", () => {
  it("has no symbols the voice reads badly, once the choices are added", () => {
    for (const template of choiceTemplates(BANK)) {
      for (const seed of SEEDS.slice(0, 20)) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        expect(readAloudText(q, q.choices), `${template.id} seed ${seed}`).not.toMatch(/[/×÷=+−●■▲★▬▮◆▼\u00a0]|:\S/);
      }
    }
  });

  // The core shuffles the choices, so a template must not list them: the screen reads them in the order of its rows.
  // These five name choices on purpose: the pattern itself, or the letters and shapes the question asks about (#74).
  const NAMES_ON_PURPOSE = new Set(["k-number-pattern", "k-shape-attribute", "1-number-pattern", "1-letters-to-shapes", "2-pattern-core"]);
  // The question's facts may name a choice ("Leah has 4 crayons. Mia has 8 crayons."), but the sentence that asks must
  // name none: an option list sits there ("Who has more: a, b or c?", or "Choose one. A. B. C." ending on a choice).
  // Two exceptions: a number of the question itself ("6 plus 3 is the same as what number plus 3?" offers 6, and the
  // printed prompt shows it too), and "4 square corners" in 2-square-or-rectangle, which is the question, not a list.
  const ASKS_WITH_A_CHOICE_WORD = new Set(["2-square-or-rectangle"]);
  const askingSentence = (text: string) => text.trim().split(/(?<=[.?!])\s+(?=[A-Z])/).at(-1) ?? "";
  it("never lists the choices in a template's own text", () => {
    for (const template of choiceTemplates(BANK).filter((t) => !NAMES_ON_PURPOSE.has(t.id) && !ASKS_WITH_A_CHOICE_WORD.has(t.id))) {
      for (const seed of SEEDS) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        const asks = askingSentence(q.readAloud);
        const ownNumber = (c: string) => /^\d+$/.test(c) && namesChoice(q.prompt, c);
        const named = (q.choices ?? []).filter((c) => namesChoice(asks, c, q.say) && !ownNumber(c));
        expect(named, `${template.id} seed ${seed}: "${asks}"`).toEqual([]);
      }
    }
  });
});
