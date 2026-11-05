import { describe, expect, it } from "vitest";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { bottomGapLimit, circleProblem, layoutProblems, repeatedInstruction } from "@/lib/workbook-layout-check";
import type { DayContent } from "@/lib/workbook-page";
import { renderWorkbook, type DraftPage, type MeasuredElement } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { fullnessProblem, pagePlan, workbookTemplate } from "@/lib/workbook-template";

// The layout checks of Savar's page reviews (src/lib/workbook-layout-check.ts) on measured pages: each check passes a
// page laid out as the template means it and fails the same page with the fault he found by eye. The measurements are
// written here as the real print engine gives them (rects, first lines, baselines, fonts, clipping), so the tests stay
// fast; src/lib/workbook-template-chromium.test.ts lays real pages out.

const draft = sampleBook({ level: "U12", workbookId: "55555555-5555-4555-8555-000000000021", childId: "22222222-2222-4222-8222-222222222222", child: "Mateo", number: 1 }).draft;
const source = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length >= 4)!;
const base = source.questions.find((q) => !q.package.answer?.unit && q.package.answer?.value.type !== "quantity")!.package;

/** A practice page of `n` questions in two slots (1 and 2 Getting started, the rest On your own), on the measured layout. */
function page(n = 6, over: Partial<DayContent> = {}): DraftPage {
  const c = source.content as DayContent;
  const items = Array.from({ length: n }, (_, i) => i + 1);
  const content: DayContent = {
    ...c, consistentLayout: true, fillingComplete: false, atMaximum: false, subtitle: "Write the answer in the box.", grownUp: null,
    blocks: [{ slot: "finish-these", items: items.slice(0, 2) }, { slot: "on-your-own", items: items.slice(2) }], ...over,
  };
  return { ...source, type: "practice", content, questions: items.map((number) => ({ number, package: base })) };
}

type Rect = { x: number; y: number; width: number; height: number };
const el = (name: string, r: Rect, more: Partial<MeasuredElement> = {}): MeasuredElement => ({
  sheet: 0, name, text: "", visible: true, textPrinted: true, ...r,
  clientWidth: r.width, clientHeight: r.height, scrollWidth: r.width, scrollHeight: r.height, ...more,
});
/** Text whose first line starts at `y`: a 19 px line, its baseline 15 px down. */
const text = (name: string, r: Rect, font = "Unica Sans 400 15px", t = "text") =>
  el(name, r, { text: t, font, firstLine: { x: r.x, y: r.y, width: r.width, height: 19, baseline: r.y + 15 }, clip: { top: 0, bottom: 0, left: 0, right: 0 } });

/**
 * A page as the template lays it out: the content area at 184; "Getting started", a row of questions 1 and 2, then
 * "On your own" 16 px under it and the rest in rows of two, 12 px apart. Each question: its number and first line on
 * one baseline at the row's top, its 64 px box at the column's right edge with its top at the line's top.
 */
function laidOut(n = 6, edit: (m: Map<string, MeasuredElement>) => void = () => {}): Map<string, MeasuredElement> {
  const m = new Map<string, MeasuredElement>();
  const put = (e: MeasuredElement) => m.set(e.name, e);
  put(el("slot-content", { x: 64, y: 184, width: 688, height: 736 }));
  put(text("slot-title", { x: 64, y: 120, width: 300, height: 38 }, "Unica Sans 300 30px", "Practice"));
  put(text("slot-subtitle", { x: 64, y: 160, width: 300, height: 21 }, "Unica Sans 400 15px", "Write the answer in the box."));
  let y = 184;
  const label = (name: string, t: string) => { put(text(name, { x: 64, y, width: 688, height: 16 }, "Unica Mono 500 13px", t)); y += 16 + 6; };
  label("heading-0", "Getting started");
  for (let first = 1; first <= n; first += 2) {
    if (first === 3) { y += 16 - 12; label("heading-1", "On your own"); }
    for (const q of [first, first + 1].filter((k) => k <= n)) {
      const x = q % 2 === 1 ? 64 : 424;
      put(el(`question-${q}`, { x, y, width: 328, height: 64 }));
      put(text(`number-${q}`, { x, y, width: 22, height: 19 }, "Unica Mono 500 14px", `${q}.`));
      put(text(`question-${q}-content`, { x: x + 34, y, width: 200, height: 40 }));
      put(el(`question-${q}-answer`, { x: x + 264, y, width: 64, height: 64 }));
    }
    y += 64 + 12;
  }
  edit(m);
  return m;
}
const move = (m: Map<string, MeasuredElement>, name: string, by: Partial<Rect>) => {
  const e = m.get(name)!;
  const dy = by.y ?? 0;
  m.set(name, { ...e, ...Object.fromEntries(Object.entries(by).map(([k, v]) => [k, (e[k as keyof Rect] as number) + (v as number)])),
    ...(e.firstLine ? { firstLine: { ...e.firstLine, y: e.firstLine.y + dy, baseline: e.firstLine.baseline + dy } } : {}) });
};
const check = (p: DraftPage, m: Map<string, MeasuredElement>) => layoutProblems(p, m, pagePlan(p));
const reasons = (p: DraftPage, m: Map<string, MeasuredElement>) => check(p, m).map((x) => x.reason);
/** Every measured part of a question moved together. */
const moveQuestion = (m: Map<string, MeasuredElement>, q: number, by: Partial<Rect>) => {
  for (const name of [`question-${q}`, `number-${q}`, `question-${q}-content`, `question-${q}-answer`]) move(m, name, by);
};

