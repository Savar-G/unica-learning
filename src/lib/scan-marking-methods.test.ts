import { describe, expect, it } from "vitest";
import { METHOD_TEMPLATES, checkMethodReading, differentStrategies, methodBan, methodRuleFor, questionShape, suppliedMethodText, type MethodJudgment } from "./scan-marking-methods";

const rule = (question: string, answer: string) => methodRuleFor(question, null, answer);
const check = (text: string, r: ReturnType<typeof rule>, judgment: MethodJudgment | null = "solves") => checkMethodReading(text, r, judgment);
/** A pair is Right only when both methods are valid and their templates differ. */
const pairRight = (q: string, answer: string, one: string, two: string) => {
  const r = rule(q, answer), a = check(one, r), b = check(two, r);
  return a.verdict === "valid" && b.verdict === "valid" && differentStrategies(r.shape!, a.kind!, b.kind!);
};

// The first book's 7 two-ways questions (round 9, contract bfc5542e): page, question, answer.
const BOOK = [
  ["p14", "8 × ? = 800", "100"], ["p22", "7 × 360 = ?", "2520"], ["p38", "60 × ? = 4800", "80"], ["p46", "70 × ? = 50400", "720"],
  ["p54", "50 × ? = 1000", "20"], ["p70", "20 × ? = 3000", "150"], ["p78", "50 × 80 = ?", "4000"],
] as const;

const zerosOf = (n: number) => { let z = 0; while (n % 10 === 0 && n > 0) { n /= 10; z++; } return z; };
const parts = (n: number) => [...String(n)].flatMap((d, i, all) => d === "0" ? [] : [Number(d) * 10 ** (all.length - 1 - i)]);
const product = (q: string) => /^(\d+) × (\d+) = \?$/.exec(q);
const missing = (q: string) => /^(\d+) × \? = (\d+)$/.exec(q);
/** A genuine instance of each template for a question, or null when the template cannot exist there. */
const GENUINE: Record<string, (q: string, answer: number) => string | null> = {
  "split-place": (q, ans) => {
    const m = product(q); if (!m) return null;
    for (const [f, o] of [[+m[1], +m[2]], [+m[2], +m[1]]]) {
      const ps = parts(o);
      if (ps.length >= 2) return `${ps.map(p => `${f} × ${p} = ${f * p}`).join("\n")}\n${ps.map(p => f * p).join(" + ")} = ${ans}`;
    }
    return null;
  },
  "strip-zeros": (q, ans) => {
    const m = product(q); if (!m) return null;
    const [t, g] = zerosOf(+m[1]) > 0 ? [+m[1], +m[2]] : [+m[2], +m[1]], c = t / 10 ** zerosOf(t);
    return `${c} × ${g} = ${c * g}\n${c * g} × ${10 ** zerosOf(t)} = ${ans}`;
  },
  "round-up": (q, ans) => {
    const m = product(q); if (!m) return null;
    const a = +m[1], b = +m[2];
    for (const [g, h] of [[a, b], [b, a]]) {
      const step = g % 10 ? 10 : g % 100 ? 100 : 0, r = Math.ceil(g / step) * step, d = r - g;
      if (step && d >= 2 && ![a, b, ans].includes(d)) return `${r} × ${h} = ${r * h}\n${d} × ${h} = ${d * h}\n${r * h} - ${d * h} = ${ans}`;
    }
    return null;
  },
  divide: (q, ans) => { const m = missing(q); return m ? `${m[2]} ÷ ${m[1]} = ${ans}` : null; },
  "build-up": (q, ans) => {
    const m = missing(q); if (!m) return null;
    const k = +m[1], ms = parts(ans).length >= 2 ? parts(ans) : [ans / 2, ans / 2];
    return `${ms.map(x => `${k} × ${x} = ${k * x}`).join("\n")}\n${ms.map(x => k * x).join(" + ")} = ${m[2]}\n${ms.join(" + ")} = ${ans}`;
  },
  "skip-count": (q, ans) => { const m = missing(q); return m ? `${Array.from({ length: ans }, (_, i) => +m[1] * (i + 1)).join(", ")}\n${ans} times` : null; },
  "repeated-subtraction": (q, ans) => {
    const m = missing(q); if (!m) return null;
    const k = +m[1], t = +m[2];
    return `${Array.from({ length: ans }, (_, i) => `${t - i * k} - ${k} = ${t - (i + 1) * k}`).join("\n")}\n${ans} times`;
  },
};
const ALL_TEMPLATES = Object.values(METHOD_TEMPLATES).flat();

