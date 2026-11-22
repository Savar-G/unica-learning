import { beforeEach, describe, expect, it } from "vitest";
import type { GeneratedPage } from "./workbook-generator";
import type { Block, DayContent } from "./workbook-page";
import { curriculumFor } from "./workbook-curriculum";
import { ENFORCED_LEVELS, gapKey, introIssues, planIntros, withIntros, withPlanned } from "./workbook-taught";
import { methodIntro } from "./workbook-intro-examples";
import { TERMS, termsIn } from "./workbook-terms";

/** A day page of a made-up book: its blocks, and the question each block asks (numbered from 1 in block order). */
function dayPage(number: number, level: number, blocks: (Partial<Block> & { slot: Block["slot"]; asks?: string[] })[]): GeneratedPage {
  let n = 0;
  const questions = blocks.flatMap((b) => (b.asks ?? []).map((text) => ({
    number: ++n, slot: `s${n}`, part: "p", place: b.slot, attempts: 1, check: { status: "checked" },
    package: { text, level, templateId: null, operation: null, ref: { question: n } },
  })));
  let at = 0;
  const content: DayContent = { kind: "day", id: `p${number}`, level, day: 1, page: 1, pages: 8, topic: "t", title: "t", subtitle: "", grownUp: null,
    blocks: blocks.map(({ asks = [], ...b }) => ({ ...b, items: asks.map(() => ++at) })) };
  return { number, day: 1, pageOfDay: 1, dayLabel: "Day 1", type: "practice", qrToken: "token-000000000001", attempts: 1, fit: { status: "fits" }, questions, content } as unknown as GeneratedPage;
}
const cover = { number: 1, day: null, type: "cover", questions: [], content: undefined } as unknown as GeneratedPage;
const book = (...pages: GeneratedPage[]) => [cover, ...pages];

describe("methods and words are shown before a question uses them", () => {
  beforeEach(() => expect([...ENFORCED_LEVELS]).toEqual([10, 19]));

  it("flags the first Use 2 ways question of a pair, and only it, with the strip that fixes it", () => {
    const pages = book(
      dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: ["47 + 28 = ?"] }]),
      dayPage(12, 10, [{ slot: "solve-it-two-ways", asks: ["36 + 29 = ?"] }]),
    );
    const issues = introIssues(pages);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ page: 3, kind: "intro", fix: { block: 0 } });
    const strip = issues[0].fix!.intro[0];
    expect(strip.kind).toBe("methods");
    expect(strip.methods).toHaveLength(2);
    expect(strip.question).not.toContain("47");
    // With the strip printed, the book is clean (and the later page of the same pair stays clean).
    const fixed = pages.map((p) => p.number === 3 ? { ...p, content: withIntros(structuredClone(p.content!), issues)! } : p);
    expect(introIssues(fixed)).toEqual([]);
  });

  it("asks a new strip for a new pair", () => {
    const issues = introIssues(book(
      dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: ["47 + 28 = ?"] }]),
      dayPage(12, 10, [{ slot: "solve-it-two-ways", asks: ["74 − 38 = ?"] }]),
    ));
    expect(issues.map((i) => i.page)).toEqual([3, 12]);
  });

  it("flags a question that has no fitting pair at all (a spinner story)", () => {
    const issues = introIssues(book(dayPage(8, 19, [{ slot: "solve-it-two-ways", asks: ["A spinner has 5 equal parts. It spins 30 times and gets 10 reds. How far off is the prediction of 6 reds?"] }])));
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("coverage");
  });

  it("flags a word a Challenge uses before its step is taught, and accepts it after the teaching panel", () => {
    const challenge = ["Two quarter turns the same way. Is it straight or reflex? Circle one."];
    const early = introIssues(book(dayPage(9, 19, [{ slot: "challenge", asks: challenge }])));
    expect(early).toHaveLength(1);
    expect(early[0].fix!.intro[0]).toMatchObject({ kind: "terms", ids: ["straight-reflex"] });
    const taught = introIssues(book(
      dayPage(5, 19, [{ slot: "worked-example", step: "6.13-classify-angles#2" }, { slot: "now-you", asks: challenge }]),
      dayPage(9, 19, [{ slot: "challenge", asks: challenge }]),
    ));
    expect(taught).toEqual([]);
  });

  it("replaces a planned strip whose pair the written question does not use, and keeps one it does", () => {
    const planned = methodIntro(["add the tens, then the ones", "make a friendly number first"], [47, 28])!;
    const withStrip = (text: string) => { const p = dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: [text], intro: [planned] }]); return book(p); };
    expect(introIssues(withStrip("47 + 28 = ?"))).toEqual([]);
    const pages = withStrip("74 − 38 = ?");
    const [issue] = introIssues(pages);
    expect(issue.fix!.drop).toEqual(planned.ids);
    const fixed = withIntros(structuredClone(pages[1].content!), [issue]);
    expect(fixed?.kind === "day" && fixed.blocks[0].intro?.map((s) => s.ids[0])).toEqual(["take away the tens, then the ones|count up from the smaller number"]);
  });

  it("replaces a strip whose example is a task a question of the book asks", () => {
    const strip = methodIntro(["add the tens, then the ones", "make a friendly number first"], [])!;
    expect(strip.question).toBe("47 + 28 = ?");
    // The writer's question after planning is the strip's own task, in other words.
    const pages = book(dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: ["28 + 47 = ?"], intro: [strip] }]));
    const [issue] = introIssues(pages);
    expect(issue.fix!.drop).toEqual(strip.ids);
    expect(issue.fix!.intro[0].question).not.toBe(strip.question);
  });

  it("reports a pair whose every example is a task the book asks", () => {
    const asks = ["47 + 28 = ?", "36 + 29 = ?", "58 + 25 = ?", "64 + 38 = ?", "73 + 19 = ?", "74 + 23 = ?"];
    const issues = introIssues(book(dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: [asks[5]] }, { slot: "practice-row", asks: asks.slice(0, 5) }])));
    expect(issues.some((i) => i.kind === "coverage" && /every worked example/.test(i.reason))).toBe(true);
  });

  it("tells a new gap from an old one on the same page by what it is about", () => {
    const gapsOf = (...asks: string[]) => introIssues(book(dayPage(3, 19, [{ slot: "challenge", asks }]))).map(gapKey);
    const old = gapsOf("Is it a reflex angle? Circle yes or no.");
    const both = gapsOf("Is it a reflex angle? Circle yes or no.", "Is 7 prime? Circle yes or no.");
    expect(both.filter((k) => !old.includes(k))).toHaveLength(1);
    expect(old).toHaveLength(1);
  });

  it("checks only U10 and U19, and only a whole book", () => {
    const early = dayPage(3, 12, [{ slot: "solve-it-two-ways", asks: ["47 + 28 = ?"] }, { slot: "challenge", asks: ["Is it a reflex angle?"] }]);
    expect(introIssues(book(early))).toEqual([]);
    expect(introIssues([dayPage(3, 10, [{ slot: "solve-it-two-ways", asks: ["47 + 28 = ?"] }])])).toEqual([]);
  });
});

