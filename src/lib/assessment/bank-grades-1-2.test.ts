import { describe, expect, it } from "vitest";
import { allRight, allWrong, knowsUpTo, takeTest } from "./scripted-child";
import {
  BANKS,
  GRADE_1_2_BANK,
  MISCONCEPTIONS,
  REPORTED_STRAND,
  bandFor,
  createSession,
  fillTemplate,
  levelFor,
  toPublicQuestion,
  type Grade,
  type Province,
  type Question,
  type TaggedProvince,
} from "@/lib/assessment";

const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
// Symbols a browser voice reads badly, and the "?" that marks a blank in a prompt.
const NOT_SPOKEN = /[=+−×÷●■▲★◆▼▬$]|\s\?/;

describe("grade 1-2 tests from the default bank", () => {
  it.each([1, 2] as Grade[])("grade %i: routed lengths, 12 in stage 1 at the school grade, in every province", (grade) => {
    for (const province of PROVINCES) {
      const session = createSession({ grade, province }, 1);
      expect(session.stage1, province).toHaveLength(12);
      expect(session.stage1.every((q) => q.level === grade), province).toBe(true);
      for (const [route, level] of [["up", grade + 1], ["stay", grade], ["down", grade - 1]] as const) {
        expect(session.stage2[route], `${province} ${route}`).toHaveLength(route === "up" && (province === "BC" || province === "other") ? 18 : 12);
        expect(session.stage2[route].every((q, i) => q.level === (route === "up" && i >= 12 ? grade : level)), `${province} ${route}`).toBe(true);
      }
    }
  });
});

describe("a grade 1-2 test, every route, every province", () => {
  const band = bandFor(1);
  const sessions = (grade: Grade, province: Province, count: number) =>
    Array.from({ length: count }, (_, i) => createSession({ grade, province }, i * 7919 + 11));

  it.each([1, 2] as Grade[])("grade %i: each route offers at least 5 drawing questions, so the core can require 5", (grade) => {
    expect(band.whiteboardRequired).toBe(5);
    for (const province of PROVINCES) {
      for (const s of sessions(grade, province, 400)) {
        const drawing = (qs: Question[]) => qs.filter((q) => q.whiteboard).length;
        // The stage 1 picks are made before the route is known, so they must work with the poorest form.
        const poorestForm = Math.min(drawing(s.stage2.up), drawing(s.stage2.stay), drawing(s.stage2.down));
        expect(drawing(s.stage1) + poorestForm, `${province} seed ${s.seed}`).toBeGreaterThanOrEqual(band.whiteboardRequired);
      }
    }
  });

  it.each([1, 2] as Grade[])("grade %i: each route requires exactly 5 shown-work questions, all drawn from drawing-suited templates", (grade) => {
    for (const province of PROVINCES) {
      for (const s of sessions(grade, province, 200)) {
        for (const route of ["up", "stay", "down"] as const) {
          const required = [...s.stage1, ...s.stage2[route]].filter((q) => q.showWork);
          expect(required, `${province} seed ${s.seed} ${route}`).toHaveLength(band.whiteboardRequired);
          // The bank supplies enough suited questions, so the core never has to fall back to an unsuited one.
          expect(required.every((q) => q.whiteboard), `${province} seed ${s.seed} ${route}`).toBe(true);
        }
      }
    }
  });

  it("no question repeats within a test", () => {
    for (const grade of [1, 2] as Grade[]) {
      for (const s of sessions(grade, "BC", 60)) {
        for (const route of ["up", "stay", "down"] as const) {
          const asked = [...s.stage1, ...s.stage2[route]].map((q) => `${q.prompt} ${[...(q.choices ?? [])].sort()}`);
          expect(new Set(asked).size, `grade ${grade} seed ${s.seed} ${route}`).toBe(asked.length);
        }
      }
    }
  });

  it("siblings and retakes in the same grade share few templates and almost no questions", () => {
    for (const grade of [1, 2] as Grade[]) {
      let sharedTemplates = 0, templates = 0, sharedQuestions = 0, questions = 0;
      for (let i = 0; i < 200; i++) {
        const [a, b] = [createSession({ grade, province: "BC" }, 2 * i + 1), createSession({ grade, province: "BC" }, 2 * i + 2)];
        const bTemplates = new Set(b.stage1.map((q) => q.templateId));
        for (const t of new Set(a.stage1.map((q) => q.templateId))) {
          templates++;
          if (bTemplates.has(t)) sharedTemplates++;
        }
        const bPrompts = new Set([...b.stage1, ...b.stage2.stay].map((q) => q.prompt));
        for (const q of [...a.stage1, ...a.stage2.stay]) {
          questions++;
          if (bPrompts.has(q.prompt)) sharedQuestions++;
        }
      }
      // Rotation must include small standard pools. It increases template overlap while numbers still vary.
      expect(sharedTemplates / templates, `grade ${grade} templates`).toBeLessThan(0.5);
      expect(sharedQuestions / questions, `grade ${grade} questions`).toBeLessThan(0.1);
    }
  });
});

