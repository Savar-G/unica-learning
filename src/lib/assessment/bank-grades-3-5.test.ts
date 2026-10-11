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
  spokenChoices,
  readAloudText,
  toPublicQuestion,
  type Grade,
  type Province,
  type Question,
  type ReportedStrand,
  type TaggedProvince,
} from "@/lib/assessment";

const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const GRADES: Grade[] = [3, 4, 5];
const ROUTES = ["up", "stay", "down"] as const;
const BANK = BANKS["3-5"];
/** The templates this bank adds; the rest come from the grades 1-2 bank (#74) and its own test covers them. */
const NEW = BANK.filter((t) => t.id.startsWith("g35-"));
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
// Symbols a browser voice reads badly: signs, glyphs, fractions written with a slash (read as a date), clock times,
// and the "?" that marks a blank in a prompt.
const NOT_SPOKEN = /[=+−×÷●■▲★◆▼▬▮$%/<>]|\s\?|\d:\d/;
// Unit abbreviations a voice spells out letter by letter.
const ABBREVIATION = /\b(cm|mm|km|kg|mL)\b|\d ?(m|g|L)\b/;
// Choice templates where the choices are part of the question itself, so the read-aloud text names them: the
// colours a spinner or bag holds.
const NAMES_CHOICES = new Set(["g35-3-most-least-likely"]);

/** How many questions of each reported strand a stage has. */
const strandCounts = (qs: readonly Question[]) => {
  const out: Partial<Record<ReportedStrand, number>> = {};
  for (const q of qs) out[REPORTED_STRAND[q.strand]] = (out[REPORTED_STRAND[q.strand]] ?? 0) + 1;
  return out;
};
const asNumber = (s: string) => Number(s.replace(/,/g, ""));

