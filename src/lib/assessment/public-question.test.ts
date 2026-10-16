import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import {
  BANKS, createSession, fillTemplate, nextQuestion, readAloudText, spokenChoices, submitAnswer, testStep,
  toPublicQuestion, type Grade, type Province, type PublicQuestion, type Question,
} from "@/lib/assessment";

const roundtrip = (q: Question): PublicQuestion => JSON.parse(JSON.stringify(toPublicQuestion(q)));
const expectedKeys = (q: Question) => Object.keys(Object.fromEntries(
  [...(q.choices ?? [])].filter((choice) => Object.hasOwn(q.say ?? {}, choice)).sort().map((choice) => [choice, ""]),
));
const stringKey = (key: string) => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= 4_294_967_295;

function checkPublicSpeech(q: Question) {
  const before = JSON.stringify(q);
  const view = roundtrip(q);
  assert.deepEqual(Object.keys(view.say ?? {}), q.format === "choice" ? expectedKeys(q) : [], q.id);
  assert.deepEqual(view.choices, q.choices);
  assert.deepEqual(spokenChoices(view, view.choices ?? []), spokenChoices(q, q.choices ?? []));
  for (const choice of Object.keys(view.say ?? {})) assert.equal(view.say?.[choice], q.say?.[choice], choice);
  assert(!Object.hasOwn(view, "answer"));
  assert(!Object.hasOwn(view, "wrong"));
  assert.equal(JSON.stringify(q), before);
  return view;
}

describe("public question speech does not disclose server choice order", () => {
  it.each([[6, "BC"], [7, "ON"]] as [Grade, Province][])("keeps a normal grade %i %s session private after JSON serialization", (grade, province) => {
    let session = createSession({ grade, province }, 3);
    let nonIntegerChoices = 0;
    while (nextQuestion(session)) {
      const q = nextQuestion(session)!;
      const step = JSON.parse(JSON.stringify(testStep(session)));
      expect(step.status).toBe("question");
      expect(step.question).toEqual(checkPublicSpeech(q));
      if (q.say && q.choices?.every(stringKey)) nonIntegerChoices++;
      session = submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 1000 });
      expect(session.answers.at(-1)?.correct).toBe(true);
    }
    expect(session.answers).toHaveLength(province === "BC" ? 45 : 42);
    expect(nonIntegerChoices).toBeGreaterThan(0);
  });

  it("filters speech to displayed choices and makes raw map insertion order irrelevant", () => {
    const t = BANKS["6-7"].find((t) => t.id === "g67-6-translate-point")!;
    expect(t).toBeDefined();
    const q = fillTemplate(t, 3);
    const say = { ...q.say, "private extra key": "private extra speech" };
    const a = roundtrip({ ...q, say });
    const b = roundtrip({ ...q, say: Object.fromEntries(Object.entries(say).reverse()) });
    expect(a).toEqual(b);
    expect(a.say).not.toHaveProperty("private extra key");
    expect(readAloudText(a, a.choices)).toBe(readAloudText(q, q.choices));
    expect(spokenChoices(a, a.choices ?? []).every((text) => text.startsWith("point "))).toBe(true);
  });

  it("does not expose a speech map on a typed question", () => {
    const q = fillTemplate(BANKS["6-7"].find((t) => t.format === "number")!, 3);
    expect(roundtrip({ ...q, say: { [q.answer]: "server-only answer" } })).not.toHaveProperty("say");
  });

  it.each(Object.entries(BANKS))("checks the complete %s bank across 400 seeds, including string-key choices", (band, bank) => {
    let nonIntegerChoices = 0;
    for (const template of bank) for (let i = 0; i < 400; i++) {
      const q = fillTemplate(template, i * 7919 + 3);
      checkPublicSpeech(q);
      if (q.say && q.choices?.every(stringKey)) nonIntegerChoices++;
    }
    if (band !== "1-2") expect(nonIntegerChoices).toBeGreaterThan(0);
  }, 60_000);

  it("keeps canonical speech keys and positive lookups on every province and adaptive route", () => {
    let nonIntegerChoices = 0;
    for (const grade of [1, 2, 3, 4, 5, 6, 7] as Grade[]) for (const province of ["BC", "AB", "SK", "MB", "ON", "other"] as Province[]) for (let i = 0; i < 20; i++) {
      const session = createSession({ grade, province }, i * 7919 + 3);
      for (const route of ["up", "stay", "down"] as const) for (const q of [...session.stage1, ...session.stage2[route]]) {
        checkPublicSpeech(q);
        if (q.say && q.choices?.every(stringKey)) nonIntegerChoices++;
      }
    }
    expect(nonIntegerChoices).toBeGreaterThan(0);
  }, 60_000);
});
