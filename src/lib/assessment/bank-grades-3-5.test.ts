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
  nextQuestion,
  restoreSession,
  storedTest,
  submitAnswer,
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

describe("current provincial curriculum corrections through the public interface", () => {
  it("preserves all 24 fraction-of-set pairs, distractor bounds and province levels", () => {
    const template = BANK.find((t) => t.id === "g35-3-fraction-of-set")!;
    const pairs = new Set<string>(), contexts = new Set<string>();
    const wrongDenominators: number[] = [], partToPart: number[] = [], reciprocals: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const q = fillTemplate(template, i * 7919 + 17, "AB"), { d, n } = q.values;
      expect(q.level).toBe(3);
      expect(d).toBeGreaterThanOrEqual(5);
      expect(d).toBeLessThanOrEqual(10);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(d - 2);
      expect(2 * n).not.toBe(d);
      expect(q.answer).toBe(`${n}/${d}`);
      expect(new Set(q.choices).size).toBe(4);
      pairs.add(`${n}/${d}`);
      contexts.add(q.prompt.match(/There are \d+ (.*?)\./)![1]);
      for (const w of q.wrong) {
        const [a, b] = w.value.split("/").map(Number);
        wrongDenominators.push(b);
        expect(a / b).not.toBe(n / d);
        if (w.misconception === "F4") partToPart.push(a / b);
        if (w.misconception === "fraction-flip") reciprocals.push(a / b);
      }
    }
    expect(pairs.size).toBe(24);
    expect(contexts.size).toBe(5);
    expect([Math.min(...wrongDenominators), Math.max(...wrongDenominators)]).toEqual([2, 10]);
    expect(Math.max(...partToPart)).toBe(4);
    expect(Math.max(...reciprocals)).toBe(5);
    expect(PROVINCES.map((p) => fillTemplate(template, 0, p).level)).toEqual([3, 3, 4, 4, 4, 3]);
  });
  it("preserves all 511 exact-division pairs and province levels", () => {
    const template = BANK.find((t) => t.id === "g35-4-divide")!;
    const pairs = new Set<string>(), dividends: number[] = [], divisors: number[] = [], quotients: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const q = fillTemplate(template, i * 7919 + 17, "ON"), { n, d } = q.values;
      const quotient = Number(q.answer);
      expect(q.level).toBe(4);
      expect(n % d).toBe(0);
      expect(quotient * d).toBe(n);
      expect(quotient % 10).not.toBe(0);
      expect(q.wrong.every((w) => Number(w.value) !== quotient)).toBe(true);
      pairs.add(`${n}/${d}`); dividends.push(n); divisors.push(d); quotients.push(quotient);
    }
    expect(pairs.size).toBe(511);
    expect([Math.min(...dividends), Math.max(...dividends)]).toEqual([100, 891]);
    expect([Math.min(...divisors), Math.max(...divisors)]).toEqual([3, 9]);
    expect([Math.min(...quotients), Math.max(...quotients)]).toEqual([12, 99]);
    expect(PROVINCES.map((p) => fillTemplate(template, 0, p).level)).toEqual([4, 4, 5, 5, 4, 4]);
  });
  /** The first seed whose stage 1 asks this template, so the test does not depend on how the bank fills stage 1. */
  const sessionWith = (grade: Grade, province: Province, templateId: string) => {
    for (let seed = 0; seed < 500; seed++) {
      const session = createSession({ grade, province }, seed);
      const question = session.stage1.find((q) => q.templateId === templateId);
      if (question) return { session, question };
    }
    throw new Error(`no stage 1 in ${province} grade ${grade} asks ${templateId}`);
  };
  it.each(["AB", "ON"] as const)("asks three-digit exact division in %s grade 4 and marks it before routing up", (province) => {
    const found = sessionWith(4, province, "g35-4-divide");
    let session = found.session;
    const { question } = found;
    // The child's answer comes from the numbers on the screen, not from the stored answer.
    const [dividend, divisor] = question.prompt.replace(/\s/g, " ").match(/^(\d+) ÷ (\d+) = \?$/)!.slice(1).map(Number);
    expect(dividend).toBeGreaterThanOrEqual(100);
    expect(question.level).toBe(4);
    for (const q of session.stage1) {
      session = submitAnswer(session, { questionId: q.id, response: q === question ? String(dividend / divisor) : q.answer, timeMs: 10000 });
    }
    expect(session.answers.find((a) => a.questionId === question.id)?.correct).toBe(true);
    expect(session.route).toBe("up");
    expect(nextQuestion(session)?.level).toBe(5);
  });
  it("asks a fraction of a set in Alberta grade 3 and marks the answer on the upward route", () => {
    const found = sessionWith(3, "AB", "g35-3-fraction-of-set");
    let session = found.session;
    const { question } = found;
    const [total, part] = question.prompt.match(/^There are (\d+) .*?\. (\d+) of them/)!.slice(1);
    expect(question.level).toBe(3);
    for (const q of session.stage1) {
      session = submitAnswer(session, { questionId: q.id, response: q === question ? `${part}/${total}` : q.answer, timeMs: 10000 });
    }
    expect(session.answers.find((a) => a.questionId === question?.id)?.correct).toBe(true);
    expect(session.route).toBe("up");
    expect(nextQuestion(session)?.level).toBe(4);
  });
});