describe("grade 3-5 speech and figures through the public interface", () => {
  it("keeps the corrected Ontario grade 2 downward form suited to all five required drawings", () => {
    const s = createSession({ grade: 2, province: "ON" }, 2027275);
    const questions = [...s.stage1, ...s.stage2.down];
    expect(s.stage1.filter((q) => q.whiteboard)).toHaveLength(4);
    expect(s.stage2.down.filter((q) => q.whiteboard)).toHaveLength(1);
    expect(questions.filter((q) => q.showWork)).toHaveLength(5);
    expect(questions.filter((q) => q.showWork).every((q) => q.whiteboard)).toBe(true);
    expect(s.stage1.find((q) => q.templateId === "2-missing-in-pattern")?.whiteboard).toBe(true);
  });
  it("bases every heavier-object answer on the stated lower balance side", () => {
    const t = GRADE_1_2_BANK.find((t) => t.id === "k-heavier-object")!;
    const variants = new Set<string>();
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      const heavy = q.answer[0].toLowerCase() + q.answer.slice(1);
      expect(q.prompt).toContain(`The side with ${heavy} is lower.`);
      expect(q.readAloud).toBe(q.prompt);
      expect(q.prompt).toContain("are on a balance.");
      expect(q.readAloud).not.toContain("They weigh the same");
      expect(q.wrong.map((w) => w.misconception).sort()).toEqual(["bigger-heavier", "same-size"]);
      variants.add(`${q.values.pair}:${q.values.heavyFirst}`);
    }
    expect([...variants].sort()).toEqual(["0:0", "0:1", "1:0", "1:1", "2:0", "2:1", "3:0", "3:1"]);
  });
  it("covers all increasing-pattern steps and interior gaps as suitable written work", () => {
    for (const [id, steps] of [["2-increasing-pattern", [2, 5, 10]], ["2-missing-in-pattern", [2, 5, 10]], ["3-increasing-pattern", [3, 4]]] as const) {
      const t = GRADE_1_2_BANK.find((t) => t.id === id)!;
      expect(t.whiteboard).toBe(true);
      const qs = SEEDS.map((seed) => fillTemplate(t, seed));
      expect([...new Set(qs.map((q) => q.values.step))].sort((a, b) => a - b)).toEqual(steps);
      if (id === "2-missing-in-pattern") {
        expect([...new Set(qs.map((q) => q.values.gap))].sort()).toEqual([1, 2, 3]);
        expect([...new Set(qs.map((q) => `${q.values.step}:${q.values.gap}`))].sort()).toEqual([
          "10:1", "10:2", "10:3", "2:1", "2:2", "2:3", "5:1", "5:2", "5:3",
        ]);
      }
    }
  });
  it("keeps the early fraction denominators within the Ontario primary-source range", () => {
    for (const id of ["g35-3-fraction-words", "g35-3-fraction-of-set"]) {
      const t = BANK.find((t) => t.id === id)!;
      for (const seed of SEEDS) expect(fillTemplate(t, seed).values.d).toBeLessThanOrEqual(10);
    }
  });
  it("asks for the whole-number part of an improper fraction on the grade 6 route", () => {
    const t = BANK.find((t) => t.id === "g35-6-mixed-whole-count")!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), { d, whole, rem } = q.values;
      expect(q.prompt).toContain(`${whole * d + rem}/${d}`);
      expect(q.readAloud).toContain(String(whole * d + rem));
      expect(q.readAloud).toMatch(/thirds|fourths|fifths|sixths|eighths/);
      expect(q.answer).toBe(String(whole));
    }
  });
  it.each(["g35-5-pattern-next", "g35-5-pattern-step", "g35-5-pattern-start", "g35-5-pattern-far"])("%s preserves spoken question punctuation", (id) => {
    for (const seed of SEEDS) {
      const q = fillTemplate(BANK.find((t) => t.id === id)!, seed);
      expect(q.readAloud).toBe(q.prompt);
    }
  });
  it("speaks the complete dollar and cents value of each shuffled money choice", () => {
    for (const seed of SEEDS) {
      const money = fillTemplate(BANK.find((t) => t.id === "g35-4-money-notation")!, seed);
      const expected = money.choices!.map((choice) => {
        const cents = Math.round(Number(choice.slice(1)) * 100), dollars = Math.floor(cents / 100), rest = cents % 100;
        return `${dollars} ${dollars === 1 ? "dollar" : "dollars"}${rest ? ` and ${rest} ${rest === 1 ? "cent" : "cents"}` : ""}`;
      });
      const spoken = spokenChoices(toPublicQuestion(money), money.choices!);
      for (const [i, text] of spoken.entries()) expect(text).toContain(expected[i]);
      for (const [i, choice] of money.choices!.entries()) {
        const [dollars, cents] = choice.slice(1).split(".");
        expect(spoken[i]).toContain(`dollar sign ${dollars}${cents ? ` point ${cents.split("").join(" ")}` : ""}`);
      }
      expect(new Set(spoken).size).toBe(spoken.length);
      expect(new Set(money.choices!.map((c) => Number(c.slice(1)))).size).toBe(money.choices!.length);
    }
  });
  it("speaks each ordered-list entry separately in actual shuffled choice order", () => {
    for (const seed of SEEDS) {
      const list = fillTemplate(BANK.find((t) => t.id === "g35-5-order-large")!, seed);
      expect(spokenChoices(toPublicQuestion(list), list.choices!)).toEqual(list.choices!.map((c) => c.split(", ").join(" then ")));
    }
  });
  it("speaks the displayed half-day for every clock choice and timed story", () => {
    for (const seed of SEEDS) {
      const clock = fillTemplate(BANK.find((t) => t.id === "g35-4-24-hour")!, seed);
      const spoken = spokenChoices(toPublicQuestion(clock), clock.choices!);
      for (const [i, choice] of clock.choices!.entries()) expect(spoken[i]).toMatch(choice.endsWith("a.m.") ? /a m$/ : /p m$/);
      for (const id of ["g35-5-duration", "g35-5-end-time"]) {
        const q = fillTemplate(BANK.find((t) => t.id === id)!, seed);
        expect(q.prompt).toContain("p.m.");
        expect(q.prompt).not.toContain("p.m..");
        expect(q.readAloud).toContain("p m");
        expect(q.readAloud).not.toContain("afternoon");
      }
    }
  });
  it("states both rule-input values explicitly in the prompt and speech", () => {
    for (const seed of SEEDS) {
      const rule = fillTemplate(BANK.find((t) => t.id === "g35-6-linear-difference")!, seed);
      expect(rule.prompt).toContain(`when n is ${rule.values.n + 2} than when n is ${rule.values.n}`);
      expect(rule.readAloud).toContain(`when the number is ${rule.values.n + 2} than when the number is ${rule.values.n}`);
    }
  });
  it("uses the correct singular or plural shaded-part phrase in prompt and speech", () => {
    for (const seed of SEEDS) {
      for (const id of ["g35-4-tenths-region", "g35-5-equivalent-region"]) {
        const q = fillTemplate(BANK.find((t) => t.id === id)!, seed);
        const phrase = q.values.n === 1 ? "1 part is shaded" : `${q.values.n} parts are shaded`;
        expect(q.prompt).toContain(phrase);
        expect(q.readAloud).toContain(phrase);
      }
    }
  });
  it("places simple constant-step pattern tasks at the BC numerical-pattern grade", () => {
    for (const id of ["g35-5-pattern-next", "g35-5-pattern-step"]) {
      const t = BANK.find((t) => t.id === id)!;
      expect(t.grades.BC).toBe(3);
      expect(t.standard).toBe("3.6");
    }
  });
  it("uses later Ontario grades for unknown equations above the earlier numeric limits", () => {
    const repeated = BANK.find((t) => t.id === "g35-4-three-same")!;
    const machine = BANK.find((t) => t.id === "g35-4-machine-input")!;
    expect(repeated.grades.ON).toBe(5);
    expect(machine.grades.ON).toBe(6);
    expect(Math.max(...SEEDS.map((seed) => 3 * fillTemplate(repeated, seed).values.k))).toBe(90);
    expect(Math.max(...SEEDS.map((seed) => { const { k, x } = fillTemplate(machine, seed).values; return k * x; }))).toBe(108);
  });
  it("uses genuine three-digit unknown stories with a unique positive answer", () => {
    const t = BANK.find((t) => t.id === "g35-3-start-unknown-story")!;
    expect(TAGGED.map((p) => t.grades[p])).toEqual([3, 3, 3, 3, 3]);
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), { start, change, more } = q.values;
      expect(Number(q.answer)).toBe(start);
      expect(start).toBeGreaterThanOrEqual(125);
      expect(start).toBeLessThanOrEqual(749);
      expect(change).toBeGreaterThanOrEqual(25);
      expect(change).toBeLessThanOrEqual(99);
      const total = more ? start + change : start;
      expect(total).toBeGreaterThan(100);
      expect(total).toBeLessThan(1000);
      expect(q.wrong.every((w) => Number(w.value) !== start)).toBe(true);
    }
  });
  it.each(["3-start-unknown", "3-change-unknown", "3-balance-equation"])("%s uses Ontario grade 2 and equations within 100", (id) => {
    const t = GRADE_1_2_BANK.find((t) => t.id === id)!;
    expect(t.grades.ON).toBe(2);
    const totals: number[] = [];
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      const numbers = [...q.prompt.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(Math.max(...numbers, Number(q.answer))).toBeLessThanOrEqual(100);
      expect(q.answer).toMatch(/^\d+$/);
      if (id === "3-balance-equation") {
        const [a, b, c] = numbers;
        expect(Number(q.answer) + c).toBe(a + b);
        totals.push(a + b);
      } else if (id === "3-change-unknown") {
        expect(numbers[0] + Number(q.answer)).toBe(numbers[1]);
        totals.push(numbers[1]);
      } else {
        const [b, result] = numbers;
        expect(q.prompt.includes("−") ? Number(q.answer) - b : Number(q.answer) + b).toBe(result);
        totals.push(q.prompt.includes("−") ? Number(q.answer) : result);
      }
    }
    expect(Math.min(...totals)).toBeGreaterThan(0);
    expect(Math.max(...totals)).toBeLessThanOrEqual(47);
  });
  it("codes both can and drum square distractors as shape-name", () => {
    const t = GRADE_1_2_BANK.find((t) => t.id === "2-face-of-solid")!;
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      const part = q.prompt.includes("can") ? "can" : q.prompt.includes("drum") ? "drum" : undefined;
      if (!part) continue;
      seen.add(part);
      expect(q.answer).toContain("circle");
      expect(q.wrong.find((w) => w.value.includes("square"))?.misconception).toBe("shape-name");
    }
    expect([...seen].sort()).toEqual(["can", "drum"]);
  });
  it("codes equal additive changes in the ratio recipe", () => {
    const t = BANK.find((t) => t.id === "g35-6-ratio-recipe")!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), { a, b, k } = q.values;
      const choice = q.wrong.find((w) => w.misconception === "F9");
      expect(choice?.value, q.prompt).toBe(String(a + b * (k - 1)));
    }
  });
  it("uses the requested whole when reversing a part-to-whole ratio", () => {
    const t = BANK.find((t) => t.id === "g35-6-ratio-part-to-whole")!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), { a, b } = q.values;
      expect(q.wrong.find((w) => w.misconception === "ratio-order")?.value).toBe(`${a + b} to ${a}`);
    }
  });
  it("keeps simple Ontario unknown equations at grade 2", () => {
    for (const op of ["add", "subtract", "subtrahend"]) expect(BANK.find((t) => t.id === `g35-6-equation-${op}`)?.grades.ON).toBe(2);
  });
  it("has a probability estimate that scales observed outcomes", () => {
    const t = BANK.find((t) => t.id === "g35-6-experimental-estimate");
    expect(t).toBeDefined();
    for (const seed of SEEDS) {
      const q = fillTemplate(t!, seed), { red, k } = q.values;
      expect(q.answer).toBe(String(red * k));
      expect(q.readAloud).toContain("estimate");
    }
  });
  it("describes feasible closed gardens for perimeter questions", () => {
    const t = BANK.find((t) => t.id === "g35-4-perimeter-sides")!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      const sides = [...q.prompt.matchAll(/(\d+) m\b/g)].map((m) => Number(m[1]));
      expect(sides.length).toBeGreaterThanOrEqual(4);
      expect(2 * Math.max(...sides), q.prompt).toBeLessThan(sides.reduce((a, b) => a + b, 0));
    }
  });
  it.each(NEW)("$id speaks every displayed choice without math signs or clock notation", (t) => {
    for (const seed of SEEDS.slice(0, 40)) {
      const q = fillTemplate(t, seed);
      const publicQuestion = toPublicQuestion(q);
      const shown = q.choices ?? [];
      const spoken = spokenChoices(publicQuestion, shown);
      // JavaScript enumerates integer keys numerically. All other keys must have lexical order, independent of correctness.
      if (shown.length) expect(Object.keys(publicQuestion.say ?? {}), t.id).toEqual(Object.keys(Object.fromEntries([...shown].sort().map((c) => [c, c]))));
      expect(spoken).toHaveLength(shown.length);
      for (const text of spoken) expect(text, `${t.id}: ${text}`).not.toMatch(NOT_SPOKEN);
      if (shown.length) expect(readAloudText(publicQuestion, shown)).toContain(`Choose one. ${spoken.map((s) => /[.?!]$/.test(s) ? s : `${s}.`).join(" ")}`);
      expect(publicQuestion.figure).toEqual(q.figure);
    }
  });
  it.each(NEW)("$id has one right numeric or fraction choice and no equivalent duplicate choices", (t) => {
    const value = (s: string): number | undefined => {
      const c = s.replace(/,/g, "").trim();
      const f = c.match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
      if (f) return Number(f[1] ?? 0) + Number(f[2]) / Number(f[3]);
      return /^\d+(?:\.\d+)?$/.test(c) ? Number(c) : undefined;
    };
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), right = value(q.answer);
      if (!q.choices || right === undefined) continue;
      expect(q.choices.filter((c) => value(c) !== undefined && Math.abs(value(c)! - right) < 1e-9), `${t.id}: ${q.choices}`).toHaveLength(1);
      const numeric = q.choices.map(value);
      if (numeric.every((v) => v !== undefined)) expect(new Set(numeric.map((v) => v!.toPrecision(12))).size, `${t.id}: ${q.choices}`).toBe(q.choices.length);
    }
  });
  it.each(NEW)("$id has no other equation that is true for the same unknown", (t) => {
    const expression = (s: string): [number, number] | undefined => {
      const text = s.replace(/[ ,]/g, " ").trim();
      if (/^[?nx]$/.test(text)) return [1, 0];
      if (/^\d+$/.test(text)) return [0, Number(text)];
      const m = text.match(/^([?nx]|\d+)\s*([+−×÷])\s*([?nx]|\d+)$/);
      if (!m) return;
      const a = expression(m[1])!, b = expression(m[3])!;
      if (m[2] === "+") return [a[0] + b[0], a[1] + b[1]];
      if (m[2] === "−") return [a[0] - b[0], a[1] - b[1]];
      if (m[2] === "×" && !(a[0] && b[0])) return [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
      if (m[2] === "÷" && b[0] === 0 && b[1] !== 0) return [a[0] / b[1], a[1] / b[1]];
    };
    const equation = (s: string) => {
      const halves = s.split("=");
      if (halves.length !== 2) return;
      const a = expression(halves[0]), b = expression(halves[1]);
      return a && b ? [a[0] - b[0], a[1] - b[1]] : undefined;
    };
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), right = equation(q.answer);
      if (!q.choices || !right) continue;
      const x = right[0] ? -right[1] / right[0] : 0;
      for (const c of q.choices.filter((c) => c !== q.answer)) {
        const wrong = equation(c);
        if (wrong) expect(Math.abs(wrong[0] * x + wrong[1]), `${t.id}: ${q.answer}; ${c}`).toBeGreaterThan(1e-8);
      }
    }
  });
});

