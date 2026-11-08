// B1a: Maya's place-value lines and board offers, through packageLines and allLineTexts. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { valuesIn } from "./numbers";
import { allLineTexts, packageLines, spokenOffer } from "./lines";
import { PLACE_VALUE_TEMPLATES, placeBoardOffers } from "./place-value-lines";
import { equivalent, type OperationPackage, type Place } from "@/lib/question-package";
import { placeValueTeachingPackage } from "@/lib/maya-teaching/place-value";
import { storedPlaceValue, type PlaceValueVariant } from "@/lib/maya-teaching/place-value-samples";
import { applyBatch, createScene, type Command } from "@/lib/board";

const make = (variant: PlaceValueVariant, n0: number, place: Place): OperationPackage => {
  const r = placeValueTeachingPackage(storedPlaceValue({ variant, n0, place }));
  if ("held" in r) throw new Error(r.held);
  return r.package as OperationPackage;
};

describe("the place-value templates", () => {
  it("has 5 wordings per key, in plain language (D-202), with no word 'one' or 'zero' said as a number before an answer", () => {
    for (const [key, wordings] of Object.entries(PLACE_VALUE_TEMPLATES)) {
      expect(wordings.length, key).toBe(5);
      for (const w of wordings) {
        expect(w, key).not.toMatch(/\b(?:in all|altogether|all together|total|left over)\b/i);
        expect(w.split(/(?<=[.?!])\s+/).every((s) => s.split(/\s+/).length <= 16), `${key}: ${w}`).toBe(true);
      }
    }
  });
});

/** The lines Maya may say before the answer is released: everything but the answer lines and a zero digit's step check. */
function beforeAnswer(pkg: OperationPackage): string[] {
  const l = packageLines(pkg);
  const digitZero = pkg.steps.some((s) => s.kind === "read-digit" && s.digit === 0);
  const offers = [
    ...l.hello(), ...l.question(), ...l.assess(), ...l.exampleIntro(), ...pkg.easierExample.steps.flatMap((s) => l.exampleStep(s.id)), ...l.tryTarget(),
    ...l.stepIds.flatMap((id) => [...l.help(id), ...l.notYet(id), ...(digitZero ? [] : l.rightStep(id))]), ...l.help("result"), ...l.notYet("result"),
    ...l.explain(), ...l.closeUnsolved(), ...l.redirect(),
  ];
  return [...offers, ...offers.map(spokenOffer)].flatMap((o) => [...o.texts, ...(o.board ? [o.board] : [])]);
}

describe("no line before the answer holds the answer", () => {
  it("for digit and value questions over many numbers, every place, and the digits 0, 1 and the rest", () => {
    const random = (() => {
      let x = 11;
      return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    })();
    const cases: [PlaceValueVariant, Place][] = [["1.1", "thousands"], ["2.1", "hundred thousands"], ["1.2", "ten thousands"], ["1.3", "hundreds"], ["2.3", "thousands"], ["3.3", "tens"], ["3.2", "hundreds"], ["3.1", "thousands"]];
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const [variant, place] = cases[i % cases.length];
      const zero = variant[0] === "3";
      const n0 = (variant[0] === "1" ? 10000 : 100000) + Math.floor(random() * (variant[0] === "1" ? 89999 : 899999));
      if (!zero && String(n0).includes("0")) continue;
      const r = placeValueTeachingPackage(storedPlaceValue({ variant, n0, place }));
      if ("held" in r) continue;
      const pkg = r.package as OperationPackage;
      for (const text of beforeAnswer(pkg)) {
        expect(valuesIn(text).some((v) => equivalent(v, pkg.answer.value)), `${pkg.text}: "${text}"`).toBe(false);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
  });
});

describe("the lines of a question", () => {
  const digit = make("1.1", 53172, "thousands");
  const value = make("2.2", 785243, "ten thousands");

  it("has no H3 and no given answer on a last step", () => {
    for (const pkg of [digit, value]) {
      const l = packageLines(pkg);
      expect(l.help("result").map((o) => o.level)).not.toContain(3);
      expect([...l.answerGive(), ...l.answerParts()]).toEqual([]);
    }
  });

  it("names the places from the right at H1 of a digit question, and stripes the column only at H2", () => {
    const help = packageLines(digit).help("result");
    expect(help.find((o) => o.level === 1 && o.line === "step.point")?.texts).toContain("Count the places from the right: ones, tens, hundreds, thousands.");
    expect(help.find((o) => o.level === 1 && o.line === "step.point")?.key).toBe("point.place");
    expect(help.find((o) => o.level === 2)?.key).toBe("operation.place");
  });

  it("offers each targeted fix for its own wrong answer only", () => {
    expect(packageLines(digit).notYet("result").find((o) => o.key === "fix.digit")?.requires).toEqual({ answer: "wrong", step: "result", heard: "3000" });
    expect(packageLines(value).notYet("result").find((o) => o.key === "fix.value")?.requires).toEqual({ answer: "wrong", step: "result", heard: "8" });
  });

  it("lists every place-value line in allLineTexts, for the gate", () => {
    const all = allLineTexts(value);
    expect(all).toContain("Yes! 8 ten thousands is 80,000.");
    expect(all).toContain("Let's stop here for now. You can try this question again later.");
  });
});

describe("the board offers", () => {
  const digit = make("1.1", 53172, "thousands");
  const value = make("2.2", 785243, "ten thousands");
  const offersFor = (pkg: OperationPackage, act: string, keys: string[] = [], roles: Record<string, string> = {}) => {
    const l = packageLines(pkg);
    const chosen = [...l.help("result"), ...l.stepIds.flatMap(l.help), ...l.answerRight(), ...pkg.easierExample.steps.flatMap((s) => l.exampleStep(s.id))].filter((o) => keys.includes(o.key));
    return placeBoardOffers({ pkg: pkg as never, act, roles, batch: 0, chosen, exampleShown: 0 });
  };
  const draw = (batches: Command[][]) => {
    let scene = createScene();
    for (const [i, commands] of batches.entries()) {
      const r = applyBatch(scene, { transactionId: `t${i}`, commands });
      if (!r.ok) throw new Error(JSON.stringify(r.refusal));
      scene = r.scene;
    }
    return scene;
  };
  const at = { region: "main" } as const;

  it("draws a digit question's chart with no digits, stripes it only with the H2 line, and writes the digit with the answer", () => {
    const chart = offersFor(digit, "guide").find((o) => o.id === "question.chart")!.commands(at);
    expect(chart[0]).toMatchObject({ op: "place_chart", number: "53172", blank: true });
    expect(offersFor(digit, "guide", ["point.place"], { question: "target" }).map((o) => o.id)).toEqual([]);
    const band = offersFor(digit, "guide", ["operation.place"], { question: "target" }).find((o) => o.id === "question.band")!.commands(at);
    const answer = offersFor(digit, "accept_answer", ["answer.digit"], { question: "target" }).find((o) => o.id === "question.answer")!.commands(at);
    expect(() => draw([chart, band, answer])).not.toThrow();
  });

  it("writes a value question's value and sentence on its chart, which the chart checks", () => {
    const chart = offersFor(value, "guide").find((o) => o.id === "question.chart")!.commands(at);
    const answer = offersFor(value, "accept_answer", ["answer.value"], { question: "target" }).find((o) => o.id === "question.answer")!.commands(at);
    expect(answer.map((c) => (c as { value?: string }).value)).toEqual(["80000", "8 × 10,000 = 80,000", "80,000"]);
    expect(() => draw([chart, answer])).not.toThrow();
  });
});
