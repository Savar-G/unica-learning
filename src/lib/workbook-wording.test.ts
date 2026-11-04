import { describe, expect, it } from "vitest";
import { FRAMES, fillFrame, GIRLS, BOYS, storyProblem, quantityStoryProblem, singularPlaces, takeAwayProblem, THINGS } from "@/lib/workbook-wording";

// Plain story language (D-201): code's own story wordings keep every rule, and storyProblem refuses a story that breaks
// one it can check exactly.

const fill = (f: string, name = "Gus", thing = "plums", n = { a: 2, b: 5, t: 7 }) => fillFrame(f, n, name, thing);
const stories = FRAMES.filter((f) => f.f.includes("{name}"));

describe("code's story wordings", () => {
  it("give every story a person, real things and a question that names the thing again, with no banned words", () => {
    expect(stories.length).toBeGreaterThan(30);
    for (const f of stories) {
      for (const [name, thing] of [["Gus", "plums"], ["Mia", "shells"], ["Ben", "leaves"]]) {
        const text = fill(f.f, name, thing);
        expect(storyProblem(text, { thing: f.f.includes("{thing}") ? thing : null }), text).toBeNull();
      }
    }
  });

  it("put one action in each sentence: no sentence of a story joins two actions with ', then' or 'and gets'", () => {
    for (const f of stories) expect(f.f, f.f).not.toMatch(/, then|and gets|and gives|and lost/);
  });

  it("say Savar's example word for word, with the person's pronoun", () => {
    expect(fill("{name} has {a} {thing}. {He} finds {b} more. How many {thing} does {name} have now?")).toBe("Gus has 2 plums. He finds 5 more. How many plums does Gus have now?");
    expect(fill("{name} has {a} {thing}. {He} finds {b} more. How many {thing} does {he} have now?", "Mia", "shells")).toBe("Mia has 2 shells. She finds 5 more. How many shells does she have now?");
    expect(fill("{name} sees {t} frogs on a log. {b} hop away. How many frogs are on the log now?", "Ivy", "x", { a: 8, b: 1, t: 9 })).toBe("Ivy sees 9 frogs on a log. 1 hops away. How many frogs are on the log now?");
  });

  it("count only things a child holds, and never let dots hop: animals have wordings of their own", () => {
    expect(THINGS).not.toContain("bugs");
    expect(THINGS).not.toContain("ducks");
    for (const f of FRAMES) expect(f.f, f.f).not.toMatch(/dots?[^.]*\. [^.]*(hop|roll|fly|swim)/);
    expect(GIRLS.length).toBe(BOYS.length);
  });
});

describe("storyProblem", () => {
  it("refuses 'in all', 'altogether', 'total' and 'left over'", () => {
    for (const w of ["in all", "altogether", "total", "left over"]) {
      expect(storyProblem(`Gus has 2 plums and 5 more. How many plums ${w}?`)).toMatch(new RegExp(`never says "${w}"`));
    }
  });

  it("refuses a story with no person: bare counts such as '9 dots. 7 hop off.'", () => {
    expect(storyProblem("9 dots. 7 hop off. How many are left?")).toMatch(/a person with a first name/);
    expect(storyProblem("2 plums in a box. How many more make 10?")).toMatch(/a person/);
  });

  it("refuses a code-planned story whose question does not name its thing again", () => {
    expect(storyProblem("Gus has 2 plums. He finds 5 more. How many does he have now?", { thing: "plums" })).toMatch(/names the counted thing again/);
    expect(storyProblem("Gus has 2 plums. He finds 5 more. How many plums does he have now?", { thing: "plums" })).toBeNull();
    expect(storyProblem("Gus has 1 leaf. He finds 5 more. How many leaves does he have now?", { thing: "leaves" })).toBeNull();
  });
});


describe("quantity questions on practice and review cards", () => {
  it("gives every picture frame a person and repeats its counted thing", () => {
    for (const f of FRAMES.filter((x) => x.kind === "picture")) {
      expect(f.f).toContain("{name}");
      const text = fill(f.f);
      expect(quantityStoryProblem(text, { thing: "plums" }), text).toBeNull();
    }
  });

  it("checks the picture noun even when the slot planned a different thing", () => {
    expect(quantityStoryProblem("Mia draws 3 dots. How many now?", { thing: "shells" })).toMatch(/names the counted thing again/);
    expect(quantityStoryProblem("Count the dots. How many?")).toMatch(/a person/);
    expect(quantityStoryProblem("Mia draws dots. How many?")).toMatch(/names the counted thing again/);
    expect(quantityStoryProblem("10 counters. Take away 2. How many counters now?")).toMatch(/a person/);
    expect(quantityStoryProblem("Mia has 10 counters. She takes away 2. How many counters does Mia have now?")).toBeNull();
    for (const phrase of ["in all", "altogether", "total", "left over"]) {
      expect(quantityStoryProblem(`Mia has 3 dots. How many dots ${phrase}?`)).toMatch(/never says/);
    }
  });

  it("keeps number sentences and curriculum math questions", () => {
    for (const text of ["5 + 4 = ?", "? = 1 + 3", "What is 3 × 4?", "How many hops from 3 to 8?", "How many tens and ones?", "What is the square root of 16?", "What is the perimeter of a square?", "How many square centimetres are in 2 square metres?"]) {
      expect(quantityStoryProblem(text), text).toBeNull();
    }
  });
});

describe("place words and take-away stories (U16 r13, Codex at 24751f16)", () => {
  it("prints a place unit after 1 in the singular", () => {
    expect(singularPlaces("Write 4 thousands, 0 hundreds, 1 tens and 6 ones as a number.")).toBe("Write 4 thousands, 0 hundreds, 1 ten and 6 ones as a number.");
    expect(singularPlaces("6 hundreds, 0 tens and 1 ones; 1 hundreds, 1 thousands, 1 ten thousands, 21 tens, 0.1 tens")).toBe("6 hundreds, 0 tens and 1 one; 1 hundred, 1 thousand, 1 ten thousand, 21 tens, 0.1 tens");
  });
  it("needs a verb that takes the things away, or a question about the rest", () => {
    expect(takeAwayProblem("Max has 1010 buttons, puts 17 in a jar. How many buttons does he have now?", 993)).not.toBeNull();
    expect(takeAwayProblem("Max has 1010 buttons and hides 17. How many buttons are left?", 993)).not.toBeNull();
    for (const [text, answer] of [
      ["Omar has 10000 points and gives 6338 away. How many points are left?", 3662],
      ["Ethan has 5 apples. 4 are in a bin. How many are not?", 1],
      ["Max has 10 buttons and puts 3 in a jar. How many are not in the jar?", 7],
      ["Kai has 6 stamps and wants 10. How many more?", 4],
      ["Noah has 3414 tickets. He gets 2965 more. How many tickets does Noah have now?", 6379],
      ["A shop has 6 boxes with 200 bolts in each. It sells 600 bolts. How many bolts are left?", 600],
    ] as const) expect(takeAwayProblem(text, answer), text).toBeNull();
  });
});