describe("planning the strips before the pages are written", () => {
  const work = (number: number, level: number, text: string | null) => ({
    number, slots: [{ layoutSlot: 0, place: "solve-it-two-ways", text }], layout: { slots: [{ slot: "solve-it-two-ways", part: 0 }] }, page: { parts: [{}] },
  });
  const pkg = (level: number, text: string) => ({ text, level, templateId: null, operation: null }) as never;

  it("plans one strip for each pair at its first page, and a guess for a question the writer will write", () => {
    const pages = [work(5, 10, "74 − 38 = ?"), work(3, 10, "47 + 28 = ?"), work(9, 10, null), work(11, 10, "36 + 29 = ?"), work(13, 12, "47 + 28 = ?")];
    planIntros(pages, 10, (_w, s) => (s.text ? pkg(10, s.text) : null));
    const at = (n: number) => withPlanned({ kind: "day", blocks: [{ slot: "solve-it-two-ways", items: [] }] } as never, pages.find((p) => p.number === n)!, [0]) as unknown as DayContent;
    expect(at(3).blocks[0].intro).toHaveLength(1);
    expect(at(5).blocks[0].intro?.[0].ids[0]).toMatch(/^take away/);
    expect(at(9).blocks[0].intro).toBeUndefined();
    expect(at(11).blocks[0].intro).toBeUndefined();
  });

  it("plans nothing for a level that is not checked", () => {
    const pages = [work(3, 12, "47 + 28 = ?")];
    planIntros(pages, 12, (_w, s) => (s.text ? pkg(12, s.text) : null));
    expect(withPlanned({ kind: "day", blocks: [{ slot: "solve-it-two-ways", items: [] }] } as never, pages[0], [0])).toMatchObject({ blocks: [{ items: [] }] });
    expect((withPlanned({ kind: "day", blocks: [{ slot: "solve-it-two-ways", items: [] }] } as never, pages[0], [0]) as DayContent).blocks[0].intro).toBeUndefined();
  });
});

describe("the word list", () => {
  it("names a real step for every word, and finds the word in plain question text", () => {
    const curriculum = curriculumFor("bc")!;
    for (const t of TERMS) {
      const [skill, step] = t.taughtBy.split("#");
      expect(curriculum.skillSteps(skill)?.[Number(step) - 1], t.id).toBeTruthy();
    }
    expect(termsIn("Is 15 a common multiple of 3 and 5? Circle yes or no.").map((t) => t.id)).toEqual(["multiple"]);
    expect(termsIn("Which is prime? A) 26 B) 7")[0].id).toBe("prime-composite");
    expect(termsIn("Go straight ahead, then turn right.")).toEqual([]);
    expect(termsIn("Least Common Multiple of 4 and 6?").map((t) => t.id)).toContain("lcm");
    expect(termsIn("Greatest common factor of 12 and 18?").map((t) => t.id)).toContain("gcf");
    const [theory] = termsIn("What is the theoretical probability of red?");
    expect(theory.id).toBe("theoretical");
    expect(theory.meaning).toMatch(/equally likely/);
  });
});