describe("grade 3-5 tests from the default bank", () => {
  it.each(GRADES)("grade %i: 36 questions, 18 in stage 1 at the school grade, routes down and up, in every province", (grade) => {
    for (const province of PROVINCES) {
      for (const seed of [1, 2, 3]) {
        const session = createSession({ grade, province }, seed);
        expect(session.stage1, province).toHaveLength(18);
        expect(session.stage1.every((q) => q.level === grade), province).toBe(true);
        for (const [route, level] of [["up", grade + 1], ["stay", grade], ["down", grade - 1]] as const) {
          const form = session.stage2[route];
          expect(form, `${province} ${route}`).toHaveLength(18);
          expect(form.every((q) => q.level === level), `${province} ${route}`).toBe(true);
          // Every reported strand is asked at every level; fractions only from level 3.
          const strands = level >= 3 ? ["algebra", "fractions", "number", "shapes"] : ["algebra", "number", "shapes"];
          expect(Object.keys(strandCounts(form)).sort(), `${province} ${route}`).toEqual(strands);
        }
        expect(Object.keys(strandCounts(session.stage1)).sort(), province).toEqual(["algebra", "fractions", "number", "shapes"]);
      }
    }
  });
});

describe("a grade 3-5 test, every route, every province", () => {
  const band = bandFor(3);
  const sessions = (grade: Grade, province: Province, count: number) =>
    Array.from({ length: count }, (_, i) => createSession({ grade, province }, i * 7919 + 11));

  it.each(GRADES)("grade %i: each route offers at least 7 drawing questions, so the core can require 7", (grade) => {
    expect(band.whiteboardRequired).toBe(7);
    for (const province of PROVINCES) {
      for (const s of sessions(grade, province, 300)) {
        const drawing = (qs: Question[]) => qs.filter((q) => q.whiteboard).length;
        // The stage 1 picks are made before the route is known, so they must work with the poorest form.
        const poorestForm = Math.min(...ROUTES.map((r) => drawing(s.stage2[r])));
        expect(drawing(s.stage1) + poorestForm, `${province} seed ${s.seed}`).toBeGreaterThanOrEqual(band.whiteboardRequired);
      }
    }
  });

  it.each(GRADES)("grade %i: each route requires exactly 7 shown-work questions, all drawn from drawing-suited templates", (grade) => {
    for (const province of PROVINCES) {
      for (const s of sessions(grade, province, 150)) {
        for (const route of ROUTES) {
          const required = [...s.stage1, ...s.stage2[route]].filter((q) => q.showWork);
          expect(required, `${province} seed ${s.seed} ${route}`).toHaveLength(band.whiteboardRequired);
          // The bank supplies enough suited questions, so the core never has to fall back to an unsuited one.
          expect(required.every((q) => q.whiteboard), `${province} seed ${s.seed} ${route}`).toBe(true);
        }
      }
    }
  });

  it("no question repeats within a test", () => {
    for (const grade of GRADES) {
      for (const province of PROVINCES) {
        for (const s of sessions(grade, province, 20)) {
          for (const route of ROUTES) {
            const asked = [...s.stage1, ...s.stage2[route]].map((q) => `${q.prompt} ${[...(q.choices ?? [])].sort()} ${JSON.stringify(q.figure ?? null)}`);
            expect(new Set(asked).size, `grade ${grade} ${province} seed ${s.seed} ${route}`).toBe(36);
          }
        }
      }
    }
  });

  it("siblings and retakes in the same grade share few templates and almost no questions, in every province", () => {
    for (const grade of GRADES) {
      for (const province of TAGGED) {
        let sharedTemplates = 0, templates = 0, sharedQuestions = 0, questions = 0;
        for (let i = 0; i < 200; i++) {
          const [a, b] = [createSession({ grade, province }, 2 * i + 1), createSession({ grade, province }, 2 * i + 2)];
          const bTemplates = new Set(b.stage1.map((q) => q.templateId));
          for (const t of new Set(a.stage1.map((q) => q.templateId))) {
            templates++;
            if (bTemplates.has(t)) sharedTemplates++;
          }
          const bPrompts = new Set([...b.stage1, ...b.stage2.stay].map((q) => `${q.prompt} ${JSON.stringify(q.figure ?? null)}`));
          for (const q of [...a.stage1, ...a.stage2.stay]) {
            questions++;
            if (bPrompts.has(`${q.prompt} ${JSON.stringify(q.figure ?? null)}`)) sharedQuestions++;
          }
        }
        expect(sharedTemplates / templates, `grade ${grade} ${province} templates`).toBeLessThan(0.4);
        expect(sharedQuestions / questions, `grade ${grade} ${province} questions`).toBeLessThan(0.1);
      }
    }
  });
});

