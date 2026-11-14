// B1b: Maya's lines for compare, sum and build, and the honest close. Synthetic numbers only.
import { describe, expect, it, vi } from "vitest";
import { allLineTexts, packageLines, spokenOffer, type LineOffer } from "./lines";
import { createSession, fallbacks, learningEvent, step, turnWordLimit, type Session } from "./session";
import { speechWords } from "./speech";
import { PLACE_PARTS_TEMPLATES } from "./place-value-parts-templates";
import { placePartsTeachingPackage } from "@/lib/maya-teaching/place-value-parts";
import { storedBuild, storedCompare, storedSum } from "@/lib/maya-teaching/place-value-parts-samples";
import type { OperationPackage, QuestionPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

const made = (stored: QuestionPackage): OperationPackage => {
  const r = placePartsTeachingPackage(stored);
  if (!r || "held" in r) throw new Error(`held: ${stored.text}`);
  return r.package as OperationPackage;
};
// The longest real shapes: six digits and the two longest place names.
const COMPARE = made(storedCompare({ step: 2, n0: 987654, place: "hundred thousands", second: "ten thousands", page: 62, question: 12 }));
const SUM = made(storedSum({ step: 2, n0: 987654, place: "hundred thousands", second: "ten thousands", page: 62, question: 12 }));
const BUILD = made(storedBuild({ wholes: 6, tenths: 4, page: 62, question: 12 }));
const ALL = [COMPARE, SUM, BUILD];

describe("B1b's lines", () => {
  it("fill every slot, five wordings a key", () => {
    for (const [key, wordings] of Object.entries(PLACE_PARTS_TEMPLATES)) expect(wordings.length, key).toBe(5);
    for (const p of ALL) for (const t of allLineTexts(p)) expect(t, t).not.toMatch(/\{|\}|undefined|NaN/);
  });

  it("say no answer before it stands: no help, step or opening line holds the sum, the decimal or 'it's true'", () => {
    for (const p of ALL) {
      const l = packageLines(p);
      const before: LineOffer[] = [...l.question(), ...l.assess(), ...l.tryTarget(), ...l.stepIds.flatMap((id) => [...l.help(id), ...l.rightStep(id), ...l.notYet(id)]), ...l.help("result"), ...l.notYet("result")];
      const answer = p.answer.value;
      const says = (t: string) => (answer.type === "number" ? t.replace(/,/g, "").includes(String(answer.value)) : answer.type === "choice" && new RegExp(`\\b(?:it'?s|is|circle) ${answer.value}\\b(?! or)`, "i").test(t));
      expect(before.flatMap((o) => o.texts).filter(says)).toEqual([]);
    }
  });

  it("fit a grade 3 turn, and every key has wordings for a call with no board", () => {
    for (const p of ALL) {
      const l = packageLines(p);
      const offers = [...l.stepIds.flatMap((id) => [...l.help(id), ...l.rightStep(id), ...l.notYet(id)]), ...l.help("result"), ...l.notYet("result"), ...l.answerRight(), ...l.closeUnsolved(), ...l.exampleIntro(),
        // The printed sentence read aloud (question.read) is the book's own words, not a new line.
        ...l.question().filter((o) => o.line !== "question.read")];
      const long = offers.flatMap((o) => o.texts).filter((t) => speechWords(t) > turnWordLimit({ grade: 3 }));
      expect(long).toEqual([]);
      for (const o of offers) {
        expect(spokenOffer(o).texts.length, o.key).toBeGreaterThan(0);
      }
    }
  });

  it("read naturally: an ordinal names a place, never a count ('count fourth places')", () => {
    const ordinal = "first|second|third|fourth|fifth|sixth|seventh";
    for (const p of ALL) for (const t of allLineTexts(p)) {
      expect(t, t).not.toMatch(new RegExp(`\\b(?:${ordinal}) (?:places|digits)\\b`, "i"));
      expect(t, t).not.toMatch(new RegExp(`\\bcount (?:${ordinal})\\b`, "i"));
    }
  });

  it("never point at a compare's column before the word stands: no stripe or circle line on its steps", () => {
    const l = packageLines(COMPARE);
    for (const id of [...l.stepIds, "result"]) for (const t of l.help(id).flatMap((o) => o.texts)) expect(t, t).not.toMatch(/\b(?:colou?red|circled|striped)\b/i);
  });
});

describe("the honest close (brief lesson 10)", () => {
  const closeTexts = (p: OperationPackage) => packageLines(p).closeUnsolved().flatMap((o) => o.texts);
  it("says it is hard, that stopping is fine, and one next step, with no number and no answer word", () => {
    for (const p of ALL) {
      const texts = closeTexts(p);
      expect(texts).toHaveLength(5);
      for (const t of texts) {
        expect(t, t).toMatch(/\b(?:hard|tricky|tough)\b/i);
        expect(t, t).toMatch(/\b(?:stop|stopping)\b/i);
        expect(t, t).toMatch(/\b(?:easier one|grown-up)\b/i);
        expect(t, t).not.toMatch(/\d|\btrue\b|\bfalse\b/i);
      }
    }
  });

  it("closes a child who only asks for help after the easier example, and the learning event holds the stuck step", () => {
    let s: Session = createSession({ callId: "pv-close", package: SUM });
    s = step(s, { type: "start", at: 0 }).session;
    let at = 1;
    const maya = () => {
      const r = step(s, { type: "proposal", at: at++, proposal: fallbacks(s)[0], fallback: true });
      expect(r.refusal).toBeNull();
      s = r.session;
      return r.effects.filter((e) => e.kind === "say").map((e) => (e as { text: string }).text).join(" ");
    };
    maya();
    const said: string[] = [];
    for (let i = 0; i < 12 && s.state !== "CLOSE"; i++) {
      s = step(s, { type: "child_turn", at: at++, text: "I'm stuck." }).session;
      said.push(maya());
    }
    expect(s.state).toBe("CLOSE");
    expect(closeTexts(SUM)).toContain(said.at(-1));
    expect(said.join(" ").replace(/,/g, "")).not.toContain(String((SUM.answer.value as unknown as { value: number }).value));
    const event = learningEvent(s, { parentId: "p", childId: "c" });
    expect(event).toMatchObject({ result: "blank", stuckStep: "worth-1" });
  });
});