describe("scripted children, grades 1-2, on the real bank", () => {
  it("a grade 2 child who gets everything right is routed up and placed at level 3", () => {
    const { asked, placement } = takeTest({ grade: 2, province: "BC" }, 3, allRight);
    expect(asked).toHaveLength(30);
    expect(placement.route).toBe("up");
    expect(Math.max(...asked.map((q) => q.level))).toBe(3);
    expect(placement.workingLevel).toBe(3);
    expect(placement.atCeiling).toBe(true);
    expect(placement.strands.map((s) => s.strand)).toEqual(["number", "algebra", "shapes"]);
  });

  it("a grade 1 child who gets everything wrong is routed down to Kindergarten questions", () => {
    const { asked, placement } = takeTest({ grade: 1, province: "BC" }, 3, allWrong);
    expect(placement.route).toBe("down");
    expect(Math.min(...asked.map((q) => q.level))).toBe(0);
    expect(placement.workingLevel).toBe(0);
    expect(placement.confidence).toBe("low");
  });

  it("a grade 2 child who knows only Kindergarten math is routed down and placed at K", () => {
    const { placement } = takeTest({ grade: 2, province: "SK" }, 8, knowsUpTo(0));
    expect(placement.route).toBe("down");
    expect(placement.levels.map((l) => l.level)).toEqual([1, 2]);
    expect(placement.workingLevel).toBe(0);
  });

  it("a grade 1 child who knows grade 1 math but not grade 2 is routed up, misses level 2 and is placed at 1", () => {
    const { placement } = takeTest({ grade: 1, province: "ON" }, 5, knowsUpTo(1));
    expect(placement.route).toBe("up");
    expect(placement.levels).toEqual([
      { level: 1, correct: 12, total: 12 },
      { level: 2, correct: 0, total: 12 },
    ]);
    expect(placement.workingLevel).toBe(1);
    expect(placement.atCeiling).toBe(false);
  });
});

