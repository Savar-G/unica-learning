import { describe, expect, it } from "vitest";
import { BC_CURRICULUM, bcStepProgressions } from "@/lib/workbook-curriculum";
import { HOUSE_TEMPLATES, isChallengeOnly, isTwoStep, withHouseTemplates } from "./house-templates";
import { stepFieldProblems } from "./step-source";
import { prepareTemplate, seededRandom } from "./template";
import { buildStepItem, challengeTemplateCount, choicesFor, sequenceOf, stepRangeProblem, stepTemplateItem } from "@/lib/workbook-step-items";
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
          expect(filled.text).toMatch(/There are \d acute angles and \d obtuse angles/);
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
            expect(answer).toBe(h.step === 1 ? t.format === "missing" ? n("p") - 2 : t.format === "story" ? n("p") - n("q") : n("p") + n("q")
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
              const low = n("lo"), top = n("top");
              expect(item.text).toContain(`greater than ${low}`);
              expect(item.text).toContain(`less than ${top}`);
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
            if (h.step === 2 && t.format === "missing") expect(item.text).toMatch(/^Count the positive multiples/);
          } else {
            expect(item.answer).toBe(h.step === 1 ? t.format === "bare" ? "yes" : t.format === "compare" ? "B" : "no"
              : t.format === "bare" ? "straight" : t.format === "compare" ? "reflex" : "yes");
            expect(item.text).toMatch(h.step === 1 ? /sides|opening/ : /angles|turn/);
            expect(choicesFor(item.text, item.answer)).toContain(item.answer);
          }
          expect(stepRangeProblem(step, item.text)).toBeNull();
          expect(stepRangeProblem(step, item.answer)).toBeNull();
        }
      }
    }
  });
  it.each(["3.6-increasing-pattern", "3.6-decreasing-pattern"])("checks varied independent tasks for %s across both steps", skill => {
    for (const step of c.skillSteps(skill)!.filter(step => step.number <= 2)) {
      const tasks = step.templates!.filter(t => t.text.includes("Its second number is")
        || t.text.startsWith("The first two numbers in a pattern") || t.text.startsWith("A pattern begins"));
      expect(tasks).toHaveLength(3);
      expect(stepFieldProblems(step, c.contexts).filter(p => !/needs four to six templates/.test(p))).toEqual([]);
      for (const t of tasks) for (let seed = 1; seed <= 200; seed++) {
        const filled = prepareTemplate(step, t, c.contexts).fill(seededRandom(seed));
        const a = Number(filled.values.a), b = Number(filled.values.b), jump = Math.abs(b - a);
        if (t.format === "missing") expect(Number(filled.answer)).toBe(skill.includes("decreasing") ? b + jump : b - jump);
        else if (t.format === "bare") expect(Number(filled.answer)).toBe(jump);
        else {
          expect(["A", "B"]).toContain(filled.answer);
          expect(Number(filled.values[filled.answer === "A" ? "oa" : "ob"])).toBe(jump);
          expect(filled.values.oa).not.toBe(filled.values.ob);
        }
        expect(stepRangeProblem(step, filled.text), filled.text).toBeNull();
        expect(stepRangeProblem(step, filled.answer)).toBeNull();
      }
    }
  });
  it("offers checked zero-placeholder reasoning beyond repeated digit-reading choices", () => {
    const skill = "3.1-place-value-1000";
    const step = c.skillSteps(skill)![1];
    const practice = HOUSE_TEMPLATES.find(h => h.skill === skill && h.step === 2)!.practice!;
    expect(practice).toHaveLength(3);
    for (const [index, t] of practice.entries()) for (let seed = 1; seed <= 200; seed++) {
      const filled = prepareTemplate(step, t, c.contexts).fill(seededRandom(seed));
      const h = Number(filled.values.h), o = Number(filled.values.o);
      if (index === 0) {
        const n = Number(filled.values.n);
        expect(Number(filled.answer)).toBe(n - Math.floor(n / 100) * 100);
        expect(n % 10 === 0 || Math.floor(n / 10) % 10 === 0).toBe(true);
      } else if (index === 1) {
        expect(Number(filled.values.wrong)).not.toBe(h * 100 + o);
        expect(Number(filled.answer)).toBe(h * 100 + o);
      } else {
        expect(Number(filled.answer)).toBe(Math.min(h * 100 + o, h * 100 + o * 10));
      }
      expect(stepRangeProblem(step, filled.text), filled.text).toBeNull();
      expect(stepRangeProblem(step, filled.answer)).toBeNull();
    }
    const numericForms = new Set<number>();
    for (let attempt = 0; attempt < 96; attempt++) {
      const item = stepTemplateItem({ curriculum: c, skill, step: 2, level: 10, day: 4,
        place: "practice-row", learningStage: "independent", seed: 31, ordinal: 2, attempt });
      expect(item).not.toBeNull();
      if (!item) continue;
      expect(item.ref.difficulty).not.toBe("easy");
      expect(isChallengeOnly(step.templates![item.ref.index])).toBe(false);
      const built = buildStepItem(item.ref, item.text, { id: `placeholder-${attempt}`, workbookId: "placeholder-practice",
        page: 30, question: 3, level: 10, skills: [skill] }, "code");
      expect(built.check.status, item.text).toBe("checked");
      if (item.ref.kind === "box") numericForms.add(item.ref.index);
    }
    expect(numericForms.size).toBeGreaterThanOrEqual(3);
  });
  it("fills the normal decreasing-pattern choice in 200 seeds with the checked next term and two distinct choices", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "3.6-decreasing-pattern" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![h.step - 1];
    const choices = h.practice!.filter(t => t.text.startsWith("Start at {a} and subtract"));
    expect(choices).toHaveLength(1);
    for (const t of choices) {
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

describe("Unica's explicit level wording", () => {
  const c = bcStepProgressions();
  it("rewrites only templates whose text is still Cedric's, with their own slots and answer keys, and fills them", async () => {
    const { LEVEL_REWRITES, templateAtLevel } = await import("./house-templates");
    const holes = (s: string) => new Set([...s.matchAll(/\{([A-Za-z_0-9]+)\}/g)].map((m) => m[1]));
    for (const r of LEVEL_REWRITES) {
      const step = c.skillSteps(r.skill)![r.step - 1];
      const t = step.templates![r.template - 1];
      expect(t.text, `${r.skill}#${r.step}.${r.template}`).toBe(r.from);
      expect(r.to).not.toBe(r.from);
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

describe("child-readable Challenge tasks", () => {
  const c = bcStepProgressions();

  it("counts the second future bell coincidence from now, and the next one on a timer", () => {
    for (const stepNumber of [1, 2]) {
      const h = HOUSE_TEMPLATES.find(h => h.skill === "6.4-lcm" && h.step === stepNumber)!;
      const step = c.skillSteps(h.skill)![stepNumber - 1];
      const t = h.templates.find(t => t.format === "story")!;
      for (let seed = 1; seed <= 40; seed++) {
        const item = prepareTemplate(step, t, c.contexts).fill(seededRandom(seed));
        const a = Number(item.values.a), b = Number(item.values.b);
        const coincidences = Array.from({ length: a * b * 2 }, (_, i) => i + 1).filter(s => s % a === 0 && s % b === 0);
        expect(item.text).toContain(`One bell rings every ${a}`);
        expect(item.text).toContain(`Another bell rings every ${b}`);
        if (stepNumber === 1) {
          expect(item.text).toContain("seconds from now");
          expect(item.text).toContain("for the second time, without counting now");
          expect(Number(item.answer)).toBe(coincidences[1]);
        } else {
          expect(item.text).toContain(`minute ${item.values.start} on a timer`);
          expect(item.text).toContain("At what minute on the timer");
          expect(Number(item.answer)).toBe(Number(item.values.start) + coincidences[0]);
        }
      }
    }
  });

  it("defines sides and openings without asking the child to infer a missing angle diagram", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.13-classify-angles" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![0];
    const tasks = h.templates.map(t => prepareTemplate(step, t, c.contexts).fill(seededRandom(1)));
    expect(tasks[0].text).toContain("two sides that meet at a point");
    expect(tasks[0].text).toContain("without changing the opening");
    expect(tasks[0].answer).toBe("yes");
    expect(tasks[1].text).toContain("Angle A has long sides and an opening smaller than a square corner");
    expect(tasks[1].text).toContain("Angle B has short sides and an opening wider than a square corner");
    expect(tasks[1].answer).toBe("B");
    expect(tasks[2].text).toContain("without changing the opening");
    expect(tasks[2].answer).toBe("no");
    for (const task of tasks) {
      expect(task.text).toMatch(/Circle (?:yes or no|A or B)/);
      expect(task.text).not.toMatch(/arms|picture|diagram/);
      expect(choicesFor(task.text, task.answer)).toContain(task.answer);
    }
    expect(new Set(tasks.map(t => t.text)).size).toBe(3);
  });

  it("states a common direction for every composed-turn question", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.13-classify-angles" && h.step === 2)!;
    const step = c.skillSteps(h.skill)![1];
    for (const t of h.templates) {
      const item = prepareTemplate(step, t, c.contexts).fill(seededRandom(1));
      expect(item.text).toContain("in the same direction");
      expect(item.text).toContain("Circle");
      expect(choicesFor(item.text, item.answer)).toContain(item.answer);
    }
  });

  it("gives the prime-card story a different mathematical task from the prime sum", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "6.4-prime-composite" && h.step === 1)!;
    const step = c.skillSteps(h.skill)![0];
    for (let seed = 1; seed <= 40; seed++) {
      const item = prepareTemplate(step, h.templates[2], c.contexts).fill(seededRandom(seed));
      const primes = [Number(item.values.p), Number(item.values.q)];
      expect(item.text).toContain("Subtract the smaller prime from the larger prime");
      expect(Number(item.answer)).toBe(Math.max(...primes) - Math.min(...primes));
      expect(Number(item.answer)).toBeGreaterThan(0);
    }
  });

  it("states what is counted and which estimate to use on all sensible-estimate Challenge forms", () => {
    const h = HOUSE_TEMPLATES.find(h => h.skill === "3.1-estimate-quantity" && h.step === 3)!;
    const step = c.skillSteps(h.skill)![2];
    for (const [i, t] of h.templates.entries()) {
      const item = prepareTemplate(step, t, c.contexts).fill(seededRandom(1));
      expect(item.text).toContain("Use that estimate");
      expect(Number(item.answer)).toBe(Number(item.values.b) * (i + 2));
      if (i === 2) expect(item.text).toContain("short picture books");
    }
    const boxes = HOUSE_TEMPLATES.find(h => h.skill === "3.1-estimate-quantity" && h.step === 2)!;
    const story = prepareTemplate(c.skillSteps(boxes.skill)![1], boxes.templates[2], c.contexts).fill(seededRandom(1));
    expect(story.text).toContain("takes");
    expect(story.text).toContain("out of the boxes");
    expect(Number(story.answer)).toBe(Number(story.values.a) * Number(story.values.g) - Number(story.values.b));
  });
});
