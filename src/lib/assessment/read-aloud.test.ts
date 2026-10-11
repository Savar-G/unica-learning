import { describe, expect, it } from "vitest";
import { GRADE_1_2_BANK, SAMPLE_BANK, fillTemplate, namesChoice, readAloudText, sayChoice, toPublicQuestion, type Template } from "@/lib/assessment";

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

  it("resumes an old question without reading its saved choice list twice", () => {
    expect(readAloudText({ readAloud: "Who has more crayons? Choose one. Mia. Leah. They have the same number." }, ["Leah", "They have the same number", "Mia"]))
      .toBe("Who has more crayons? Choose one. Leah. They have the same number. Mia.");
  });

  it("removes a legacy colon list and its same-amount alternative", () => {
    expect(readAloudText({ readAloud: "Which is more: 4 plus 3, or 5 plus 6? Or are they the same?" }, ["5 + 6", "They are the same", "4 + 3"]))
      .toBe("Which is more? Choose one. 5 plus 6. They are the same. 4 plus 3.");
  });

  it("removes a list before the asking sentence but keeps the question's facts", () => {
    expect(readAloudText({ readAloud: "Mia has 4 crayons. Leah has 8 crayons. Mia, Leah, or They have the same number. Who has more?" }, ["Leah", "Mia", "They have the same number"]))
      .toBe("Mia has 4 crayons. Leah has 8 crayons. Who has more? Choose one. Leah. Mia. They have the same number.");
  });

  it("keeps a numeric pattern even when its numbers are answer choices", () => {
    expect(readAloudText({ readAloud: "Look at the pattern: 2, 4, 6. What comes next?" }, ["2", "4", "6"]))
      .toBe("Look at the pattern: 2, 4, 6. What comes next? Choose one. 2. 4. 6.");
    expect(readAloudText({ readAloud: "2, 4, 6. What comes next?" }, ["2", "4", "6"]))
      .toBe("2, 4, 6. What comes next? Choose one. 2. 4. 6.");
  });

  it("keeps the measurement story and reads the old inline alternatives once", () => {
    expect(readAloudText({ readAloud: "Leah measures a table and gets 8 hand spans. Mia measures it with bigger hand spans. Will Mia get more than 8, fewer than 8, or exactly 8?" }, ["Fewer than 8", "Exactly 8", "More than 8"]))
      .toBe("Leah measures a table and gets 8 hand spans. Mia measures it with bigger hand spans. How many will Mia get? Choose one. Fewer than 8. Exactly 8. More than 8.");
  });

  it("reads the saved likelihood alternatives once, keeping the event being tested", () => {
    expect(readAloudText({ readAloud: "A bag has red and blue cubes. Is it certain, possible but not certain, or impossible that it is red?" }, ["Impossible", "Certain", "Possible, but not certain"]))
      .toBe("A bag has red and blue cubes. How likely is it that it is red? Choose one. Impossible. Certain. Possible, but not certain.");
  });

  it("reads a saved coin-streak question's choices once", () => {
    expect(readAloudText({ readAloud: "A coin landed on heads 3 times in a row. On the next toss, is heads more likely, is tails more likely, or are they equally likely?" }, ["Tails", "Heads and tails are equally likely", "Heads"]))
      .toBe("A coin landed on heads 3 times in a row. On the next toss, which is more likely? Choose one. Tails. Heads and tails are equally likely. Heads.");
  });

  it.each([
    ["Which side goes down: the yellow side or the blue side, or neither side?", ["The blue side", "The yellow side", "Neither side, it balances"], "Which side goes down? Choose one. The blue side. The yellow side. Neither side, it balances."],
    ["Which snake is the longest: the green one, the red one or the blue one?", ["The blue snake", "The green snake", "The red snake"], "Which snake is the longest? Choose one. The blue snake. The green snake. The red snake."],
    ["Which card is bigger: the red card, the blue card, or are they the same size?", ["They are the same size", "The red card", "The blue card"], "Which card is bigger? Choose one. They are the same size. The red card. The blue card."],
    ["Which one can roll and can also be stacked into a tower: a building block, a ball or a jar?", ["A jar (a cylinder)", "A building block (a cube)", "A ball (a sphere)"], "Which one can roll and can also be stacked into a tower? Choose one. A jar (a cylinder). A building block (a cube). A ball (a sphere)."],
    ["Which colour are you more likely to pick: both equally likely, red or green?", ["Both are equally likely", "Red", "Green"], "Which colour are you more likely to pick? Choose one. Both are equally likely. Red. Green."],
  ])("reads legacy choice aliases once: %s", (readAloud, choices, expected) => {
    expect(readAloudText({ readAloud }, choices as string[])).toBe(expected);
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
  // The question's facts may name a choice ("Leah has 4 crayons. Mia has 8 crayons."). Inspect every sentence,
  // including lists before the final question. A standalone choice is also a list entry.
  // Two exceptions: a number of the question itself ("6 plus 3 is the same as what number plus 3?" offers 6, and the
  // printed prompt shows it too), and "4 square corners" in 2-square-or-rectangle, which is the question, not a list.
  const ASKS_WITH_A_CHOICE_WORD = new Set(["2-square-or-rectangle"]);
  const listsChoices = (q: { prompt: string; readAloud: string; choices?: string[]; say?: Record<string, string> }) => {
    if (/Choose one[.!?]/i.test(q.readAloud)) return true;
    const choices = q.choices ?? [];
    return q.readAloud.trim().split(/(?<=[.?!])\s+/).some((sentence) => {
      const ownNumber = (c: string) => /^\d+$/.test(c) && namesChoice(q.prompt, c);
      const named = choices.filter((c) => namesChoice(sentence, c, q.say) && !ownNumber(c));
      if (sentence.endsWith("?") && named.length > 0) return true;
      const first = sentence.split(/,|\bor\b/i)[0].trim().toLowerCase().replace(/^(a|the) /, "");
      if (named.length >= 2 && choices.some((c) => first === sayChoice(c, q.say).toLowerCase().replace(/^(a|the) /, ""))) return true;
      return choices.some((c) => sentence.toLowerCase().replace(/^or /, "").replace(/[.?!]$/, "") === c.toLowerCase());
    });
  };
  it("the guard rejects lists in any sentence, including before the last sentence", () => {
    const choices = ["Mia", "Leah", "They have the same number"];
    for (const readAloud of ["Who has more? Choose one. Mia. Leah. They have the same number.", "Mia, Leah, or They have the same number. Who has more?", "Mia. Leah. They have the same number. Who has more?"]) {
      expect(listsChoices({ prompt: "Who has more?", readAloud, choices }), readAloud).toBe(true);
    }
    expect(listsChoices({ prompt: "Who has more?", readAloud: "Mia has 4 crayons. Leah has 8 crayons. Who has more?", choices })).toBe(false);
  });
  it("never lists the choices in a template's own text", () => {
    for (const template of choiceTemplates(BANK).filter((t) => !NAMES_ON_PURPOSE.has(t.id) && !ASKS_WITH_A_CHOICE_WORD.has(t.id))) {
      for (const seed of SEEDS) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        expect(listsChoices(q), `${template.id} seed ${seed}: "${q.readAloud}"`).toBe(false);
      }
    }
  });
});