describe("scripted children, grades 3-5, on the real bank", () => {
  it.each(TAGGED)("%s: a grade 5 child who gets everything right is routed up and placed at level 6", (province) => {
    const { asked, placement } = takeTest({ grade: 5, province }, 3, allRight);
    expect(asked).toHaveLength(36);
    expect(placement.route).toBe("up");
    expect(Math.max(...asked.map((q) => q.level))).toBe(6);
    expect(placement.workingLevel).toBe(6);
    expect(placement.atCeiling).toBe(true);
    expect(placement.strands.map((s) => s.strand)).toEqual(["number", "fractions", "algebra", "shapes"]);
  });

  it.each(TAGGED)("%s: a grade 3 child who gets everything wrong is routed down to level 2", (province) => {
    const { asked, placement } = takeTest({ grade: 3, province }, 3, allWrong);
    expect(placement.route).toBe("down");
    expect(Math.min(...asked.map((q) => q.level))).toBe(2);
    expect(placement.workingLevel).toBe(1);
    expect(placement.confidence).toBe("low");
  });

  it.each(TAGGED)("%s: a grade 4 child who knows only grade 3 math is routed down and placed at 3", (province) => {
    const { placement } = takeTest({ grade: 4, province }, 8, knowsUpTo(3));
    expect(placement.route).toBe("down");
    expect(placement.levels).toEqual([
      { level: 3, correct: 18, total: 18 },
      { level: 4, correct: 0, total: 18 },
    ]);
    expect(placement.workingLevel).toBe(3);
  });

  it.each(TAGGED)("%s: a grade 4 child who knows grade 4 math but not grade 5 is routed up, misses level 5 and is placed at 4", (province) => {
    const { placement } = takeTest({ grade: 4, province }, 5, knowsUpTo(4));
    expect(placement.route).toBe("up");
    expect(placement.levels).toEqual([
      { level: 4, correct: 18, total: 18 },
      { level: 5, correct: 0, total: 18 },
    ]);
    expect(placement.workingLevel).toBe(4);
    expect(placement.atCeiling).toBe(false);
  });
});