describe("the grades 1-2 bank", () => {
  it("every province has at least 4 templates for each level K-3 and each strand, so a stage never repeats one", () => {
    for (const province of TAGGED) {
      for (const level of [0, 1, 2, 3]) {
        for (const strand of ["number", "algebra", "shapes"]) {
          const pool = GRADE_1_2_BANK.filter((t) => levelFor(t, province) === level && REPORTED_STRAND[t.strand] === strand);
          expect(pool.length, `${province} level ${level} ${strand}`).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("covers levels K-3 with all five province tags, and never fractions", () => {
    for (const t of GRADE_1_2_BANK) {
      expect(Object.keys(t.grades).sort(), t.id).toEqual([...TAGGED].sort());
      expect(t.grades.BC, t.id).toBeLessThanOrEqual(3);
      expect(t.strand, t.id).not.toBe("F");
    }
  });

  it("has unique ids, and an id shared with another bank is the same template", () => {
    expect(new Set(GRADE_1_2_BANK.map((t) => t.id)).size).toBe(GRADE_1_2_BANK.length);
    for (const other of Object.values(BANKS)) {
      for (const t of other) {
        const mine = GRADE_1_2_BANK.find((m) => m.id === t.id);
        if (mine) expect(mine, t.id).toBe(t);
      }
    }
  });

  describe.each(GRADE_1_2_BANK.map((t) => [t.id, t] as const))("%s", (_, template) => {
    // A typed answer at level 2 or below is at most 2 digits (research: grades 1-2 number pad).
    const youngest = Math.min(...TAGGED.map((p) => template.grades[p]));

    it("gives a valid question for every seed: coded wrong answers, none equal to the answer", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
        expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null|\[object/);
        expect(q.readAloud.length, `seed ${seed}`).toBeGreaterThan(0);
        expect(q.wrong.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const w of q.wrong) expect(MISCONCEPTIONS[w.misconception], `seed ${seed}: ${w.misconception}`).toBeDefined();
        // A sum never breaks across lines on screen.
        for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/ [+−×=]|[+−×=] /);

        if (q.format === "number") {
          expect(q.answer, `seed ${seed}`).toMatch(/^\d+$/);
          if (youngest <= 2) expect(Number(q.answer), `seed ${seed}`).toBeLessThan(100);
          const values = [q.answer, ...q.wrong.map((w) => w.value)].map(Number);
          expect(values.every((v) => Number.isInteger(v) && v >= 0), `seed ${seed}: ${values}`).toBe(true);
          expect(new Set(values).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          // Three large targets: the most a grade 1 child should choose from.
          expect(q.choices, `seed ${seed}`).toHaveLength(3);
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(3);
          expect(q.choices).toContain(q.answer);
        }
      }
    });

    it("read-aloud text has words, not symbols", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        expect(fillTemplate(template, seed).readAloud, `seed ${seed}`).not.toMatch(NOT_SPOKEN);
      }
    });

    it("when the text names the choices, the answer is not always in the same place among them", () => {
      if (template.format !== "choice") return;
      // A choice as words: no glyphs, lower case, and spaces that do not break read as spaces.
      const words = (s: string) => s.replace(/[●■▲★◆▼▬▮]/g, "").replace(/ /g, " ").trim().toLowerCase();
      for (const field of ["prompt", "readAloud"] as const) {
        const ranks = new Set<number>();
        for (const seed of SEEDS.slice(0, 150)) {
          const q = fillTemplate(template, seed);
          const text = words(q[field]).replace(/ plus /g, " + ").replace(/ is the same as /g, " = ");
          const named = [q.answer, ...q.wrong.map((w) => w.value)].map(words);
          const positions = named.map((c) => text.indexOf(c));
          // Glyph-only choices have no words to find.
          if (named.some((c) => !c) || positions.some((p) => p < 0)) continue;
          ranks.add([...positions].sort((a, b) => a - b).indexOf(positions[0]));
        }
        expect(ranks.size, `${field}: the answer is always choice ${[...ranks][0] + 1} of those named`).not.toBe(1);
      }
    });

    it("when the prompt and the read-aloud both name the choices, they name them in the same order", () => {
      if (template.format !== "choice") return;
      const words = (s: string) => s.replace(/[●■▲★◆▼▬▮]/g, "").replace(/ /g, " ").trim().toLowerCase();
      for (const seed of SEEDS.slice(0, 150)) {
        const q = fillTemplate(template, seed);
        const named = [q.answer, ...q.wrong.map((w) => w.value)].map(words);
        if (named.some((c) => !c)) continue;
        const order = (text: string) => {
          const at = named.map((c) => words(text).indexOf(c));
          return at.some((p) => p < 0) ? null : named.map((_, i) => i).sort((a, b) => at[a] - at[b]).join();
        };
        const [inPrompt, spoken] = [order(q.prompt), order(q.readAloud)];
        if (inPrompt && spoken) expect(spoken, `seed ${seed}`).toBe(inPrompt);
      }
    });

    it("never pairs 1 with a plural, as in '1 red cubes'", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
          expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.])1 ([a-z]+ )?(?!is\b|was\b|has\b|less\b|plus\b|seats\b)[a-z]+s\b/);
        }
      }
    });

    it("the same seed gives the same question, and different seeds give at least 4 different questions", () => {
      expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
      // A retake or a sibling should rarely meet the very same question.
      // Same key as the session uses: the prompt, the set of choices and the drawn figure (#79).
      const variants = new Set(SEEDS.map((seed) => {
        const q = fillTemplate(template, seed);
        return `${q.prompt} ${[...(q.choices ?? [])].sort()} ${q.figure ? JSON.stringify(q.figure) : ""}`;
      }));
      expect(variants.size).toBeGreaterThanOrEqual(4);
    });
  });

  it("the public view of a question never carries the answer", () => {
    for (const template of GRADE_1_2_BANK) {
      const view = JSON.stringify(toPublicQuestion(fillTemplate(template, 3)));
      expect(view).not.toMatch(/"answer"|"wrong"|misconception/);
    }
  });
});