describe("the layout checks", () => {
  it("pass a page laid out as the template means it, and mark every problem as a layout problem", () => {
    expect(check(page(), laidOut())).toEqual([]);
    const crowded = check(page(), laidOut(6, (m) => move(m, "heading-1", { y: -10 })));
    expect(crowded.length).toBeGreaterThan(0);
    expect(crowded.every((x) => x.kind === "layout")).toBe(true);
  });

  it("1: leave no room at a page's foot for another row of its questions", () => {
    // Rows of 64 px with 12 between: 60 px is the most room left at the foot.
    expect(bottomGapLimit(page(), laidOut())).toBe(60);
    const facts = new Map<string, MeasuredElement>([["slot-content", el("slot-content", { x: 64, y: 184, width: 688, height: 300 })]]);
    for (let q = 1; q <= 4; q++) facts.set(`question-${q}`, el(`question-${q}`, { x: q % 2 ? 64 : 424, y: 184 + Math.floor((q - 1) / 2) * 40, width: 328, height: 30 }));
    // Two rows of 30 px, 10 apart, end at 254: 230 px are left, room for another row.
    expect(bottomGapLimit(page(4), facts)).toBe(40);
    expect(fullnessProblem(page(4), facts)).toMatch(/empty at the bottom/);
    // The same rows with 30 px under them: no problem at the foot; with 41, room for another row.
    const foot = (h: number) => fullnessProblem(page(4), new Map([...facts, ["slot-content", el("slot-content", { x: 64, y: 184, width: 688, height: h })]])) ?? "";
    expect(foot(100)).not.toMatch(/empty at the bottom/);
    expect(foot(111)).toMatch(/leaves 41 px empty at the bottom/);
  });

  it("2: fail a question crowding the next label, rows unevenly apart, and things too close", () => {
    expect(reasons(page(), laidOut(6, (m) => move(m, "heading-1", { y: -10 })))).toEqual(expect.arrayContaining([expect.stringMatching(/question 1 and 2 sits 6 px above the label "On your own", closer than the 12 px between rows/)]));
    // A label as close to the row above it as to its own questions belongs to neither.
    expect(reasons(page(), laidOut(6, (m) => move(m, "heading-1", { y: -6 })))).toEqual([expect.stringMatching(/the label "On your own" sits 10 px under question 1 and 2 and 12 px above its questions; it belongs to the questions under it/)]);
    // On your own's rows 12 px apart, then 20.
    const uneven = laidOut(8, (m) => { for (const q of [7, 8]) for (const part of ["", "-content", "-answer"]) move(m, `question-${q}${part}`, { y: 8 }); for (const q of [7, 8]) move(m, `number-${q}`, { y: 8 }); });
    expect(reasons(page(8), uneven)).toEqual([expect.stringMatching(/gaps between rows run from 12 px to 20 px \(above question 7 and 8\)/)]);
    expect(reasons(page(8), laidOut(8))).toEqual([]);
    // A work box 2 px over the next row.
    const close = laidOut(6, (m) => m.set("question-3-answer", { ...m.get("question-3-answer")!, height: 74 }));
    expect(reasons(page(), close)).toEqual(expect.arrayContaining([expect.stringMatching(/question 5 and 6 sits 2 px under question 3 and 4; leave at least 4 px/)]));
  });

  it("2: let a page that grows its rows to fill it space its rows wider than its labels", () => {
    // On your own's cells grown by 20 px, their questions at each cell's top: 32 px from one row's ink to the next, 16
    // above the label and 6 under it, as on a page at its maximum.
    const grown = laidOut(6, (m) => {
      for (const q of [3, 4]) m.set(`question-${q}`, { ...m.get(`question-${q}`)!, height: 84 });
      for (const q of [5, 6]) { moveQuestion(m, q, { y: 20 }); m.set(`question-${q}`, { ...m.get(`question-${q}`)!, height: 84 }); }
    });
    expect(reasons(page(6, { fillingComplete: true, atMaximum: true }), grown)).toEqual([]);
    // The same ink on a page that does not grow its rows: the label sits closer to the row above than rows to each other.
    expect(reasons(page(6), grown)).toEqual([expect.stringMatching(/question 1 and 2 sits 16 px above the label "On your own", closer than the 32 px between rows/)]);
  });

  it("3: fail a row whose questions' first lines or numbers sit apart", () => {
    expect(reasons(page(), laidOut(6, (m) => move(m, "question-2-content", { y: 3 })))).toEqual(expect.arrayContaining([
      expect.stringMatching(/questions 1 and 2 share a row, but their first lines are 3 px apart/),
    ]));
  });

  it("3: fail an answer box above its question's first line, a true or false off its baseline, and a box off its column's edge", () => {
    // U16 r18: the text 9 px under the box's top.
    const low = laidOut(6, (m) => { for (const q of [3, 4]) { move(m, `question-${q}-content`, { y: 9 }); move(m, `number-${q}`, { y: 9 }); } });
    expect(reasons(page(), low)).toEqual([3, 4].map((q) => expect.stringMatching(new RegExp(`question ${q}'s answer box starts 9 px above its first line`))));
    const truth = laidOut(6, (m) => m.set("question-4-answer", { ...text("question-4-answer", { x: 688, y: 260, width: 64, height: 68 }, "Unica Sans 400 15px", "true false"), firstLine: { x: 700, y: 255, width: 30, height: 19, baseline: m.get("question-4-content")!.firstLine!.baseline - 5 } }));
    expect(reasons(page(), truth)).toEqual([expect.stringMatching(/question 4's "true" sits 5 px above its first line/)]);
    const inset = laidOut(6, (m) => move(m, "question-5-answer", { x: -15 }));
    expect(reasons(page(), inset)).toEqual([expect.stringMatching(/question 5's answer space ends 15 px short of its column's edge/)]);
  });

  it("4: fail a number in another style, or off its sentence's baseline", () => {
    const style = laidOut(6, (m) => m.set("number-6", { ...m.get("number-6")!, font: "Unica Mono 400 13px" }));
    expect(reasons(page(), style)).toEqual([expect.stringMatching(/question 6's number is in Unica Mono 400 13px; the page's other numbers are in Unica Mono 500 14px/)]);
    // r16's Spot the error: "6." above its sentence.
    const high = laidOut(6, (m) => { const n = m.get("number-6")!; m.set("number-6", { ...n, firstLine: { ...n.firstLine!, baseline: n.firstLine!.baseline - 4 } }); });
    expect(reasons(page(), high)).toEqual(expect.arrayContaining([expect.stringMatching(/question 6's number sits 4 px above its sentence's baseline/)]));
  });

  it("5: fail a page with a question to circle whose instruction does not say so, on every page type", () => {
    const circle = { ...base, item: { ...base.item!, regions: [{ kind: "choice" as const, id: "c", choices: ["true", "false"], mark: "circle" as const, label: null, answer: "true" }] } } as typeof base;
    const tick = { ...base, item: { ...base.item!, regions: [{ kind: "choice" as const, id: "c", choices: ["Yes", "No"], mark: "tick" as const, label: null, answer: "Yes" }] } } as typeof base;
    for (const type of ["practice", "practice-2", "new-idea", "remember-these", "word-problems", "friday-5", "show-what-you-know", "challenge", "level-test"]) {
      const c = { ...(page().content as DayContent), subtitle: `A ${type} page. Write the answer.` };
      expect(circleProblem(c, [{ package: circle, place: "on-your-own" }]), type).toMatch(/does not say to circle/);
      expect(circleProblem({ ...c, subtitle: "Circle true or false." }, [{ package: circle, place: "on-your-own" }]), type).toBeNull();
      expect(circleProblem(c, [{ package: tick, place: "spot-the-error" }]), type).toBeNull();
    }
  });

  it("6: fail an instruction printed twice on a page, from its words or as printed", () => {
    // U16 r16 p4: under the title and beside the New idea chip.
    expect(repeatedInstruction(["Read how it works, then try it. Circle true or false.", "Read how it works, then try it."])).toBe("read how it works then try it");
    expect(repeatedInstruction(["Write the answer in the box. Circle true or false.", "Read how it works, then try it."])).toBeNull();
    const twice = laidOut(6, (m) => {
      m.set("slot-subtitle", text("slot-subtitle", { x: 64, y: 160, width: 300, height: 21 }, undefined, "Read how it works, then try it. Circle true or false."));
      m.set("chipnote-0-0", text("chipnote-0-0", { x: 180, y: 120, width: 300, height: 18 }, undefined, "Read how it works, then try it."));
    });
    expect(reasons(page(), twice)).toEqual([expect.stringMatching(/"read how it works then try it" is printed twice/)]);
  });

  it("7: fail a line of text a box cuts, not a line whose font is a little taller than its box", () => {
    const cut = (top: number) => laidOut(6, (m) => m.set("question-4-content", { ...m.get("question-4-content")!, clip: { top, bottom: 0, left: 0, right: 0 } }));
    expect(reasons(page(), cut(0.7))).toEqual([]);
    expect(reasons(page(), cut(5))).toEqual([expect.stringMatching(/the text "text" is cut by its box/)]);
  });

  it("plan the page's rows and its answers beside each first line from the template", () => {
    const plan = pagePlan(page())!;
    expect(plan.rows).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect([...plan.beside]).toEqual([1, 2, 3, 4, 5, 6].map((n) => [n, { regions: [`question-${n}-answer`], align: "top", inset: 0 }]));
  });

  // Codex's controls on PR #516 at bfdae35 (/tmp/pr516-review-report.md): each passed the checks before.
  describe("Codex's controls", () => {
    it("fail a row partner moved 8 px down, though the two no longer start at one height", () => {
      const moved = laidOut(6, (m) => moveQuestion(m, 2, { y: 8 }));
      expect(reasons(page(), moved)).toEqual(expect.arrayContaining([
        expect.stringMatching(/questions 1 and 2 share a row, but their numbers are 8 px apart/),
        expect.stringMatching(/questions 1 and 2 share a row, but their first lines are 8 px apart/),
      ]));
    });

    it("fail answer spaces all 8 px short of their column's edge, with no peer at the edge", () => {
      const inset = laidOut(6, (m) => { for (let q = 1; q <= 6; q++) move(m, `question-${q}-answer`, { x: -8 }); });
      expect(reasons(page(), inset)).toEqual([1, 2, 3, 4, 5, 6].map((q) => expect.stringMatching(new RegExp(`question ${q}'s answer space ends 8 px short of its column's edge`))));
    });

    it("fail an answer box moved 41 px under its text, and one that is not printed", () => {
      const detached = laidOut(6, (m) => move(m, "question-3-answer", { y: 41 }));
      expect(reasons(page(), detached)).toEqual(expect.arrayContaining([expect.stringMatching(/question 3's answer box starts 41 px below its first line/)]));
      const gone = laidOut(6, (m) => m.delete("question-4-answer"));
      expect(reasons(page(), gone)).toEqual(expect.arrayContaining([expect.stringMatching(/question 4's answer space question-4-answer is not printed beside it/)]));
    });

    it("fail a label 6 px up on a page at its maximum", () => {
      const up = laidOut(6, (m) => move(m, "heading-1", { y: -6 }));
      expect(reasons(page(6, { fillingComplete: true, atMaximum: true }), up)).toEqual([expect.stringMatching(/the label "On your own" sits 10 px under question 1 and 2 and 12 px above its questions; it belongs to the questions under it/)]);
      // Its labels unevenly apart there too.
      // "Remember these" 24 px under its row above, "On your own" 16.
      const p8 = page(8, { fillingComplete: true, atMaximum: true, blocks: [{ slot: "finish-these", items: [1, 2] }, { slot: "on-your-own", items: [3, 4, 5, 6, 7, 8], reviewFrom: 7 }] });
      const uneven = laidOut(8, (m) => {
        const y = m.get("question-5")!.y + 64 + 24;
        m.set("review-1", text("review-1", { x: 64, y, width: 688, height: 16 }, "Unica Mono 500 13px", "Remember these"));
        for (const q of [7, 8]) moveQuestion(m, q, { y: y + 16 + 6 - m.get(`question-${q}`)!.y });
      });
      expect(reasons(p8, uneven)).toEqual([expect.stringMatching(/the gaps above the page's labels run from 16 px \(above the label "On your own"\) to 24 px/)]);
    });

    it("fail rows that grew unevenly on a page at its maximum (seeds ed6ecc9f and 19bacf2a: 35 to 51 px apart)", () => {
      // On your own in two grids, questions 3 to 6, and 7 to 10 under Remember these: the first grid's rows grew 8 px
      // each, the second's 16 (each label 16 px under its row).
      const p8 = page(8, { fillingComplete: true, atMaximum: true, blocks: [{ slot: "finish-these", items: [1, 2] }, { slot: "on-your-own", items: [3, 4, 5, 6, 7, 8], reviewFrom: 7 }] });
      const grown = (second: number) => laidOut(8, (m) => {
        moveQuestion(m, 5, { y: 8 }); moveQuestion(m, 6, { y: 8 });
        const y = m.get("question-5")!.y + 64 + 16;
        m.set("review-1", text("review-1", { x: 64, y, width: 688, height: 16 }, "Unica Mono 500 13px", "Remember these"));
        for (const q of [7, 8]) moveQuestion(m, q, { y: y + 16 + 6 - m.get(`question-${q}`)!.y });
        // A third row in the second grid, its gap grown by `second`.
        for (const q of [9, 10]) {
          const above = m.get(`question-${q - 2}`)!;
          const yq = above.y + 64 + 12 + second;
          m.set(`question-${q}`, el(`question-${q}`, { x: above.x, y: yq, width: 328, height: 64 }));
          m.set(`number-${q}`, text(`number-${q}`, { x: above.x, y: yq, width: 22, height: 19 }, "Unica Mono 500 14px", `${q}.`));
          m.set(`question-${q}-content`, text(`question-${q}-content`, { x: above.x + 34, y: yq, width: 200, height: 40 }));
          m.set(`question-${q}-answer`, el(`question-${q}-answer`, { x: above.x + 264, y: yq, width: 64, height: 64 }));
        }
      });
      const p10 = { ...p8, content: { ...(p8.content as DayContent), blocks: [{ slot: "finish-these" as const, items: [1, 2] }, { slot: "on-your-own" as const, items: [3, 4, 5, 6, 7, 8, 9, 10], reviewFrom: 7 }] }, questions: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, package: base })) };
      expect(reasons(p10, grown(16))).toEqual([expect.stringMatching(/the gaps between rows run from 20 px to 28 px \(above question 9 and 10\)/)]);
      // Every row grown by the same 8 px: even.
      expect(reasons(p10, grown(8))).toEqual([]);
    });

    it("fail an instruction repeated within one line", () => {
      expect(repeatedInstruction(["Write the answer in the box. Write the answer in the box."])).toBe("write the answer in the box");
      expect(repeatedInstruction(["Write the answer in the box. Circle true or false."])).toBeNull();
      const twice = laidOut(6, (m) => m.set("slot-subtitle", text("slot-subtitle", { x: 64, y: 160, width: 300, height: 21 }, undefined, "Write the answer in the box. Write the answer in the box.")));
      expect(reasons(page(), twice)).toEqual([expect.stringMatching(/"write the answer in the box" is printed twice/)]);
    });
  });

  it("run the measured checks only on what the real print engine measures, and through the template's fit check", async () => {
    // The fake engine stacks every element at one place and gives no lines: no measured problem.
    const p = page();
    const result = await renderWorkbook({ draft: { ...draft, pages: [p] }, parentId: "11111111-1111-4111-8111-111111111111", template: workbookTemplate(), engine: fakePrintEngine({ rects: { "1 slot-content": { x: 64, y: 210, width: 688, height: 720 } } }) });
    expect(result.status === "failed" ? result.problems.filter((x) => x.kind === "layout") : []).toEqual([]);
    // The template's fit check holds the layout checks.
    const fit = workbookTemplate().fit!(p, laidOut(6, (m) => move(m, "question-2-content", { y: 3 })), draft);
    expect(fit).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "layout", reason: expect.stringMatching(/first lines are 3 px apart/) })]));
  });
});