describe("the grades 3-5 bank", () => {
  it.each(["numerator", "denominator"])("equivalent-%s additive error changes both fraction parts by the same amount", (task) => {
    const t = BANK.find((t) => t.id === `g35-5-equivalent-${task}`)!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      const { n, d, k } = q.values;
      const coded = q.wrong.find((w) => w.misconception === "F9")!;
      const expected = task === "numerator" ? n + d * (k - 1) : d + n * (k - 1);
      expect(asNumber(coded.value), `${seed}: ${coded.value}`).toBe(expected);
    }
  });

  it("tags every template for all five provinces, at BC levels 2-6", () => {
    for (const t of BANK) {
      expect(Object.keys(t.grades).sort(), t.id).toEqual([...TAGGED].sort());
      expect(t.grades.BC, t.id).toBeGreaterThanOrEqual(2);
      expect(t.grades.BC, t.id).toBeLessThanOrEqual(6);
    }
  });

  it("asks fractions only from level 3, in every province", () => {
    for (const t of BANK.filter((t) => t.strand === "F")) {
      for (const p of TAGGED) expect(t.grades[p], `${t.id} ${p}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("reuses the grades 1-2 bank's level 2 and 3 templates as they are", () => {
    const reused = BANK.filter((t) => !t.id.startsWith("g35-"));
    expect(reused.length).toBeGreaterThan(0);
    for (const t of reused) {
      expect(GRADE_1_2_BANK.some((g) => g === t), t.id).toBe(true);
      expect(t.grades.BC, t.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("every province has enough templates at each level and strand: 6 or more for stage 1 levels 3-5, 5 for levels 2 and 6", () => {
    for (const province of TAGGED) {
      for (const level of [2, 3, 4, 5, 6]) {
        for (const strand of ["number", "fractions", "algebra", "shapes"]) {
          if (strand === "fractions" && level < 3) continue;
          const pool = BANK.filter((t) => levelFor(t, province) === level && REPORTED_STRAND[t.strand] === strand);
          expect(pool.length, `${province} level ${level} ${strand}`).toBeGreaterThanOrEqual(level === 2 || level === 6 ? 5 : 6);
        }
      }
    }
  });

  it("has unique ids, and an id shared with another bank is the same template", () => {
    expect(new Set(BANK.map((t) => t.id)).size).toBe(BANK.length);
    for (const other of Object.values(BANKS)) {
      for (const t of other) {
        const mine = BANK.find((m) => m.id === t.id);
        if (mine) expect(mine, t.id).toBe(t);
      }
    }
  });

  describe.each(NEW.map((t) => [t.id, t] as const))("%s", (_, template) => {
    it("gives a valid question for every seed: coded wrong answers, none equal to the answer", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
        expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null|\[object/);
        expect(q.readAloud.length, `seed ${seed}`).toBeGreaterThan(0);
        expect(q.wrong.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const w of q.wrong) {
          expect(MISCONCEPTIONS[w.misconception], `seed ${seed}: ${w.misconception}`).toBeDefined();
          // The answers table stores misconception codes with a 20-character limit.
          expect(w.misconception.length, `seed ${seed}: ${w.misconception}`).toBeLessThanOrEqual(20);
        }
        // A sum or an equation never breaks across lines on screen.
        for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/ [+−×÷=]|[+−×÷=] /);

        if (q.format === "number") {
          // The number pad has digits and a decimal point: at most 4 digits before it (research, grades 3-5) and 3 after.
          expect(q.answer, `seed ${seed}`).toMatch(/^\d{1,4}(\.\d{1,3})?$/);
          const values = [q.answer, ...q.wrong.map((w) => w.value)].map(asNumber);
          expect(values.every((v) => Number.isFinite(v) && v >= 0), `seed ${seed}: ${values}`).toBe(true);
          expect(new Set(values).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          // Four large targets by default; three where only three make sense.
          expect(q.choices!.length, `seed ${seed}: ${q.choices}`).toBeGreaterThanOrEqual(3);
          expect(q.choices!.length, `seed ${seed}: ${q.choices}`).toBeLessThanOrEqual(4);
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.choices!.length);
          expect(q.choices).toContain(q.answer);
        }
      }
    });

    it("read-aloud text has words, not symbols or unit abbreviations", () => {
      for (const seed of SEEDS.slice(0, 150)) {
        const { readAloud } = fillTemplate(template, seed);
        expect(readAloud, `seed ${seed}`).not.toMatch(NOT_SPOKEN);
        expect(readAloud, `seed ${seed}`).not.toMatch(ABBREVIATION);
      }
    });

    it("read-aloud text does not list the choices: the test screen speaks them (#79)", () => {
      if (template.format !== "choice" || NAMES_CHOICES.has(template.id)) return;
      for (const seed of SEEDS.slice(0, 150)) {
        const q = fillTemplate(template, seed);
        const spoken = q.readAloud.toLowerCase();
        const named = q.choices!.filter((c) => {
          const label = c.replace(/\u00a0/g, " ").toLowerCase();
          const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(spoken);
        });
        expect(named.length, `seed ${seed}: ${named}`).toBeLessThan(2);
      }
    });

    it("never pairs 1 with a plural, as in '1 red cubes'", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
          expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.,/])1 ([a-z]+ )?(?!is\b|was\b|has\b|gives\b|less\b|plus\b|times\b|minus\b)[a-z]+s\b/);
        }
      }
    });

    it("the same seed gives the same question, and different seeds give at least 5 different questions", () => {
      expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
      const variants = new Set(SEEDS.map((seed) => {
        const q = fillTemplate(template, seed);
        return `${q.prompt} ${[...(q.choices ?? [])].sort()} ${JSON.stringify(q.figure ?? null)}`;
      }));
      expect(variants.size).toBeGreaterThanOrEqual(5);
    });
  });

  it("the public view of a question never carries the answer", () => {
    for (const template of BANK) {
      const view = JSON.stringify(toPublicQuestion(fillTemplate(template, 3)));
      expect(view).not.toMatch(/"answer"|"wrong"|misconception/);
    }
  });
});