describe("the question's shape", () => {
  it.each([
    ["8 × ? = 800", { kind: "missing-factor", by: 8, target: 800 }], ["? × 8 = 800", { kind: "missing-factor", by: 8, target: 800 }],
    ["7 × 360 = ?", { kind: "multiply", a: 7, b: 360 }], ["800 ÷ ? = 8", { kind: "missing-divisor", target: 800, quotient: 8 }],
    ["? ÷ 8 = 100", { kind: "missing-dividend", by: 8, quotient: 100 }], ["Liam has 7 boxes of 360 cards.", null], ["8 × ? = 800 and 7 × ? = 70", null],
  ])("reads %j from the printed equation only", (text, shape) => expect(questionShape(text)).toEqual(shape));
});

describe("each template on the book's 7 questions", () => {
  for (const template of ALL_TEMPLATES) {
    it.each(BOOK)(`${template} on %s (%s)`, (_page, q, answer) => {
      const text = GENUINE[template](q, Number(answer)), r = rule(q, answer);
      if (text === null) {
        // The template cannot exist on this question: the other templates' work is not it.
        for (const other of ALL_TEMPLATES) {
          const t = GENUINE[other](q, Number(answer));
          if (t !== null) expect(check(t, r).kind).not.toBe(template);
        }
        return;
      }
      expect(check(text, r)).toEqual({ verdict: "valid", kind: template });
      expect(check(text, r, "unsure").verdict).toBe("unknown");
      expect(check(text, r, null).verdict).toBe("unknown");
      expect(check(text, r, "does-not-solve").verdict).toBe("invalid");
    });
  }
  it.each(BOOK)("has a genuine pair of two different templates that is Right on %s (%s)", (_page, q, answer) => {
    const texts = ALL_TEMPLATES.map(t => GENUINE[t](q, Number(answer))).filter((t): t is string => t !== null);
    expect(texts.length).toBeGreaterThanOrEqual(2);
    expect(pairRight(q, answer, texts[0], texts[1])).toBe(true);
    // The same template twice is never two ways.
    expect(pairRight(q, answer, texts[0], texts[0])).toBe(false);
  });
  it.each(BOOK)("gives %s (%s) two made-up methods of different templates", (_page, q, answer) => {
    const r = rule(q, answer);
    expect(pairRight(q, answer, suppliedMethodText(r, 0), suppliedMethodText(r, 1))).toBe(true);
  });
  it("gives the comparison fixture 8 × ? = 3440 two made-up methods of different templates", () => {
    const r = rule("8 × ? = 3440", "430");
    expect(pairRight("8 × ? = 3440", "430", suppliedMethodText(r, 0), suppliedMethodText(r, 1))).toBe(true);
    expect(check("8 × 400 = 3200\n8 × 30 = 240\n3200 + 240 = 3440\n400 + 30 = 430", r).kind).toBe("build-up");
  });
});

