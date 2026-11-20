import { describe, expect, it } from "vitest";
import { BC_CURRICULUM, bcStepProgressions } from "@/lib/workbook-curriculum";
import { HOUSE_TEMPLATES, isChallengeOnly, isTwoStep, withHouseTemplates } from "./house-templates";
import { stepFieldProblems } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { challengeTemplateCount, choicesFor, sequenceOf, stepRangeProblem } from "@/lib/workbook-step-items";
import { takeAwayProblem } from "@/lib/workbook-wording";

describe("Unica Challenge templates", () => {
  const c = bcStepProgressions();
  it.each([1, 2, 3])("provides three distinct hard contracts for U19 divisibility step %i", step => {
    expect(challengeTemplateCount(c, "6.4-divisibility", step, 19)).toBeGreaterThanOrEqual(3);
  });
  it("are appended after Cedric's templates of their named steps", () => {
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      expect(step.name).toBe(h.name);
      const own = BC_CURRICULUM.steps.find((s) => s.skill === h.skill && s.number === h.step)!.templates ?? [];
      expect(step.templates!.slice(0, own.length)).toEqual(own);
      expect(step.templates!.slice(own.length)).toEqual([...(h.practice ?? []), ...h.templates]);
      for (const t of h.practice ?? []) expect(isChallengeOnly(t)).toBe(false);
      if (!h.stories) for (const t of h.templates) expect(isChallengeOnly(t)).toBe(true);
    }
  });
  it("refuse a renamed or missing step", () => {
    expect(() => withHouseTemplates(BC_CURRICULUM, [{ ...HOUSE_TEMPLATES[0], name: "Another step" }])).toThrow(/written for/);
    expect(() => withHouseTemplates(BC_CURRICULUM, [{ ...HOUSE_TEMPLATES[0], skill: "no-such-skill" }])).toThrow(/does not have/);
  });
  it("give every Challenge step three hard templates with its answer kind, and repeat none of the source templates", () => {
    const numeric = (t: { format: string; answer: string }) => ["bare", "missing", "story"].includes(t.format) && !/['"]/.test(t.answer);
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      if (!h.stories && h.templates.length) expect(step.templates!.filter((t) => t.difficulty === "hard" && (h.answerKind === "choice" || numeric(t))).length, `${h.skill}#${h.step}`).toBeGreaterThanOrEqual(3);
      const own = BC_CURRICULUM.steps.find((s) => s.skill === h.skill && s.number === h.step)!.templates ?? [];
      for (const t of h.templates) expect(own.some((o) => o.text === t.text || o.answer === t.answer && o.format === t.format && o.difficulty === "hard")).toBe(false);
    }
  });
  it("fill 200 times each with valid fields, checked answer kinds and numbers in the step's range", () => {
    for (const h of HOUSE_TEMPLATES) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      // (Cedric's source rule of four to six templates a step is his files' shape; Unica's are added after them.)
      expect(stepFieldProblems(step, c.contexts).filter((p) => !/needs four to six templates/.test(p))).toEqual([]);
      for (const t of h.templates) {
        const prepared = prepareTemplate(step, t, c.contexts);
        let filled = 0;
        for (let seed = 1; seed <= 200; seed++) {
          let item;
          try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
          filled++;
          if (h.answerKind === "choice") expect(choicesFor(item.text, item.answer)).toContain(item.answer);
          else expect(item.answer, `${h.skill}#${h.step}: ${item.text}`).toMatch(/^[1-9]\d*$/);
          expect(stepRangeProblem(step, item.text), item.text).toBeNull();
          expect(stepRangeProblem(step, item.answer), item.text).toBeNull();
          expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
          // (More than one step: an equation prints two operations; a story, digit or pattern question works two.)
          if (item.text.includes("=") || /^What is \d/.test(item.text)) expect((item.text.match(/[+×-]/g) ?? []).length, item.text).toBeGreaterThanOrEqual(2);
        }
        expect(filled, `${h.skill}#${h.step}: ${t.text}`).toBeGreaterThan(100);
      }
    }
  });
  it("checks the extra angle-practice definitions and counts across 200 seeds", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.13-classify-angles" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![0];
    const kinds = ["right", "right", "acute", "acute", "obtuse", "obtuse"];
    const seen = new Set<string>();
    for (const t of h.practice!) {
      const prepared = prepareTemplate(step, t, c.contexts);
      for (let seed = 1; seed <= 200; seed++) {
        const filled = prepared.fill(seededRandom(seed));
        seen.add(filled.text);
        if (t.format === "true-false") {
          const kind = kinds[Number(filled.values.k)];
          const claim = String(filled.values.claim);
          expect(filled.answer).toBe(claim.endsWith(kind) ? "true" : "false");
        } else {
          expect(filled.text).toMatch(/Of \d acute and \d obtuse angles/);
          expect(Number(filled.answer)).toBe(Number(filled.values.a));
          expect(Number(filled.values.a)).toBeGreaterThan(0);
          expect(Number(filled.values.b)).toBeGreaterThan(0);
        }
        expect(stepRangeProblem(step, filled.text)).toBeNull();
        expect(stepRangeProblem(step, filled.answer)).toBeNull();
      }
    }
    expect(seen.size).toBeGreaterThan(15);
  });
  it("checks straight/reflex practice definitions and counts across 200 seeds", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.13-classify-angles" && h.step === 2)!;
    const step = c.skillSteps(h.skill)![1];
    const trueClaims = new Set(["half a turn makes a straight angle", "a reflex angle is less than one full turn",
      "a straight angle is exactly half a turn", "a reflex angle is more than half a turn"]);
    for (const t of h.practice!) for (let seed = 1; seed <= 200; seed++) {
      const item = prepareTemplate(step, t, c.contexts).fill(seededRandom(seed));
      if (t.format === "true-false") expect(item.answer).toBe(trueClaims.has(String(item.values.claim)) ? "true" : "false");
      else expect(Number(item.answer)).toBe(Number(item.values.b));
      expect(stepRangeProblem(step, item.text)).toBeNull();
      expect(stepRangeProblem(step, item.answer)).toBeNull();
    }
  });
  it("checks the added common-multiple practice independently across 200 seeds", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.4-lcm" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![0];
    for (const [index, t] of h.practice!.entries()) {
      const prepared = prepareTemplate(step, t, c.contexts);
      for (let seed = 1; seed <= 200; seed++) {
        const item = prepared.fill(seededRandom(seed));
        const a = Number(item.values.a), b = Number(item.values.b);
        const shared = Array.from({ length: 24 }, (_, i) => i + 1).find(x => x % a === 0 && x % b === 0)!;
        if (index === 2) expect(item.answer).toBe(Number(item.values.c) === shared ? "true" : "false");
        else expect(Number(item.answer)).toBe(index === 1 ? shared / a : shared);
        if (index === 3) expect([a, 2 * a, 3 * a].filter(n => [b, 2 * b, 3 * b].includes(n))).toEqual([shared]);
        expect(stepRangeProblem(step, item.text)).toBeNull();
        expect(stepRangeProblem(step, item.answer)).toBeNull();
      }
    }
  });
  it("checks the proposed U17 Challenge answers independently across 200 seeds", () => {
    const steps = HOUSE_TEMPLATES.filter(h => /^(5\.6-(multiply-2-digit|divide-remainder)|5\.3-(equivalent-fractions|same-amount)|5\.11-evaluate-expression)$/.test(h.skill));
    expect(steps).toHaveLength(9);
    for (const h of steps) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      for (const [index, template] of h.templates.entries()) {
        const prepared = prepareTemplate(step, template, c.contexts);
        for (let seed = 1; seed <= 200; seed++) {
          const { text, answer, values } = prepared.fill(seededRandom(seed));
          const [a, b, n, d, e] = [values.a, values.b, values.n, values.d, values.e].map(Number);
          let expected: number | undefined;
          switch (h.skill) {
            case "5.6-multiply-2-digit": {
              const product = a * b;
              const c = Number(values.c);
              if (h.step === 1) expected = product - (index === 0 ? c : Number(values.p));
              if (h.step === 2) expected = index === 0 ? product - c * b : index === 1 ? a * (b % 10) : product - c;
              if (h.step === 3) expected = index === 0 ? product - a * c : index === 1 ? a * (b % 10) : product + e;
              break;
            }
            case "5.6-divide-remainder": {
              const quotient = Math.floor(n / b);
              const remainder = n % b;
              expect(remainder).toBeGreaterThan(0);
              if (h.step === 2) expect(Math.floor(quotient / 10) % 10).toBe(0);
              expected = index === 0 ? quotient - remainder : h.step === 1
                ? index === 1 ? quotient : b - remainder
                : index === 1 ? remainder : Math.ceil(n / b);
              break;
            }
            case "5.3-equivalent-fractions": {
              if (h.step === 1) {
                const equivalent = a * e / d;
                expect(Number.isInteger(equivalent)).toBe(true);
                expected = index === 0 ? equivalent + a : index === 1 ? equivalent : e - equivalent;
              } else if (index === 1) {
                expected = Number(values.m) / a * d;
              } else {
                const equivalent = a * e / d;
                expect(Number.isInteger(equivalent)).toBe(true);
                expected = index === 0 ? equivalent - a : 2 * equivalent;
              }
              break;
            }
            case "5.3-same-amount":
              expected = index === 0 ? e / d : a * e / d;
              if (index === 0) expect(Number(values.m) / a).toBe(expected);
              break;
            case "5.11-evaluate-expression": {
              const sum = n + a, difference = b - n;
              expected = index === 0 ? sum - difference : index === 1 ? sum + difference : a - difference;
              break;
            }
          }
          expect(Number(answer), text).toBe(expected);
        }
      }
    }
  });
  it("checks U19 Challenge keys independently across 200 seeds", () => {
    const prime = (n: number) => n >= 2 && !Array.from({ length: Math.max(0, Math.floor(Math.sqrt(n)) - 1) }, (_, i) => i + 2).some(d => n % d === 0);
    for (const h of HOUSE_TEMPLATES.filter(h => ["6.13-classify-angles", "6.4-prime-composite", "6.4-divisibility", "6.4-lcm"].includes(h.skill))) {
      const step = c.skillSteps(h.skill)![h.step - 1];
      for (const [templateIndex, t] of h.templates.entries()) {
        const prepared = prepareTemplate(step, t, c.contexts);
        for (let seed = 1; seed <= 200; seed++) {
          const item = prepared.fill(seededRandom(seed));
          const n = (key: string) => Number(item.values[key]);
          const answer = Number(item.answer);
          if (h.skill === "6.4-prime-composite") {
            expect(prime(n("p"))).toBe(true);
            expect(prime(n("c"))).toBe(false);
            if (t.format !== "missing") expect(prime(n("q"))).toBe(true);
            expect(answer).toBe(h.step === 1 ? t.format === "missing" ? n("p") - 2 : n("p") + n("q")
              : t.format === "missing" ? n("p") + 31 : n("p") + n("q") - (t.format === "story" ? 31 : 0));
          } else if (h.skill === "6.4-divisibility") {
            const multiple = h.step === 1 ? 10 : h.step === 2 ? 9 : t.format === "bare" ? 12 : t.format === "missing" ? 24 : 8;
            if (h.step === 3 && templateIndex >= 3) {
              const candidates = Array.from({ length: n("n") - 1 }, (_, i) => i + 1);
              if (templateIndex === 3) expect(answer).toBe(candidates.filter(x => x % 4 === 0 && x % 6 === 0).length);
              if (templateIndex === 4) expect(answer).toBe(candidates.filter(x => x % 6 === 0 && x % 8 === 0).at(-1));
              if (templateIndex === 5) expect(answer).toBe(candidates.filter(x => x % 4 === 0 && x % 6 === 0 && x % 8 !== 0).at(-1));
            } else if (t.format === "missing" && h.step === 1) {
              expect(answer).toBeLessThan(n("n"));
              expect(answer % 10).toBe(0);
              expect(answer + 10).toBeGreaterThanOrEqual(n("n"));
            } else if (t.format === "missing" && h.step === 2) {
              expect(answer).toBeGreaterThan(n("n"));
              expect(answer % 3).toBe(0);
              expect(answer % 9).not.toBe(0);
              expect(Array.from({ length: answer - n("n") - 1 }, (_, i) => n("n") + i + 1).some(x => x % 3 === 0 && x % 9 !== 0)).toBe(false);
            } else {
              expect(answer).toBe(Math.ceil((n("n") + 1) / multiple) * multiple);
              expect(answer).toBeGreaterThan(n("n"));
            }
            if (t.format === "story" && templateIndex < 3) {
              const interval = item.text.match(/(\d+) < \? < (\d+)/)!;
              const low = Number(interval[1]), top = Number(interval[2]);
              const candidates = Array.from({ length: top - low - 1 }, (_, i) => low + i + 1);
              expect(candidates.length).toBeGreaterThan(1);
              const divisors = h.step === 1 ? [2, 5] : h.step === 2 ? [3, 9] : [4, 8];
              expect(candidates.filter(x => divisors.every(d => x % d === 0))).toEqual([answer]);
            }
          } else if (h.skill === "6.4-lcm") {
            const common = Array.from({ length: 72 }, (_, i) => i + 1).find(x => x % n("a") === 0 && x % n("b") === 0)!;
            expect(common).toBeGreaterThan(0);
            const expected = h.step === 1 ? t.format === "bare" ? 3 * common : t.format === "missing" ? common - n("a") : 2 * common
              : t.format === "bare" ? 2 * common - n("a") : t.format === "missing" ? common / n("a") - 1 : common + n("start");
            expect(answer).toBe(expected);
            if (h.step === 2 && t.format === "missing") expect(item.text).toMatch(/^Count positive multiples/);
          } else {
            expect(item.answer).toBe(h.step === 1 ? t.format === "bare" ? "yes" : t.format === "compare" ? "B" : "no"
              : t.format === "bare" ? "straight" : t.format === "compare" ? "reflex" : "yes");
            expect(item.text).toMatch(h.step === 1 ? /arms|opening/ : /angles|turn/);
            expect(choicesFor(item.text, item.answer)).toContain(item.answer);
          }
          expect(stepRangeProblem(step, item.text)).toBeNull();
          expect(stepRangeProblem(step, item.answer)).toBeNull();
        }
      }
    }
  });
  it("fills the normal decreasing-pattern choice in 200 seeds with the checked next term and two distinct choices", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "3.6-decreasing-pattern" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![h.step - 1];
    for (const t of h.practice!) {
      const prepared = prepareTemplate(step, t, c.contexts);
      for (let seed = 1; seed <= 200; seed++) {
        const filled = prepared.fill(seededRandom(seed));
        const values = filled.text.match(/\d+/g)!.map(Number);
        expect(values).toHaveLength(4);
        expect(Number(filled.answer)).toBe(values[0] - values[1]);
        expect(new Set(values.slice(2)).size).toBe(2);
        expect(values.slice(2)).toContain(Number(filled.answer));
        expect(stepRangeProblem(step, filled.text)).toBeNull();
        expect(stepRangeProblem(step, filled.answer)).toBeNull();
      }
    }
  });
});