// #75 acceptance: review-flag triage against primary curriculum sources (scripts/template-check/triage.md).
describe("primary-source tag and wording corrections from the #75 checker run", () => {
  const byId = (id: string) => GRADE_1_2_BANK.find((t) => t.id === id)!;
  const levels = (id: string) => PROVINCES.map((p) => fillTemplate(byId(id), 0, p).level);

  it.each([
    // [id, BC, AB, SK, MB, ON, other]. AB current K-6 names likelihood first in grade 6 (MAT6-OI8-GQ1-LO1-KO2-SP).
    ["k-likely-event", [0, 6, 5, 5, 1, 0]],
    ["1-never-sometimes-always", [1, 6, 5, 5, 1, 1]],
    ["1-more-likely", [1, 6, 5, 5, 1, 1]],
    ["2-spinner", [2, 6, 5, 5, 3, 2]], // more likely and equally likely: ON3 D2.1
    ["2-certain-possible", [2, 6, 5, 5, 1, 2]],
    ["3-bag-likely", [3, 6, 5, 5, 3, 3]],
    ["3-coin-streak", [3, 6, 5, 5, 3, 3]],
    ["1-count-coins", [1, 2, 2, 2, 2, 1]], // AB grade 2 coins of one kind; SK N2.1, MB 2.N.1
    ["2-coins-mixed", [2, 3, 2, 2, 2, 2]], // AB grade 3 nickels, dimes, quarters; SK N2.2, MB 2.N.9
    ["3-money-total", [3, 3, 2, 2, 2, 3]], // AB grade 3 loonies, toonies, bills; ON2 F1.1
    ["1-missing-addend", [1, 1, 3, 3, 1, 1]], // AB grade 1 missing quantity within 20
    ["2-true-equation", [2, 3, 2, 2, 2, 2]], // AB MAT3-OI2-GQ1-LO1-KO1-SP
    ["2-pattern-rows", [2, 2, 2, 2, 1, 2]], // ON1 C1.3
    ["1-cover-card", [1, 1, 1, 1, 1, 1]], // grade 1 compares area by covering
    ["1-length-together", [1, 2, 2, 2, 2, 1]], // ON2 E2.1 length in units
  ] as const)("%s uses the grade where each province's curriculum teaches it", (id, expected) => {
    expect(levels(id)).toEqual([...expected]);
  });
  it("codes the other benchmark that brackets the number as near, and the third one as far (#187)", () => {
    for (const seed of SEEDS) {
      const q = fillTemplate(byId("2-closest-benchmark"), seed);
      const n = q.values.n, answer = Number(q.answer);
      for (const w of q.wrong) {
        const m = Number(w.value);
        const brackets = (m < n && n < answer) || (answer < n && n < m);
        const between = [25, 50, 100].some((b) => b !== m && b !== answer && Math.min(m, answer) < b && b < Math.max(m, answer));
        expect(w.misconception, `seed ${seed}: ${n} -> ${answer}, ${m}`).toBe(brackets && !between ? "benchmark-near" : "benchmark-far");
      }
    }
  });

  it("says what makes the unlikely event unlikely, and that the coin is fair", () => {
    for (const seed of SEEDS) {
      const likely = fillTemplate(byId("1-more-likely"), seed);
      for (const text of [likely.prompt, likely.readAloud, ...(likely.choices ?? [])]) expect(text).not.toMatch(/fly to school(?! by flapping)/);
      const coin = fillTemplate(byId("3-coin-streak"), seed);
      expect(coin.prompt).toMatch(/fair coin/);
      expect(coin.readAloud).toMatch(/fair coin/);
    }
  });
});
