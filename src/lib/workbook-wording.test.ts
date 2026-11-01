import { describe, expect, it } from "vitest";
import { FRAMES, fillFrame, GIRLS, BOYS, storyProblem, THINGS } from "@/lib/workbook-wording";

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