describe("code's two-step Challenge cards (U4)", () => {
  const c = bcStepProgressions();
  it("fill from each U4 step's own numbers and keep its range", () => {
    for (const skill of c.levelSkills("U4")!) for (const step of c.skillSteps(skill.id) ?? []) {
      const two = (step.templates ?? []).filter(isTwoStep);
      for (const t of two) {
        const prepared = prepareTemplate(step, t, c.contexts);
        for (let seed = 1; seed <= 60; seed++) {
          let item;
          try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
          expect(stepRangeProblem(step, item.text), item.text).toBeNull();
          if (/^\d+$/.test(item.answer)) expect(stepRangeProblem(step, item.answer), item.text).toBeNull();
          expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
        }
      }
    }
    expect(c.skillSteps("1.1-count-to-20")![0].templates!.filter(isTwoStep)).toHaveLength(5);
    expect(c.skillSteps("1.10-likelihood-words")![0].templates!.filter(isTwoStep)).toHaveLength(3);
    // (No two-step card outside U4.)
    expect(c.skillSteps("5.9-multiply-tens")![0].templates!.some(isTwoStep)).toBe(false);
  });
});

describe("Unica's shorter level wording", () => {
  const c = bcStepProgressions();
  it("rewrites only templates whose text is still Cedric's, with their own slots, shorter, and fills them", async () => {
    const { LEVEL_REWRITES, templateAtLevel } = await import("./house-templates");
    const holes = (s: string) => new Set([...s.matchAll(/\{([A-Za-z_0-9]+)\}/g)].map((m) => m[1]));
    for (const r of LEVEL_REWRITES) {
      const step = c.skillSteps(r.skill)![r.step - 1];
      const t = step.templates![r.template - 1];
      expect(t.text, `${r.skill}#${r.step}.${r.template}`).toBe(r.from);
      expect(r.to.length).toBeLessThan(r.from.length);
      for (const h of holes(r.to)) expect(holes(r.from).has(h), `${r.skill}#${r.step}.${r.template} {${h}}`).toBe(true);
      const shown = templateAtLevel(r.level, step, r.template - 1, t);
      expect(shown.text).toBe(r.to);
      expect(templateAtLevel(1, step, r.template - 1, t).text).toBe(r.from);
      if (r.level !== 16) expect(templateAtLevel(16, step, r.template - 1, t)).toEqual(t);
      expect(templateAtLevel(r.level, step, r.template - 1, { ...t, text: "Changed source" }).text).toBe("Changed source");
      expect({ ...shown, text: t.text }).toEqual(t);
      const prepared = prepareTemplate(step, shown, c.contexts);
      const original = prepareTemplate(step, t, c.contexts);
      let filled = 0;
      for (let seed = 1; seed <= 40; seed++) {
        let item;
        try { item = prepared.fill(seededRandom(seed)); } catch { continue; }
        filled++;
        const before = original.fill(seededRandom(seed));
        expect(item.answer, item.text).toBe(before.answer);
        for (const key of Object.keys(t.slots)) expect(item.values[key], `${item.text}: ${key}`).toEqual(before.values[key]);
        expect(item.text).not.toMatch(/\{/);
        expect(takeAwayProblem(item.text, Number(item.answer)), item.text).toBeNull();
        if (/^Count (?:on|back):/.test(r.from)) {
          const sequence = sequenceOf(item.text.replaceAll("__", "?"), item.answer);
          const oldSequence = sequenceOf(before.text.replaceAll("__", "?"), before.answer);
          expect(sequence).not.toBeNull();
          expect(sequence!.terms).toEqual(oldSequence!.terms);
          expect(sequence!.step).toBe(oldSequence!.step);
        }
      }
      expect(filled, `${r.skill}#${r.step}.${r.template}`).toBeGreaterThan(0);
    }
  });
});