describe("every other shape goes to our team", () => {
  it.each([
    ["1 × ? = 7", "7", "7 ÷ 1 = 7", "1, 2, 3, 4, 5, 6, 7\n7 times"], ["? ÷ 1 = 7", "7", "7 × 1 = 7", "1 + 1 + 1 + 1 + 1 + 1 + 1 = 7"],
    ["800 ÷ ? = 8", "100", "800 ÷ 8 = 100", "8 × 50 = 400\n8 × 50 = 400\n400 + 400 = 800\n50 + 50 = 100"],
    ["100 ÷ ? = 10", "10", "100 ÷ 10 = 10", "10, 20, 30, 40, 50, 60, 70, 80, 90, 100\n10 times"],
    ["? - 47 = 36", "83", "36 + 47 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["36 + 47 = ?", "83", "36 + 40 = 76\n76 + 7 = 83", "36 + 50 = 86\n86 - 3 = 83"],
    ["5 × ? = 25", "5", "25 ÷ 5 = 5", "5, 10, 15, 20, 25\n5 times"], ["10 × ? = 100", "10", "100 ÷ 10 = 10", "10, 20, 30, 40, 50, 60, 70, 80, 90, 100\n10 times"],
    ["6 × 100 = ?", "600", "6 × 1 = 6\n6 × 100 = 600", "100 + 100 + 100 + 100 + 100 + 100 = 600"], ["7 × 365 = ?", "2555", "7 × 300 = 2100\n7 × 60 = 420\n7 × 5 = 35\n2100 + 420 + 35 = 2555", "7 × 300 = 2100\n7 × 65 = 455\n2100 + 455 = 2555"],
    ["64 ÷ 8 = ?", "8", "8 × 8 = 64\n64 ÷ 8 = 8", "64 - 8 = 56\n56 - 8 = 48\n48 - 8 = 40\n40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n8 times"],
    ["Liam has 7 boxes of 360 cards. How many cards?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520", "36 × 7 = 252\n252 × 10 = 2520"],
  ])("%s has no template", (q, answer, one, two) => {
    const r = rule(q, answer);
    expect([check(one, r).verdict, check(two, r).verdict]).toEqual(["unknown", "unknown"]);
    expect(methodBan(one, r)).toBe("unsupported-question");
  });
  it("still marks a false step on any shape Wrong", () => {
    expect(check("36 + 40 = 77\n77 + 7 = 84", rule("36 + 47 = ?", "83")).verdict).toBe("invalid");
  });
});

describe("the bans, each by its exact form", () => {
  it("bans the answer as an operand anywhere, the final line included", () => {
    for (const [q, answer, text] of [
      ["7 × 360 = ?", "2520", "2520 - 2100 = 420\n2100 + 420 = 2520"], ["8 × ? = 800", "100", "100 + 700 = 800"],
      ["60 × ? = 4800", "80", "4800 ÷ 80 = 60"], ["50 × ? = 1000", "20", "1000 ÷ 20 = 50"],
    ] as const) {
      expect(methodBan(text, rule(q, answer))).toBe("answer-operand");
      expect(check(text, rule(q, answer)).verdict).toBe("unknown");
    }
  });
  it.each([
    ["× 1", "7 × 360 = ?", "2520", "36 × 7 × 1 = 252\n252 × 10 = 2520"], ["1 ×", "7 × 360 = ?", "2520", "1 × 36 × 7 = 252\n252 × 10 = 2520"],
    ["÷ 1", "8 × ? = 800", "100", "800 ÷ 8 ÷ 1 = 100"], ["+ 0", "7 × 360 = ?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 + 0 = 2520"],
    ["- 0", "7 × 360 = ?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 - 0 = 2520"],
    ["+ n - n in one line", "7 × 360 = ?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 + 5 - 5 = 2520"],
    ["+ n then - n", "8 × ? = 800", "100", "8 × 50 = 400\n8 × 50 = 400\n400 + 400 = 800\n50 + 7 = 57\n57 - 7 = 50"],
    ["× n then ÷ n", "7 × 360 = ?", "2520", "36 × 7 = 252\n252 × 5 = 1260\n1260 ÷ 5 = 252\n252 × 10 = 2520"],
    ["÷ 1 as a division with tens", "10 × ? = 500", "50", "50 ÷ 1 = 50"],
  ])("bans padding: %s", (_name, q, answer, text) => {
    // 7 × 360 forbids any division as a reverse check first, so "× n then ÷ n" may report either ban.
    expect(["padding", "reverse-check"]).toContain(methodBan(text, rule(q, answer)));
    expect(check(text, rule(q, answer)).verdict).toBe("unknown");
  });
  it("bans a core of 1: a factor that is a power of ten has no strip, and a division by a core of 1 has no template", () => {
    expect(methodBan("6 × 1 = 6\n6 × 100 = 600", rule("6 × 100 = ?", "600"))).toBe("unsupported-question");
    expect(methodBan("2 × 10 = 20\n20 × 10 = 200", rule("20 × 10 = ?", "200"))).toBe("unsupported-question");
    // 10 × ? = 500: 500 ÷ 10 is the inverse; "50 ÷ 1" takes the zero off 10 and leaves a core of 1.
    expect(check("500 ÷ 10 = 50", rule("10 × ? = 500", "50")).kind).toBe("divide");
    expect(check("50 ÷ 1 = 50", rule("10 × ? = 500", "50")).verdict).toBe("unknown");
  });
  it.each([
    ["7 × 360 = ?", "2520", "7 × 360 = 2520"], ["7 × 360 = ?", "2520", "360 × 7 = 2520"],
    ["7 × 360 = ?", "2520", "7 × 36 = 252\n252 × 10 = 2520\n360 × 7 = 2520"], ["50 × 80 = ?", "4000", "80 × 100 = 8000\n80 × 50 = 4000\n8000 - 4000 = 4000"],
    ["8 × ? = 800", "100", "8 × 100 = 800"], ["8 × ? = 800", "100", "100 × 8 = 800"],
  ])("bans the filled-in question in either order: %s %j", (q, answer, text) => {
    expect(methodBan(text, rule(q, answer))).toBe("filled-in");
    expect(check(text, rule(q, answer)).verdict).toBe("unknown");
  });
  it.each([
    ["8 × ? = 3440", "430", "8 × 43 = 344\n344 × 10 = 3440\n43 × 10 = 430"], ["60 × ? = 4800", "80", "60 × 8 = 480\n480 × 10 = 4800\n8 × 10 = 80"],
    ["20 × ? = 3000", "150", "20 × 15 = 300\n300 × 10 = 3000\n15 × 10 = 150"], ["60 × ? = 4800", "80", "6 × 8 = 48\n48 × 100 = 4800"],
    ["7 × 360 = ?", "2520", "2520 ÷ 7 = 360"], ["7 × 360 = ?", "2520", "252 ÷ 7 = 36\n36 × 10 = 360"],
  ])("bans every reverse check, with the answer's zeros taken off too: %s %j", (q, answer, text) => {
    expect(methodBan(text, rule(q, answer))).toBe("reverse-check");
    expect(check(text, rule(q, answer)).verdict).toBe("unknown");
  });
  it("bans an extra line after a valid template", () => {
    const r = rule("7 × 360 = ?", "2520"), base = "36 × 7 = 252\n252 × 10 = 2520";
    expect(check(base, r).kind).toBe("strip-zeros");
    for (const extra of [`${base}\n2520`, `${base}\n2 × 3 = 6`, `5 × 5 = 25\n${base}`, `${base}\nso 2520`]) expect(check(extra, r).verdict).toBe("unknown");
    const m = rule("8 × ? = 800", "100");
    expect(check("800 ÷ 8 = 100", m).kind).toBe("divide");
    expect(check("800 ÷ 8 = 100\n100", m).verdict).toBe("unknown");
  });
  it("bans a run-on chain", () => {
    const r = rule("7 × 360 = ?", "2520");
    expect(methodBan("36 × 7 = 252 × 10 = 2520", r)).toBe("not-a-step");
    expect(check("36 × 7 = 252 × 10 = 2520", r).verdict).toBe("unknown");
  });
  it.each(["36 × 7 = ?\n252 × 10 = 2520", "36 × 7 = 252\n_ × 10 = 2520", "36 × 7 = 252\n252 × 10 = 2520 = ?"])("bans ? or _ in a line: %j", text => {
    expect(methodBan(text, rule("7 × 360 = ?", "2520"))).toBe("unread");
    expect(check(text, rule("7 × 360 = ?", "2520")).verdict).toBe("unknown");
  });
  it("bans an arrow chain whose tail is not one bare number", () => {
    const r = rule("7 × 360 = ?", "2520");
    expect(check("36 × 7 → 252 × 10 → 2520", r).kind).toBe("strip-zeros");
    for (const text of ["36 × 7 → 252 × 10 → 2520 + 0", "36 × 7 → 252 × 10 → 2520 - 1", "36 × 7 → 252 × 10"]) expect(check(text, r).verdict).not.toBe("valid");
    const m = rule("8 × ? = 800", "100");
    for (const text of ["80 ÷ 8 → 10 × 10 → 100 - 1", "8 ÷ 8 → 1 × 100 → 100 + 7"]) expect(check(text, m).verdict).not.toBe("valid");
  });
  it("rounds up only, and never by a factor of the question", () => {
    const r = rule("7 × 360 = ?", "2520");
    expect(check("10 × 360 = 3600\n3 × 360 = 1080\n3600 - 1080 = 2520", r).kind).toBe("round-up");
    expect(check("7 × 400 = 2800\n7 × 40 = 280\n2800 - 280 = 2520", r).kind).toBe("round-up");
    // Rounding down is a split written another way.
    expect(check("7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520", r).kind).toBe("split-place");
    expect(check("7 × 350 = 2450\n7 × 10 = 70\n2450 + 70 = 2520", r).verdict).toBe("unknown");
    // 50 × 80: rounding 50 up to 100 takes off 50 × 80, the question itself.
    const b = rule("50 × 80 = ?", "4000");
    expect(check("100 × 80 = 8000\n50 × 80 = 4000\n8000 - 4000 = 4000", b).verdict).toBe("unknown");
    expect(check("50 × 100 = 5000\n50 × 20 = 1000\n5000 - 1000 = 4000", b).kind).toBe("round-up");
  });
});

// Every attack from the five reviews so far. Each is a test that must not be Right: the AI says solves on both.
describe("the reviews' attacks are never Right", () => {
  it.each([
    // Review of 9f4fecc5: the same method twice, padding, the answer filled in, a reverse check, lists, hidden steps.
    ["36 + 47 = ?", "83", "36 + 40 + 7 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["36 + 47 = ?", "83", "36 + 40 = 76\n76 + 7 = 83", "36 +40 → 76 +7 → 83"],
    ["36 + 47 = ?", "83", "36 + 40 + 7 = 83", "36 + 40 + 7"], ["36 + 47 = ?", "83", "36 + 40 + 7 = 83", "(36 + 40) + 7 = 83"],
    ["8 × ? = 800", "100", "800 ÷ 8 = 100", "800 ÷ 8"], ["8 × ? = 800", "100", "800 ÷ 8 = 100", "800 ÷ 8 = 100.0"],
    ["5 × ? = 25", "5", "5 + 0 = 5", "5 ÷ 1 = 5"], ["5 × ? = 25", "5", "5 × 5 ÷ 5 = 5", "5 × 5 = 25\n5 - 0 = 5"],
    ["64 ÷ 8 = ?", "8", "8 × 8 = 64\n64 ÷ 8 = 8", "8 + 0 = 8"], ["64 ÷ 8 = ?", "8", "8 × 8 ÷ 8 = 8", "64 - 8 = 56"],
    ["36 + 47 = ?", "83", "36 + 47 - 0 = 83", "47 + 36 × 1 = 83"], ["36 + 47 = ?", "83", "(36 + 47) × 1 = 83", "36 + 40 = 76\n76 + 7 = 83"],
    ["36 + 47 = ?", "83", "36 + 47 ÷ 1 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["36 + 47 = ?", "83", "36 - (0 - 47) = 83", "36 + 40 = 76\n76 + 7 = 83"],
    ["36 + 47 = ?", "83", "36 + 47 = 83\n50 + 33 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["36 + 47 = ?", "83", "36 + 47 + 2 - 2 = 83", "36 + 40 = 76\n76 + 7 = 83"],
    ["36 + 47 = ?", "83", "36 + 47 + 36 - 36 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["36 + 47 = ?", "83", "40 + 40 = 80\n83", "36 + 40 = 76\n76 + 7 = 83"],
    ["36 + 47 = ?", "83", "2 + 2 = 4\n83 is it", "36 + 40 = 76\n76 + 7 = 83"], ["5 × ? = 25", "5", "1 + 1 = 2\n5 times", "25 ÷ 5 = 5"],
    ["36 + 47 = ?", "83", "83, 83, 83", "83, 83, 83, 83"], ["36 + 47 = ?", "83", "85, 84, 83", "81, 82, 83"],
    ["12 500 + 3 400 = ?", "15900", "12500 + 3400 = 15900", "12 500 + 3 400 = 15 900"], ["36 + 47 = ?", "83", "36 + 47 = 999 = ?\n40 + 43 = 83", "36 + 40 = 76\n76 + 7 = 83"],
    ["36 + 47 = ?", "83", "36 + 47 = 83", "83 - 47 = 36"], ["36 + 47 = ?", "83", "47 + 36 = 83", "83 + 0 = 83"],
    // Review of 17d27f88: round-and-adjust that holds the question, x 1 padding as strip zeros, relabels, arrow tails.
    ["50 × 80 = ?", "4000", "5 × 8 = 40\n40 × 100 = 4000", "80 × 100 = 8000\n80 × 50 = 4000\n8000 - 4000 = 4000"],
    ["5 × 7 = ?", "35", "7 × 10 = 70\n7 × 5 = 35\n70 - 35 = 35", "7 + 7 + 7 + 7 + 7 = 35"],
    ["6 × 100 = ?", "600", "6 × 1 = 6\n6 × 100 = 600", "100 + 100 + 100 + 100 + 100 + 100 = 600"],
    ["? ÷ 8 = 100", "800", "8 × 100 = 800", "8 × 1 = 8\n8 × 100 = 800"], ["20 × 10 = ?", "200", "2 × 10 = 20\n20 × 10 = 200", "10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 + 10 = 200"],
    ["8 × ? = 800", "100", "80 ÷ 8 → 10 × 10 → 100 - 1", "800 ÷ 8 = 100"], ["8 × ? = 800", "100", "8 ÷ 8 → 1 × 100 → 100 + 7", "800 ÷ 8 = 100"],
    ["50 × 80 = ?", "4000", "5 × 8 = 40\n40 × 100 = 4000", "5 × 80 = 400\n400 × 10 = 4000"], ["60 × ? = 4800", "80", "4800 ÷ 60 = 80", "480 ÷ 6 = 80"],
    ["8 × ? = 800", "100", "800 ÷ 8 = 100", "80 ÷ 8 = 10\n10 × 10 = 100"], ["8 × ? = 800", "100", "8 × 1 = 8, add two zeros → 800", "800 ÷ 8 = 100"],
    ["8 × ? = 800", "100", "8 × 100 = 800", "800 ÷ 8 = 100"], ["8 × ? = 800", "100", "100 × 8 = 800", "800 ÷ 8 = 100"],
    ["8 × ? = 800", "100", "8 × 100 × 1 = 800", "800 ÷ 8 = 100"], ["8 × ? = 800", "100", "8 × 99 = 792\n8 × 1 = 8\n792 + 8 = 800\n99 + 1 = 100", "800 ÷ 8 = 100"],
    // Review of 278e3725: the running-total and printed-number exceptions, rounding down, reverse checks with zeros off.
    ["5 × ? = 50", "10", "50 ÷ 5 = 10", "5 × 2 = 10\n10 × 5 = 50\n2 × 5 = 10"], ["2 × ? = 8", "4", "8 ÷ 2 = 4", "2 × 2 = 4\n4 × 2 = 8\n2 × 2 = 4"],
    ["3 × ? = 27", "9", "27 ÷ 3 = 9", "3 × 3 = 9\n9 × 3 = 27\n3 × 3 = 9"], ["5 × ? = 50", "10", "50 ÷ 5 = 10", "5 × 2 → 10 × 5 → 50"],
    ["7 × 365 = ?", "2555", "7 × 300 = 2100\n7 × 60 = 420\n7 × 5 = 35\n2100 + 420 + 35 = 2555", "7 × 300 = 2100\n7 × 65 = 455\n2100 + 455 = 2555"],
    ["7 × 360 = ?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520", "7 × 350 = 2450\n7 × 10 = 70\n2450 + 70 = 2520"],
    ["8 × ? = 3440", "430", "3440 ÷ 8 = 430", "8 × 43 = 344\n344 × 10 = 3440\n43 × 10 = 430"],
    ["60 × ? = 4800", "80", "4800 ÷ 60 = 80", "60 × 8 = 480\n480 × 10 = 4800\n8 × 10 = 80"],
    ["20 × ? = 3000", "150", "3000 ÷ 20 = 150", "20 × 15 = 300\n300 × 10 = 3000\n15 × 10 = 150"],
    ["40 ÷ 8 = ?", "5", "40 ÷ 8 = 5", "40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n5 times"],
    ["10 × ? = 100", "10", "10 ÷ 1 = 10", "10, 20, 30, 40, 50, 60, 70, 80, 90, 100\n10 times"], ["10 × ? = 100", "10", "10 ÷ 10 = 1\n1 × 10 = 10", "100 ÷ 10 = 10"],
    ["100 × ? = 10000", "100", "100 ÷ 1 = 100", "10000 ÷ 100 = 100"], ["100 × ? = 10000", "100", "100 ÷ 100 = 1\n1 × 100 = 100", "10000 ÷ 100 = 100"],
    ["1 × ? = 7", "7", "7 ÷ 1 = 7", "1, 2, 3, 4, 5, 6, 7\n7 times"], ["? ÷ 7 = 1", "7", "7 × 1 = 7", "7"],
    ["100 ÷ ? = 10", "10", "100 ÷ 10 = 10", "10, 20, 30, 40, 50, 60, 70, 80, 90, 100\n10 times"], ["800 ÷ ? = 8", "100", "800 ÷ 8 = 100", "8 × 50 = 400\n8 × 50 = 400\n400 + 400 = 800\n50 + 50 = 100"],
    ["7 × 360 = ?", "2520", "7 × 360 = 2520\n7 × 36 = 252\n252 × 10 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "7 × 36 = 252\n252 × 10 = 2520\n360 × 7 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "2520 ÷ 7 = 360\n7 × 36 = 252\n252 × 10 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "36 × 7 = 252\n252 × 10 × 1 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "36 × 7 = 252\n252 × 10 = 2520\n2520 × 1 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "7 × 360 = 2520\n2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["7 × 360 = ?", "2520", "70 × 36 = 2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520"],
    ["8 × ? = 800", "100", "8 × 1 = 8\n8 × 100 = 800\n1 × 100 = 100", "800 ÷ 8 = 100"], ["8 × ? = 800", "100", "8 × 100 = 800\n800 × 1 = 800", "800 ÷ 8 = 100"],
    ["8 × ? = 800", "100", "800 ÷ 8 = 100\n100 × 8 = 800", "8 × 50 = 400\n8 × 50 = 400\n400 + 400 = 800\n50 + 50 = 100"],
    ["? - 47 = 36", "83", "36 + 47 = 83", "36 + 40 = 76\n76 + 7 = 83"], ["? - 5 = 3", "8", "3 + 5 = 8", "3, 4, 5, 6, 7, 8"],
    ["36 - ? = 12", "24", "36 - 12 = 24", "36 - 10 = 26\n26 - 2 = 24"],
    // Fraction and decimal answers have no template.
    ["1 ÷ 2 = ?", "1/2", "5/10", "1 ÷ 2 = 0.5"], ["5 ÷ 4 = ?", "5/4", "5/4 × 1 = 5/4", "10/8"],
  ] as const)("%s: %j / %j", (q, answer, one, two) => {
    expect(pairRight(q, answer, one, two)).toBe(false);
    expect(pairRight(q, answer, two, one)).toBe(false);
  });
});

describe("two different templates", () => {
  it("are the only two ways, and an unknown template never is", () => {
    const shape = questionShape("7 × 360 = ?")!;
    for (const a of ALL_TEMPLATES) for (const b of ALL_TEMPLATES) expect(differentStrategies(shape, a, b)).toBe(a !== b);
    expect(differentStrategies(shape, "strip-zeros", "made-up")).toBe(false);
  });
  it("count the inverse division and the division with tens as one template", () => {
    const r = rule("60 × ? = 4800", "80");
    expect([check("4800 ÷ 60 = 80", r).kind, check("480 ÷ 6 = 80", r).kind]).toEqual(["divide", "divide"]);
  });
});