describe("grade 3-5 speech and figures through the public interface", () => {
  it("keeps misconception codes within the answer storage limit for new and reused templates", () => {
    const templates = new Map(Object.values(BANKS).flat().map((t) => [t.id, t]));
    for (const t of templates.values()) {
      for (const seed of SEEDS) {
        for (const w of fillTemplate(t, seed).wrong) {
          expect(w.misconception.length, `${t.id}, seed ${seed}: ${w.misconception}`).toBeLessThanOrEqual(20);
          expect(MISCONCEPTIONS[w.misconception]).toBeDefined();
        }
      }
    }
  });
  it.each([false, true])("stores the compensation error and advances on the Ontario down route (legacy snapshot: %s)", (legacy) => {
    // The first seed whose Ontario grade 3 down form asks the make-ten strategy, so the test does not depend on how
    // the bank fills the form.
    const seed = Array.from({ length: 500 }, (_, i) => i)
      .find((s) => createSession({ grade: 3, province: "ON" }, s).stage2.down.some((q) => q.templateId === "2-make-ten-strategy"))!;
    let session = createSession({ grade: 3, province: "ON" }, seed);
    const target = session.stage2.down.find((q) => q.templateId === "2-make-ten-strategy")!;
    const position = session.stage2.down.indexOf(target);
    while (nextQuestion(session)?.id !== target.id) {
      const q = nextQuestion(session)!;
      expect(q).not.toBeNull();
      session = submitAnswer(session, { questionId: q.id, response: "no idea", timeMs: 1000 });
    }
    const isCompensation = (w: { misconception: string }) => w.misconception === "compensation-dir";
    if (legacy) {
      // A test stored before the code was shortened keeps the old 22-character code.
      const stored = structuredClone(storedTest(session));
      const q = stored.stage2.down.find((q) => q.id === target.id)!;
      q.wrong.find(isCompensation)!.misconception = "compensation-direction";
      session = restoreSession(stored, session.answers.map((a) => ({
        questionId: a.questionId, response: a.response, timeMs: a.timeMs,
      })));
    }
    const q = nextQuestion(session)!;
    expect(q.templateId).toBe("2-make-ten-strategy");
    expect(q.prompt.replace(/\s/g, " ")).toMatch(/^Which is the same as \d+ \+ \d+\?$/);
    const wrong = target.wrong.find(isCompensation)!;
    const after = submitAnswer(session, { questionId: q.id, response: wrong.value, timeMs: 1000 });
    expect(after.answers.at(-1)).toMatchObject({ correct: false, misconception: "compensation-dir" });
    expect(after.answers.at(-1)!.misconception!.length).toBeLessThanOrEqual(20);
    expect(nextQuestion(after)?.id).toBe(position + 1 < session.stage2.down.length ? session.stage2.down[position + 1].id : undefined);
  });
  it("keeps the Ontario grade 2 downward forms suited to all five required drawings", () => {
    expect(BANK.find((t) => t.id === "2-missing-in-pattern")?.whiteboard).toBe(true);
    for (const seed of SEEDS.slice(0, 100)) {
      const s = createSession({ grade: 2, province: "ON" }, seed);
      const questions = [...s.stage1, ...s.stage2.down];
      expect(questions.filter((q) => q.showWork), `seed ${seed}`).toHaveLength(5);
      expect(questions.filter((q) => q.showWork).every((q) => q.whiteboard), `seed ${seed}`).toBe(true);
    }
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
  it("speaks each shuffled money choice symbol by symbol, never as the amount the question names", () => {
    for (const seed of SEEDS) {
      const money = fillTemplate(BANK.find((t) => t.id === "g35-4-money-notation")!, seed);
      const spoken = spokenChoices(toPublicQuestion(money), money.choices!);
      // The question says the amount in words; a choice that said it too would give the answer to a listener.
      for (const text of spoken) expect(text).not.toMatch(/dollars? and \d+ cents?|meaning/);
      for (const [i, choice] of money.choices!.entries()) {
        const [dollars, cents] = choice.slice(1).split(".");
        expect(spoken[i]).toContain(`dollar sign ${dollars}${cents ? ` point ${cents.split("").join(" ")}` : ""}`);
      }
      expect(new Set(spoken).size).toBe(spoken.length);
      expect(new Set(money.choices!.map((c) => Number(c.slice(1)))).size).toBe(money.choices!.length);
    }
  });
  it("codes joined dollar and cent counts as a whole-dollar concatenation", () => {
    const t = BANK.find((t) => t.id === "g35-4-money-notation")!;
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed);
      expect(q.wrong.find((w) => w.value === `$${q.values.d}${q.values.c}`)?.misconception).toBe("money-join");
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
  it("uses a later Ontario grade for a repeated-addend equation above 50, and grade 4 division to undo a machine", () => {
    const repeated = BANK.find((t) => t.id === "g35-4-three-same")!;
    const machine = BANK.find((t) => t.id === "g35-4-machine-input")!;
    expect(repeated.grades.ON).toBe(5);
    expect(machine.grades.ON).toBe(4);
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

// #75 acceptance: corrections from the checker findings, each checked against the current official curriculum
// (scripts/template-check/triage.md cites the outcome for every row).
describe("primary-source corrections from the #75 checker run", () => {
  const byId = (id: string) => BANK.find((t) => t.id === id)!;
  const levels = (id: string) => PROVINCES.map((p) => fillTemplate(byId(id), 0, p).level);
  // Every number the child reads or must find: the prompt's numbers and the answer.
  const numbersIn = (id: string) => SEEDS.flatMap((seed) => {
    const q = fillTemplate(byId(id), seed);
    return [...`${q.prompt} ${q.answer}`.matchAll(/\d+/g)].map((m) => Number(m[0]));
  });

  // Review-flag triage (scripts/template-check/triage.md): [id, BC, AB, SK, MB, ON, other].
  it.each([
    ["g35-4-make-change", [4, 4, 4, 4, 5, 4]], // ON4 F1.2 whole dollars only
    ["g35-4-multiple", [4, 4, 6, 6, 6, 4]], // AB MAT4-OI1-GQ3-LO1-KO1-SP multiples within 100
    ["g35-4-tenths-order", [4, 4, 5, 5, 4, 4]], // SK N5.6, MB 5.N.10 first compare and order decimals
    ["g35-4-compare-like", [4, 4, 4, 3, 5, 4]], // MB 3.N.13; ON4 B1.4 stops at tenths
    ["g35-4-compare-unit", [4, 4, 4, 4, 5, 4]],
    ["g35-4-benchmark", [4, 3, 4, 4, 5, 4]], // AB grade 3 benchmarks 0, 1/2, 1
    ["g35-4-compare-decimals", [4, 4, 5, 5, 5, 4]], // AB MAT4-OI1-GQ1-LO1-KO1-SP
    ["g35-4-money-notation", [4, 4, 4, 4, 5, 4]], // ON5 F1.2 note: currency notation
    ["g35-4-more-than-half", [4, 4, 4, 4, 6, 4]], // 13ths pass ON5 B1.4
    ["g35-4-decreasing-table", [4, 4, 4, 3, 4, 4]], // MB 3.PR.2
    ["g35-4-table-rule", [4, 5, 4, 4, 4, 4]], // AB MAT5-OI6-GQ1-LO1-KO1-SP
    ["g35-5-remainder", [5, 4, 5, 5, 5, 5]], // AB MAT4-OI1-GQ4-LO1-KO1-SP
    ["g35-5-full-groups", [5, 4, 5, 5, 4, 5]], // and ON4 B2.6
    ["g35-5-distributive", [5, 4, 4, 5, 4, 5]], // AB4, SK N4.4, ON4 B2.5 with B2.1
    ["g35-5-change-large", [5, 4, 5, 4, 5, 5]], // AB MAT4-OI1-GQ2-LO1 money within 10 000
    ...["numerator", "denominator", "scale-up", "scale-down", "region", "number-line"].map((task) =>
      [`g35-5-equivalent-${task}`, [5, 4, 5, 5, 6, 5]] as const), // AB MAT4-OI1-GQ5-LO1-KO1-SP; ON5 B1.3 stops at twelfths
    ["g35-5-fraction-to-hundredths", [5, 6, 5, 5, 5, 5]], // SK N5.6 with N5.5, MB 5.N.9 with 5.N.7
    ["g35-5-equivalent-decimal", [5, 4, 5, 5, 5, 5]], // AB grade 4 decimal equivalence key idea
    ["g35-5-pattern-next", [3, 4, 2, 2, 4, 3]], // AB MAT4-OI6-GQ1-LO1-KO2-SP, SK P2.2, MB 2.PR.2
    ["g35-5-pattern-missing", [3, 4, 2, 2, 4, 3]],
    ["g35-5-pattern-step", [3, 3, 2, 2, 3, 3]], // AB MAT3-OI6-GQ1-LO1-KO2-SP, ON3 C1.1
    ...["add", "subtract", "take-away", "multiply", "divide", "divisor"].map((op) =>
      [`g35-5-evaluate-${op}`, [5, 5, 6, 7, 5, 5]] as const), // SK P6.3, MB 7.PR.5 first evaluate expressions
    ...["rows", "cards-total", "cards-left", "sharing"].map((task) => [`g35-5-expression-${task}`, [5, 5, 6, 7, 5, 5]] as const),
    ["g35-5-square-area", [5, 5, 5, 5, 5, 5]], // sides to 19: AB MAT5-OI1-GQ4 and ON5 B2.6 two-digit by two-digit
    ["g35-5-end-time", [5, 4, 4, 4, 4, 5]], // AB MAT4-OI7-GQ1-LO1-KO1-SP, SK SS4.1, MB 4.SS.1
    ["g35-5-prism-faces", [5, 4, 4, 3, 3, 5]], // AB MAT4-OI3-GQ1-LO1-KO1-SP, SK SS4.3, MB 3.SS.6, ON3 E1.1
    ["g35-5-pyramid-faces", [5, 4, 3, 3, 3, 5]], // SK SS3.4, MB 3.SS.6, ON3 E1.1
    ["g35-5-transformation", [5, 2, 5, 5, 5, 5]], // AB MAT2-OI3-GQ1-LO1-KO2
    ["g35-5-double-bar-difference", [5, 5, 5, 5, 4, 5]], // ON4 D1.6 multiple-bar graphs
    ["g35-5-pictograph-total", [5, 4, 4, 4, 3, 5]], // AB MAT4-OI8-GQ1-LO1-KO2-SP, SK SP4.1, MB 4.SP.2, ON3 D1.3
  ] as const)("%s uses the grade where each province's curriculum teaches it", (id, expected) => {
    expect(levels(id)).toEqual([...expected]);
  });
  it.each(["g35-4-bar-scale", "g35-5-double-bar-difference"])("%s: the voice does not read the bar values, so reading the graph stays the skill (#79)", (id) => {
    for (const seed of SEEDS) {
      const q = fillTemplate(byId(id), seed);
      for (const bar of q.figure!.bars) expect(q.readAloud).not.toMatch(new RegExp(`\\b${bar.value}\\b`));
      expect(q.readAloud).toContain("Look at the graph.");
    }
  });
  it("asks the area of a rectangle with two-digit sides at grade 5 everywhere, and codes the place-pair product", () => {
    // Two-digit by two-digit products: AB MAT5-OI1-GQ4, SK and MB grade 5, ON5 B2.6; area in square units, BC 5.12.
    expect(levels("g35-5-area-two-digit")).toEqual([5, 5, 5, 5, 5, 5]);
    for (const seed of SEEDS) {
      const q = fillTemplate(byId("g35-5-area-two-digit"), seed), { a, b } = q.values;
      expect(Math.min(a, b)).toBeGreaterThanOrEqual(11);
      expect(q.answer).toBe(String(a * b));
      const pairs = Math.floor(a / 10) * Math.floor(b / 10) * 100 + (a % 10) * (b % 10);
      if (pairs !== a * b) expect(q.wrong.find((w) => w.value === String(pairs))?.misconception).toBe("place-pairs");
    }
  });
  it("asks for a thousandths decimal between two hundredths, with only the answer inside the interval", () => {
    // AB MAT5-OI1-GQ1-LO1-KO1-SP (a decimal between two decimals), SK N5.6, MB 5.N.10; ON thousandths are grade 6.
    expect(levels("g35-5-decimal-between")).toEqual([5, 5, 5, 5, 6, 5]);
    for (const seed of SEEDS) {
      const q = fillTemplate(byId("g35-5-decimal-between"), seed);
      const [low, high] = q.prompt.match(/between (\d+\.\d+) and (\d+\.\d+)/)!.slice(1).map(Number);
      expect(q.choices!.filter((c) => Number(c) > low && Number(c) < high)).toEqual([q.answer]);
      expect(q.answer).toMatch(/^\d+\.\d{3}$/);
    }
  });
  it("asks which rectangle with one area has the greatest or least perimeter", () => {
    // AB MAT5-OI5-GQ1-LO1-KO1-SP, SK SS5.1, MB 5.SS.1, BC 5.13; ON4 E2.7 relates area and perimeter.
    expect(levels("g35-5-same-area-perimeter")).toEqual([5, 5, 5, 5, 4, 5]);
    for (const seed of SEEDS) {
      const q = fillTemplate(byId("g35-5-same-area-perimeter"), seed);
      const perimeter = (c: string) => { const [a, b] = c.match(/(\d+) cm by (\d+) cm/)!.slice(1).map(Number); return 2 * (a + b); };
      const values = q.choices!.map(perimeter), best = /greatest/.test(q.prompt) ? Math.max(...values) : Math.min(...values);
      expect(values.filter((v) => v === best)).toHaveLength(1);
      expect(perimeter(q.answer)).toBe(best);
    }
  });
  it("keeps the closest-to-one-whole fractions within twelfths (ON5 B1.4)", () => {
    expect(Math.max(...SEEDS.map((seed) => fillTemplate(byId("g35-5-fraction-near-whole"), seed).values.d))).toBeLessThanOrEqual(12);
  });
  it("speaks a tenths decimal digit by digit, so the question does not name the place", () => {
    for (const task of ["value", "fraction"]) {
      for (const seed of SEEDS) expect(fillTemplate(byId(`g35-4-tenths-${task}`), seed).readAloud).not.toMatch(/tenth/);
    }
  });

  it.each(["g35-5-variable-add", "g35-5-variable-subtract", "g35-5-variable-take-away", "g35-6-equation-add", "g35-6-equation-subtract", "g35-6-equation-subtrahend"])(
    "%s: a one-step addition or subtraction equation within 100 meets AB, SK and MB children at grade 3", (id) => {
      // AB MAT3-OI2-GQ1-LO1-KO2-SP, SK3 one-step addition and subtraction equations, MB 3.PR.3; Ontario stays at grade 2.
      expect(levels(id).slice(1, 5)).toEqual([3, 3, 3, 2]);
      expect(Math.max(...numbersIn(id))).toBeLessThanOrEqual(100);
    });
  it.each(["g35-5-variable-multiply", "g35-5-variable-divide", "g35-5-variable-dividend", "g35-6-equation-multiply", "g35-6-equation-divide", "g35-6-equation-divisor"])(
    "%s: a one-step multiplication or division equation past 100 meets Alberta children at grade 4", (id) => {
      // AB MAT4-OI2-GQ1-LO1-KO2-SP (one-operation equations) with grade 4 three-digit by one-digit operations.
      expect(levels(id)[1]).toBe(4);
      expect(Math.max(...numbersIn(id))).toBeGreaterThan(100);
      expect(Math.max(...numbersIn(id))).toBeLessThan(1000);
    });
  it.each(["g35-4-missing-factor", "g35-4-missing-divisor"])("%s: a missing factor or divisor within 100 meets Alberta children at grade 3", (id) => {
    // AB MAT3-OI1-GQ3-LO1-KO2-SP: determine a missing quantity in a product or quotient, products and dividends to 100.
    expect(levels(id)[1]).toBe(3);
    expect(Math.max(...numbersIn(id))).toBeLessThanOrEqual(100);
  });
  it("asks the number-machine input in Ontario grade 4, where division undoes multiplication", () => {
    // ON4 B2.1 (inverse operations) and B2.6 (divide two- and three-digit numbers by one-digit numbers).
    expect(levels("g35-4-machine-input")[4]).toBe(4);
  });
  it("tags the equation for a subtraction story at the grades that write one-operation equations", () => {
    // AB MAT3-OI2-GQ1-LO1-KO2-SP (solve problems using equations), SK4 and MB 4.PR.5 (express a problem as an equation).
    expect(levels("g35-5-equation-story")).toEqual([5, 3, 4, 4, 2, 5]);
  });
  it.each(["g35-6-mixed-to-mixed", "g35-6-mixed-to-improper", "g35-6-mixed-whole-count", "g35-6-mixed-remainder"])(
    "%s: improper fractions and mixed numbers to twelfths meet AB and ON children at grade 5", (id) => {
      // AB MAT5-OI1-GQ5-LO1-KO1-SP; ON5 B1.3 (halves through twelfths). SK N6.7 and MB 6.N.4 stay at grade 6.
      expect(levels(id)).toEqual([6, 5, 6, 6, 5, 6]);
      expect(Math.max(...SEEDS.map((seed) => fillTemplate(byId(id), seed).values.d))).toBeLessThanOrEqual(12);
    });
  it.each(["g35-6-linear-output", "g35-6-linear-initial", "g35-6-linear-difference"])("%s: substituting into a rule meets Alberta children at grade 5", (id) => {
    // AB MAT5-OI2-GQ1-LO1-KO2-SP: evaluate an algebraic expression by substituting a given number for the variable.
    expect(levels(id)[1]).toBe(5);
  });
  it("asks which point fits a two-operation rule, at grade 6 in Alberta and grade 5 in Ontario", () => {
    // AB MAT6-OI6-GQ1-LO1-KO1-SP (function values as points; AB5 rules are limited to one operation), ON5 C1.2.
    const t = byId("g35-6-rule-point");
    expect(levels("g35-6-rule-point")).toEqual([6, 6, 6, 6, 5, 6]);
    for (const seed of SEEDS) {
      const q = fillTemplate(t, seed), { k, b } = q.values;
      const fits = (c: string) => { const [x, y] = c.slice(1, -1).split(", ").map(Number); return y === k * x + b; };
      expect(q.choices?.filter(fits)).toEqual([q.answer]);
      expect(q.wrong.map((w) => w.misconception).sort()).toEqual(["A5", "add-before-multiply", "coordinates-swap"]);
    }
  });
  it("places the missing pattern term with the other simple constant-step pattern tasks, at BC grade 3", () => {
    const t = byId("g35-5-pattern-missing");
    expect(t.grades.BC).toBe(3);
    expect(t.standard).toBe("3.6");
  });
  it("codes subtracting the end minutes from the start minutes as its own elapsed-time error", () => {
    const t = byId("g35-5-duration");
    // A coded value equal to the answer or to another coded value is left out, so look at the seeds that keep it.
    const codes = SEEDS.flatMap((seed) => {
      const q = fillTemplate(t, seed), { start, end } = q.values;
      return q.wrong.filter((w) => w.value === String(start - end)).map((w) => w.misconception);
    });
    expect(codes.length).toBeGreaterThan(SEEDS.length / 2);
    expect(new Set(codes)).toEqual(new Set(["minutes-reversed"]));
    expect(MISCONCEPTIONS["minutes-reversed" as keyof typeof MISCONCEPTIONS]?.description).toMatch(/start/);
  });
  it("codes the estimate for the other colour as a count for the other outcome, not a probability", () => {
    const t = byId("g35-6-experimental-estimate");
    const codes = SEEDS.flatMap((seed) => {
      const q = fillTemplate(t, seed), { total, red, k } = q.values;
      return q.wrong.filter((w) => w.value === String((total - red) * k)).map((w) => w.misconception);
    });
    expect(codes.length).toBeGreaterThan(SEEDS.length / 2);
    expect(new Set(codes)).toEqual(new Set(["count-other"]));
    expect(MISCONCEPTIONS["count-other" as keyof typeof MISCONCEPTIONS]?.description).toMatch(/other outcome/);
  });
});
