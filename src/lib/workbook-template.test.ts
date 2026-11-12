import { describe, expect, it } from "vitest";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { packageItem } from "@/lib/question-package";
import { workbookProblem } from "@/lib/workbook-content";
import { renderWorkbook, type DraftPage, type PrintEngine, type WorkbookDraft } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { bandOf, COVER_FOR_CHARS, coverForLine, pagePlan, reviewLayout, workbookTemplate } from "@/lib/workbook-template";
import { generatedDayTime } from "@/lib/workbook-feedback-check";
import { Window } from "happy-dom";
import type { Block, DayContent } from "@/lib/workbook-page";

// The workbook templates (#310) through the renderer with the fake print engine: every page type of the sample books
// has a layout and prints its number and QR code, the rendered book is one the store takes, and the template's fit
// check fails a page whose content overflows a slot, a slot holding more than it takes, or writing space smaller than
// DESIGN.md allows, naming the page, the slot and the question. src/lib/workbook-template-chromium.test.ts lays the same
// pages out in real Chromium.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "55555555-5555-4555-8555-000000000002";
const book = (level: string, testWorkbook = false) =>
  sampleBook({ level, workbookId: WORKBOOK, childId: CHILD, child: "Mateo", number: 2, testWorkbook }).draft;
const render = (draft: WorkbookDraft, engine: PrintEngine = fakePrintEngine()) => renderWorkbook({ draft, parentId: PARENT, template: workbookTemplate(), engine });
/** A book of one page. */
const only = (draft: WorkbookDraft, p: DraftPage): WorkbookDraft => ({ ...draft, pages: [p] });
const first = (draft: WorkbookDraft, type: string) => draft.pages.find((p) => p.type === type)!;
/** The content area where DESIGN.md puts it: 688 by 720 under the header. */
const AREA = { "1 slot-content": { x: 64, y: 210, width: 688, height: 720 } };
const parsedPage = (html: string) => {
  const root = new Window().document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("the workbook templates", () => {
  // Savar's print review (2026-11-09): "Remember these" reads "Review", never twice on a page, and "Remember" once.
  describe("Review and Remember, said once", () => {
    const review = (title: string, blocks: (n: number[]) => Block[]) => {
      const draft = book("U16"), p = first(draft, "practice");
      if (p.content?.kind !== "day") throw new Error("not a day");
      const n = p.questions.map(q => q.number);
      const root = parsedPage(workbookTemplate().page({ ...p, content: { ...p.content, title, blocks: blocks(n) } }, { qr: "", qrUrl: "" }, draft)!);
      const said = [...root.querySelectorAll('[data-measure^="review-"], .chip span')].map(x => x.textContent).filter(t => /review|remember/i.test(t ?? ""));
      return { root, said, title: root.querySelector('[data-measure="slot-title"]')?.textContent };
    };
    it("prints a stored \"Remember these?\" title as \"Review\", with no Review label or pill under it", () => {
      const r = review("Remember these?", n => [{ slot: "on-your-own", items: n.slice(0, 4), reviewFrom: n[2] }, { slot: "remember-these", items: n.slice(4) }]);
      expect(r.title).toBe("Review");
      expect(r.said).toEqual([]);
      expect(r.root.textContent).not.toMatch(/remember these/i);
    });
    it("prints no Review label or pill on a Mixed review page", () => {
      const r = review("Mixed review", n => [{ slot: "practice-row", items: n.slice(0, 4), reviewFrom: n[2] }, { slot: "remember-these", items: n.slice(4) }]);
      expect(r.said).toEqual([]);
    });
    it("prints one Review heading on another page, the first one", () => {
      const r = review("Place value up to 100,000", n => [{ slot: "on-your-own", items: n.slice(0, 4), reviewFrom: n[2] }, { slot: "remember-these", items: n.slice(4) }]);
      expect(r.said).toEqual(["Review"]);
      expect(r.root.querySelector('[data-measure^="review-"]')?.textContent).toBe("Review");
      const pill = review("Place value up to 100,000", n => [{ slot: "on-your-own", items: n.slice(0, 4) }, { slot: "remember-these", items: n.slice(4) }]);
      expect(pill.said).toEqual(["Review"]);
      expect(pill.root.querySelector(".chip.c-rv")?.textContent).toBe("Review");
    });
    // (The review of 42bd5a6d: the fit check's plan split a block in two grids the printed page kept as one.)
    it("plans the grids the printed page prints, one shared decision (reviewLayout)", () => {
      const draft = book("U16"), p = first(draft, "practice");
      if (p.content?.kind !== "day") throw new Error("not a day");
      const n = p.questions.map(q => q.number).slice(0, 6);
      expect(n).toHaveLength(6);
      // Three own questions and three review ones: an odd part each side of the split.
      const at = (title: string): DraftPage => ({ ...p, questions: p.questions.filter(q => n.includes(q.number)),
        content: { ...p.content as DayContent, title, consistentLayout: true, blocks: [{ slot: "on-your-own", items: n, reviewFrom: n[3] }] } });
      const grids = (page: DraftPage) => {
        const root = parsedPage(workbookTemplate().page(page, { qr: "", qrUrl: "" }, draft)!);
        return [...root.querySelectorAll(".two, .cols")].map(g => [...g.querySelectorAll('[data-measure^="question-"]')].map(q => q.getAttribute("data-measure")!).filter(m => /^question-\d+$/.test(m)).map(m => Number(m.slice(9))));
      };
      for (const title of ["Review", "Remember these?", "Mixed review", "Reviewing earlier steps", "Reviews"]) {
        const said = at(title);
        expect(reviewLayout(said)).toEqual([{ open: false, pill: false, at: -1 }]);
        expect(grids(said)).toEqual([n]);
        expect(pagePlan(said)).toMatchObject({ rows: [n.slice(0, 2), n.slice(2, 4), n.slice(4)], incomplete: [] });
      }
      const split = at("Place value up to 100,000");
      expect(reviewLayout(split)).toEqual([{ open: true, pill: false, at: 3 }]);
      expect(grids(split)).toEqual([n.slice(0, 3), n.slice(3)]);
      expect(pagePlan(split)).toMatchObject({ rows: [n.slice(0, 2), n.slice(3, 5)], incomplete: [n[2], n[5]] });
    });
    it("names the level on the cover unless the line would need a third line (U18, the longest level name)", () => {
      const name = (n: number) => "Alexandra Maximiliano Wilhelmina Bartholomew Montgomery".padEnd(n, "a").slice(0, n);
      expect(coverForLine(name(20), 18)).toBe(`Made for ${name(20)} · Level U18 · Decimals to thousandths and moving shapes`);
      expect(coverForLine(name(40), 18)).toBe(`Made for ${name(40)} · Level U18`);
      expect(coverForLine(name(60), 18)).toBe(`Made for ${name(60)} · Level U18`);
      expect(coverForLine("Mila", 16)).toBe("Made for Mila · Level U16 · Big numbers and multiplication facts");
      for (let level = 1; level <= 30; level++) for (const n of [1, 20, 40, 60]) expect(coverForLine(name(n), level).length).toBeLessThanOrEqual(Math.max(COVER_FOR_CHARS, `Made for ${name(n)} · Level U${level}`.length));
    });
    it("leaves out a reminder box label that says Remember again, and keeps any other", () => {
      const draft = book("U16"), p = first(draft, "practice");
      if (p.content?.kind !== "day") throw new Error("not a day");
      const page = (label: string) => parsedPage(workbookTemplate().page({ ...p, content: { ...p.content!, blocks: [{ slot: "reminder", items: [], label, note: "Read the example, then try it.", lines: ["Work it out: 32 + 3 × 6 = [50]."] }] } } as DraftPage, { qr: "", qrUrl: "" }, draft)!);
      const remember = page("Remember");
      expect(remember.querySelector(".chip.c-ni")?.textContent).toBe("Remember");
      expect(remember.querySelector(".panel.p-ni .lab")).toBeNull();
      expect(page("Likelihood")?.querySelector(".panel.p-ni .lab")?.textContent).toBe("Likelihood");
    });
    it("says Read the example once: the box under the Read the example chip keeps only its own label", () => {
      const draft = book("U16"), p = first(draft, "practice");
      if (p.content?.kind !== "day") throw new Error("not a day");
      const page = (label: string | undefined, note: string) => parsedPage(workbookTemplate().page({ ...p, content: { ...p.content!, blocks: [{ slot: "watch-one", items: [], label, note, lines: ["Work it out: 32 + 3 × 6 = [50]."] }] } } as DraftPage, { qr: "", qrUrl: "" }, draft)!);
      const plain = page(undefined, "Read the example, then try it.");
      expect(plain.querySelector(".panel.p-pr .lab")).toBeNull();
      expect(page("Increasing rule", "Read the example, then try it.").querySelector(".panel.p-pr .lab")?.textContent).toBe("Increasing rule");
      expect(page(undefined, "Try these.").querySelector(".panel.p-pr .lab")?.textContent).toBe("Read the example");
    });
  });

  it.each(["Which is greater?", "Which is greater: 8 × 7 or 6 × 6?", "WHICH IS GREATER?"])("prints no repeated choice label for %s", (question) => {
    const draft = book("U12");
    const p = first(draft, "practice");
    if (p.content?.kind !== "day") throw new Error("Expected a day page");
    const q = p.questions[0];
    p.content.blocks = [{ slot: "on-your-own", items: [q.number] }];
    p.questions = [{ ...q, package: { ...q.package, text: question, operation: null, item: {
      format: "tick-one", scorable: true, parentChecked: false, error: null, checks: [],
      regions: [{ id: "answer", kind: "choice", mark: "tick", label: "Which is greater?", choices: ["8 × 7", "6 × 6"], answer: "8 × 7" }],
    } } }];
    const html = workbookTemplate().page(p, { qr: "", qrUrl: "" }, draft)!;
    expect(html).toContain(question);
    expect(html).not.toContain('<span class="rl">Which is greater?</span>');
    expect(html).toContain("8 × 7");
    expect(html).toContain("6 × 6");
    p.questions[0].package.item!.regions[0].label = "Is it right?";
    expect(workbookTemplate().page(p, { qr: "", qrUrl: "" }, draft)).toContain('<span class="rl">Is it right?</span>');
  });

  it.each(["U4", "U16"].flatMap(level => ["practice", "practice-2", "challenge"].map(type => [level, type])))("prints one unambiguous label for a whole Extra page in %s %s", (level, type) => {
    const draft = book(level);
    const p = first(draft, type);
    if (p.content?.kind !== "day") throw new Error("not a day");
    const content = { ...p.content, blocks: p.content.blocks.map(b => ({ ...b, extra: true })) };
    const html = workbookTemplate().page({ ...p, content }, { qr: "", qrUrl: "" }, draft)!;
    const original = workbookTemplate().page(p, { qr: "", qrUrl: "" }, draft)!;
    const root = parsedPage(html);
    expect(root.querySelectorAll('[data-measure^="chipbadge-extra-"]')).toHaveLength(1);
    expect(root.querySelector('.hd [data-measure="chipbadge-extra-page"]')?.textContent).toBe("Extra page: optional");
    expect(root.querySelectorAll('.ct [data-measure^="chipbadge-extra-"]')).toHaveLength(0);
    expect(root.querySelectorAll(".optional-block")).toHaveLength(0);
    for (const q of p.questions) expect(html).toContain(`data-measure="question-${q.number}"`);
    expect(html.match(/class="chiprow"/g)).toHaveLength(original.match(/class="chiprow"/g)?.length ?? 0);
    expect(original).not.toContain(">Extra</span>");
  });

  it.each(["U4", "U16"])("labels only the optional example inside its panel on a mixed %s page", level => {
    const draft = book(level), p = first(draft, "practice");
    if (p.content?.kind !== "day") throw new Error("not a day");
    const content = { ...p.content, blocks: p.content.blocks.map(b => ({ ...b, extra: b.slot === "watch-one" })) };
    const root = parsedPage(workbookTemplate().page({ ...p, content }, { qr: "", qrUrl: "" }, draft)!);
    expect(root.querySelectorAll('[data-measure^="chipbadge-extra-"]')).toHaveLength(1);
    expect(root.querySelector('.panel .lab [data-measure^="chipbadge-extra-"]')?.textContent).toBe("Extra");
    expect(root.querySelectorAll('.chiprow [data-measure^="chipbadge-extra-"], .hd [data-measure^="chipbadge-extra-"]')).toHaveLength(0);
    for (const q of p.questions) expect(root.querySelector(`[data-measure="question-${q.number}"]`)?.closest(".panel")).toBeNull();
  });

  it.each(["U4", "U16"])("keeps an optional %s block and its review inside one visible boundary", level => {
    const draft = book(level), p = first(draft, "practice");
    if (p.content?.kind !== "day") throw new Error("not a day");
    const content = { ...p.content, blocks: p.content.blocks.map(b => ({ ...b, extra: b.slot === "on-your-own",
      ...(b.slot === "on-your-own" ? { reviewFrom: b.items[Math.floor(b.items.length / 2)] } : {}),
    })) };
    const root = parsedPage(workbookTemplate().page({ ...p, content }, { qr: "", qrUrl: "" }, draft)!);
    const group = root.querySelector('.optional-block[data-slot="on-your-own"]');
    expect(group).not.toBeNull();
    expect(group!.querySelectorAll('[data-measure^="chipbadge-extra-"]')).toHaveLength(1);
    expect(group!.querySelector('[data-measure^="review-"]')?.textContent).toBe("Review");
    const optional = content.blocks.find(b => b.extra)!.items;
    for (const q of p.questions) expect(root.querySelector(`[data-measure="question-${q.number}"]`)?.closest(".optional-block") === group).toBe(optional.includes(q.number));
    expect(root.querySelectorAll('.chiprow [data-measure^="chipbadge-extra-"], .hd [data-measure^="chipbadge-extra-"]')).toHaveLength(0);
  });

  it.each(["U4", "U16"])("prints no Extra label or optional boundary on a required %s page", level => {
    const draft = book(level), p = first(draft, "practice");
    if (p.content?.kind !== "day") throw new Error("not a day");
    const template = workbookTemplate();
    const original = template.page(p, { qr: "", qrUrl: "" }, draft)!;
    const html = template.page({ ...p, content: { ...p.content, blocks: p.content.blocks.map(b => ({ ...b, extra: false })) } }, { qr: "", qrUrl: "" }, draft)!;
    expect(html).toBe(original);
    expect(parsedPage(html).querySelectorAll('[data-measure^="chipbadge-extra-"], .optional-block')).toHaveLength(0);
  });

  it("prints required minutes from the draft in How it works and each plan row", () => {
    const draft = book("U16");
    for (const p of draft.pages) if (p.content?.kind === "day") {
      p.content.requiredTimeTarget = 20;
      for (const b of p.content.blocks) if (p.type === "challenge" || p.type === "practice-2") b.extra = true;
    }
    const plan = first(draft, "how-plan");
    if (plan.content?.kind !== "how-plan") throw new Error("not the plan");
    plan.content.minutes = { min: 99, max: 99 };
    const html = workbookTemplate().page(plan, { qr: "", qrUrl: "" }, draft)!;
    const minutes = plan.content.rows.map(r => generatedDayTime(draft.pages.filter(p => p.content?.kind === "day" && p.content.day === r.day)).requiredMinutes);
    expect(html).toContain(`About ${Math.ceil(Math.max(...minutes))} minutes a day, plus Extra if there's time.`);
    // Page 2 says Extra once: the line ends at "plus Extra if there's time." (Savar, 2026-11-09: 5 days a week).
    expect(html).toContain("Do the days in order, 5 days a week.");
    expect(html).toContain(", then choose Scan pages.");
    expect(html).toContain("<span>5 days a week</span>");
    expect(html).not.toContain("Extra blocks are optional.");
    expect(html).not.toContain("99 minutes");
    for (const [i, row] of plan.content.rows.entries()) expect(html).toContain(`data-measure="slot-required-time-${row.day}">${Math.ceil(minutes[i])} min`);
  });

  it("keeps How it works unchanged without Extra and required-time fields", () => {
    const draft = book("U16"), plan = first(draft, "how-plan");
    if (plan.content?.kind !== "how-plan") throw new Error("not the plan");
    plan.content.minutes = { min: 17, max: 17 };
    const html = workbookTemplate().page(plan, { qr: "", qrUrl: "" }, draft)!;
    expect(html).toContain("Do the days in order, 5 days a week. About 17 minutes a day.");
    expect(html).not.toMatch(/REQUIRED TIME|Extra|plan-time|slot-required-time/);
  });

  it("uses the generated row estimate when only the plan page is printed", () => {
    const draft = book("U16"), plan = first(draft, "how-plan");
    if (plan.content?.kind !== "how-plan") throw new Error("not the plan");
    plan.content.rows = plan.content.rows.map(row => ({ ...row, requiredMinutes: row.day + 7.2, extra: true }));
    const html = workbookTemplate().page(plan, { qr: "", qrUrl: "" }, only(draft, plan))!;
    expect(html).toContain("About 18 minutes a day, plus Extra if there's time.");
    expect(html).toContain('data-measure="slot-required-time-1">9 min');
    expect(html).toContain('data-measure="slot-required-time-10">18 min');
  });

  it("prints 20 minutes at the exact budget boundary despite floating-point noise", () => {
    const draft = book("U16"), plan = first(draft, "how-plan");
    if (plan.content?.kind !== "how-plan") throw new Error("not the plan");
    plan.content.rows = plan.content.rows.map(row => ({ ...row, requiredMinutes: 20.000000000000004, extra: true }));
    const html = workbookTemplate().page(plan, { qr: "", qrUrl: "" }, only(draft, plan))!;
    expect(html).toContain("About 20 minutes a day, plus Extra if there's time.");
    expect(html).toContain('data-measure="slot-required-time-1">20 min');
    expect(html).not.toContain("21 min");
  });

  it.each([["U2"], ["U6"], ["U12"], ["U22"]])("lay out every page of a %s sample book, and the book is one the store takes", async (level) => {
    const result = await render(book(level));
    if (result.status !== "rendered") throw new Error(JSON.stringify(result.problems.slice(0, 5)));
    expect(workbookProblem(result.workbook)).toBeNull();
    expect(result.workbook.pages.length % 4).toBe(0);
  });

  it("lays out a level's last book, with the level test", async () => {
    const draft = book("U12", true);
    expect(draft.pages.some((p) => p.type === "level-test")).toBe(true);
    expect((await render(draft)).status).toBe("rendered");
  });

  it("prints on every page its ID, its book page number, its QR code and four scan marks", () => {
    const draft = book("U12");
    const template = workbookTemplate();
    for (const p of [draft.pages[0], draft.pages[1], draft.pages[2], draft.pages.at(-2)!, draft.pages.at(-1)!]) {
      const html = template.page(p, { qr: `<div data-measure="qr"></div>`, qrUrl: "https://unicalearning.com/tutor/p/x" }, draft)!;
      expect(html).toContain(`data-measure="page-number">${p.number}<`);
      expect(html).toContain(p.content!.id);
      expect(html).toContain(`data-measure="qr"`);
      expect(html.match(/class="scan /g)).toHaveLength(4);
    }
  });

  it("prints no read-aloud mark on a card, and a day label with no skill: 'Day 4 · Page 4 of 6' (D-201)", () => {
    const early = book("U2");
    const template = workbookTemplate();
    const ear = "M5 6a3 3 0 1 1 6 0";
    for (const p of early.pages.filter((x) => x.content?.kind === "day")) {
      const c = p.content!;
      if (c.kind !== "day") continue;
      const html = template.page(p, { qr: `<div data-measure="qr"></div>`, qrUrl: "https://unicalearning.com/tutor/p/x" }, early)!;
      expect(html).not.toContain(ear);
      expect(html).toContain(`data-measure="slot-day-label">Day ${c.day} · Page ${c.page} of ${c.pages}</div>`);
    }
  });

  it("uses Name and Date only on each day's first page and removes the level map", () => {
    const draft=book("U6");
    const template=workbookTemplate();
    for(const p of draft.pages) {
      const html=template.page(p,{qr:"",qrUrl:""},draft)!;
      expect(html).not.toContain("My levels");
      if(p.content?.kind==="day") {
        expect(html.includes('class="nd"')).toBe(p.content.page===1);
        expect(html).not.toContain("For the grown-up:");
      }
    }
  });

  it("has no layout for a page with no slot content", async () => {
    const draft = book("U12");
    const bare: DraftPage = { ...draft.pages[2], content: undefined };
    expect(await render(only(draft, bare))).toEqual({
      status: "failed", problems: [{ page: 3, question: null, reason: "the template has no layout for a warm-up page" }],
    });
  });
});

describe("the fit check", () => {
  const draft = book("U12");
  const practice = first(draft, "practice");
  const content = practice.content!;
  if (content.kind !== "day") throw new Error("not a day page");
  const own = content.blocks.find((b) => b.slot === "on-your-own")!;
  const last = own.items.at(-1)!;

  it("fails a page whose question runs past the content area, naming the page, the slot and the question", async () => {
    const engine = fakePrintEngine({
      rects: { "1 slot-content": { x: 64, y: 210, width: 688, height: 720 }, [`1 question-${last}`]: { x: 64, y: 900, width: 100, height: 80 } },
    });
    const result = await render(only(draft, practice), engine);
    expect(result).toEqual({
      status: "failed",
      problems: [{
        page: practice.number, question: last, slot: "on-your-own",
        reason: `day 1 page 3 (practice): question ${last} in the on-your-own slot runs 50 px past the bottom of the content area`,
      }],
    });
  });

  it("fails a slot holding more items than it takes", async () => {
    const extra = practice.questions.slice(0, 4).map((q, k) => {
      const number = practice.questions.length + k + 1;
      return { ...q, number, package: { ...q.package, id: `${q.package.id}-x`, ref: { ...q.package.ref, question: number } as typeof q.package.ref } };
    });
    const crowded: DraftPage = {
      ...practice,
      questions: [...practice.questions, ...extra],
      content: { ...content, blocks: content.blocks.map((b) => (b.slot === "on-your-own" ? { ...b, items: [...b.items, ...extra.map((q) => q.number)] } : b)) },
    };
    const result = await render(only(draft, crowded));
    expect(result.status === "failed" && result.problems).toEqual([
      { page: practice.number, question: null, slot: "on-your-own", reason: "day 1 page 3 (practice): the on-your-own slot holds 9 items; it takes at most 8" },
    ]);
  });

  it("fails an answer box smaller than the level band allows: 40 px from U10, 56 px at U1 to U3", async () => {
    const at = (n: number) => ({
      ...AREA, [`1 question-${n}`]: { x: 64, y: 290, width: 600, height: 80 },
      [`1 question-${n}-content`]: { x: 64, y: 300, width: 30, height: 20 }, [`1 question-${n}-answer`]: { x: 100, y: 300, width: 64, height: 48 },
    });
    const mid = first(draft, "warm-up");
    expect((await render(only(draft, mid), fakePrintEngine({ rects: at(1) }))).status).toBe("rendered");

    const early = book("U2");
    const boxed = (p: DraftPage) => p.questions.find((q) => packageItem(q.package).regions[0].kind === "box");
    const parent = early.pages.find((p) => p.type === "parent-led" && boxed(p))!;
    const n = boxed(parent)!.number;
    const result = await render(only(early, parent), fakePrintEngine({ rects: at(n) }));
    expect(result.status === "failed" && result.problems).toEqual([
      { page: parent.number, question: n, slot: expect.any(String), reason: expect.stringMatching(new RegExp(`question ${n}'s answer box height is 48 px; the design allows no less than 56$`)) },
    ]);
  });

  it("fails an answer box that covers its own question's text (R371-4)", async () => {
    const warm = first(draft, "warm-up");
    const c = warm.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const fix = c.blocks.find((b) => b.slot === "fix-it")!.items[0];
    const engine = fakePrintEngine({
      rects: {
        ...AREA,
        [`1 question-${fix}`]: { x: 100, y: 300, width: 180, height: 60 },
        [`1 question-${fix}-content`]: { x: 130, y: 310, width: 120, height: 22 },
        [`1 question-${fix}-answer`]: { x: 210, y: 305, width: 64, height: 48 },
      },
    });
    const result = await render(only(draft, warm), engine);
    expect(result.status === "failed" && result.problems).toEqual([
      { page: warm.number, question: fix, slot: "fix-it", reason: `day 1 page 1 (warm-up): question ${fix}'s answer box covers its own text` },
    ]);
  });

  it("fails a title of more than 4 words, and one that does not fit on one line (D-201)", async () => {
    const warm = first(draft, "warm-up");
    const c = warm.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const wordy: DraftPage = { ...warm, content: { ...c, title: "Show and read a number on a ten-frame" } };
    const result = await render(only(draft, wordy));
    expect(result.status === "failed" && result.problems.filter((x) => x.slot === "title").map((x) => x.reason)).toEqual([
      expect.stringMatching(/the page title "Show and read a number on a ten-frame" has 8 words; a title has at most 4$/),
    ]);
    const wide = await render(only(draft, warm), fakePrintEngine({ overflow: ["1 slot-title"] }));
    expect(wide.status === "failed" && wide.problems.some((x) => x.slot === "title" && /does not fit on one line/.test(x.reason))).toBe(true);
  });

  it("refuses a banned title or a title that is missing, hidden or blank in the print measurement", async () => {
    const warm = first(draft, "warm-up");
    const c = warm.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const banned = await render(only(draft, { ...warm, content: { ...c, title: "Find the total" } }));
    expect(banned.status === "failed" && banned.problems.some((p) => p.slot === "title" && /banned phrase/.test(p.reason))).toBe(true);
    const missing = fakePrintEngine();
    const engines = [fakePrintEngine({ hidden: ["1 slot-title"] }), fakePrintEngine({ blank: ["1 slot-title"] }), {
      async print(job: Parameters<typeof missing.print>[0]) {
        const out = await missing.print(job);
        return { ...out, measured: out.measured.filter((m) => m.name !== "slot-title") };
      },
    }];
    for (const engine of engines) {
      const result = await render(only(draft, warm), engine);
      expect(result.status === "failed" && result.problems.some((p) => p.slot === "title" && /not printed or measured/.test(p.reason))).toBe(true);
    }
  });

  it.each(Array.from({ length: 30 }, (_, i) => i + 1))("enforces 3 lines on a card at U%i (D-201)", async (level) => {
    const draft = book(`U${level}`);
    const page = draft.pages.find((p) => p.questions.length && p.content?.kind === "day"
      && p.content.blocks.some((b) => level <= 3 || ["picture-stories", "show-what-you-know"].includes(b.slot)))!;
    const c = page.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const block = c.blocks.find((b) => b.items.length && (level <= 3 || ["picture-stories", "show-what-you-know"].includes(b.slot)))!;
    const n = block.items[0];
    const lineHeight = bandOf(level).body * 1.4;
    const lines = (k: number) => fakePrintEngine({ rects: { ...AREA, [`1 question-${n}`]: { x: 64, y: 290, width: 330, height: 200 }, [`1 question-${n}-content`]: { x: 110, y: 300, width: 260, height: lineHeight * k }, [`1 question-${n}-answer`]: { x: 110, y: 420, width: 64, height: 56 } } });
    const three = await render(only(draft, page), lines(3));
    expect(three.status === "failed" ? three.problems.filter((x) => /lines on its card/.test(x.reason)) : []).toEqual([]);
    const four = await render(only(draft, page), lines(4));
    expect(four.status === "failed" && four.problems.filter((x) => /lines on its card/.test(x.reason)).map((x) => x.question)).toEqual([n]);
  });

  it("fails writing lines closer than 36 px under their prompt and 34 px apart, and a work box under 44 px", async () => {
    const stories = first(draft, "word-problems");
    const c = stories.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const story = c.blocks.find((b) => b.slot === "word-problems")!.items[0];
    // (From U4 the stories carry work boxes and no How do you know? line, Savar 2026-11-04.)
    expect(c.blocks.some((b) => b.slot === "how-do-you-know")).toBe(false);
    const boxed = await render(only(draft, stories), fakePrintEngine({ rects: { ...AREA, [`1 region-${story}-work`]: { x: 64, y: 300, width: 500, height: 30 } } }));
    expect(boxed.status === "failed" && boxed.problems.map((p) => [p.question, p.slot, p.reason.replace(/^.*: /, "")])).toEqual([
      [story, "word-problems", `question ${story}'s work box height is 30 px; the design allows no less than 64`],
    ]);
    // A parent-led stories page (U1 to U3) keeps its writing lines.
    const early = book("U3");
    const page = early.pages.find((p) => p.content?.kind === "day" && p.content.blocks.some((b) => b.slot === "how-do-you-know"));
    if (!page || page.content?.kind !== "day") return;
    const why = page.content.blocks.find((b) => b.slot === "how-do-you-know")!.items[0];
    const lined = await render(only(early, page), fakePrintEngine({ rects: { ...AREA, [`1 question-${why}-answer`]: { x: 64, y: 700, width: 688, height: 60 }, [`1 question-${why}`]: { x: 64, y: 690, width: 688, height: 80 } } }));
    expect(lined.status === "failed" && lined.problems.some((p) => p.question === why && /writing space is 60 px/.test(p.reason))).toBe(true);
  });
});

describe("a sequence item", () => {
  it("prints its terms in order with its answer boxes in the blanks, on a parent-led card and in a line (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
    for (const level of ["U2", "U12"]) {
      const draft = book(level);
      const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 0)!;
      const q = page.questions[0];
      const built = buildQuestion({
        slot: "1.1", skill: "K1-number-sequence", difficulty: 1, text: "Fill the gap in the count.", format: "sequence", operation: null, wrongAnswers: [], easier: null,
        shownWrong: null, figure: null, numbers: [], places: null, direction: null, pattern: null, sequence: { start: num(3), step: num(1), terms: 5, blanks: [2, 4] },
      }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K1-number-sequence"] });
      expect(built.check.status).toBe("checked");
      const seqPage: DraftPage = { ...page, questions: [{ number: q.number, package: { ...built.package!, ref: q.package.ref } }, ...page.questions.slice(1)] };
      const html = workbookTemplate().page(seqPage, { qr: "", qrUrl: "" }, draft)!;
      const seq = html.match(/<span class="seq">(.*?)<\/span><\/span>(?!<span class="qm">)/)?.[0] ?? "";
      const printed = [...seq.matchAll(/class="qm">([^<]*)</g)].map((m) => m[1]).filter((t) => t !== ",");
      expect(printed).toEqual(["3", "4", "6"]);
      expect(seq.match(/class="ab"/g)).toHaveLength(2);
      expect(seq).toContain(`data-measure="question-${q.number}-answer"`);
    }
  });
});

describe("an order item and a written reason on a parent-led card", () => {
  it("prints the numbers to put in order before the boxes, and the lines' label only when the question does not ask it (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const num = (value: number) => ({ type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null });
    const draft = book("U2");
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 1)!;
    const [a, b] = page.questions;
    const base = { slot: "1.1", skill: "K1-order-numerals", difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, places: null, sequence: null, pattern: null };
    const place = (q: typeof a) => ({ id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K1-order-numerals"] });
    const order = buildQuestion({ ...base, text: "Put in order, least first.", format: "order", numbers: [num(4), num(9), num(2)], direction: "up" }, place(a));
    const reason = buildQuestion({ ...base, text: "Is 3 more than 2? How do you know?", format: "written-reason", numbers: [], direction: null }, place(b));
    expect([order.check.status, reason.check.status]).toEqual(["checked", "not-checked"]);
    const html = workbookTemplate().page({
      ...page, questions: [{ number: a.number, package: { ...order.package!, ref: a.package.ref } }, { number: b.number, package: { ...reason.package!, ref: b.package.ref } }, ...page.questions.slice(2)],
    }, { qr: "", qrUrl: "" }, draft)!;
    expect(html).toContain(`<span class="seq"><span class="qm">4, 9, 2</span><span class="qm">→</span></span>`);
    expect(html.match(/How do you know\?/g)).toHaveLength(1);
  });
});

describe("a pattern item's choices", () => {
  it("are drawn as the shapes, not written as words (#380)", async () => {
    const { buildQuestion } = await import("@/lib/workbook-generator-items");
    const draft = book("U2");
    const page = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length > 0)!;
    const q = page.questions[0];
    const built = buildQuestion({
      slot: "1.1", skill: "K4-extend-repeating", difficulty: 1, text: "What comes next?", format: "pattern", operation: null, wrongAnswers: [], easier: null,
      shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: { core: ["circle", "triangle"], shapes: 6, blank: 5 },
    }, { id: q.package.id, workbookId: draft.id, page: page.number, question: q.number, level: 2, skills: ["K4-extend-repeating"] });
    expect(built.check.status).toBe("checked");
    const html = workbookTemplate().page({ ...page, questions: [{ number: q.number, package: { ...built.package!, ref: q.package.ref } }, ...page.questions.slice(1)] }, { qr: "", qrUrl: "" }, draft)!;
    const circ = html.match(/<span class="circ"[^>]*>(.*?)<\/span><\/span>/)?.[1] ?? "";
    expect(circ).toContain(`aria-label="circle"`);
    expect(circ).toContain(`aria-label="triangle"`);
    expect(circ).not.toMatch(/<span class="co">(circle|triangle)<\/span>/);
  });
});

it("prints a period after each question number in every page family",()=>{
  const template=workbookTemplate();
  for(const level of ["U2","U6","U12","U22"]) {
    const draft=book(level);
    for(const page of draft.pages) for(const consistentLayout of [false,true]) {
      const p={...page,content:page.content?.kind==="day"?{...page.content,consistentLayout}:page.content};
      const html=template.page(p,{qr:`<div data-measure="qr"></div>`,qrUrl:"https://unicalearning.com/tutor/p/test"},draft)!;
      for(const q of p.questions) expect(html,`${level} ${p.type} q${q.number}`).toMatch(new RegExp(`<span class="(?:n|gn|sn|badge)"(?: data-measure="number-${q.number}")?>${q.number}\\.</span>`));
    }
  }
});


it.each([false, true].flatMap(consistentLayout => [false, true].map(choice => ({ consistentLayout, choice }))))("prints a warm-up tick cue (consistent: $consistentLayout, choice region: $choice, #821)", ({ consistentLayout, choice }) => {
  const draft = book("U8"), p = draft.pages.find(p => p.content?.kind === "day" && p.content.blocks.some(b => b.slot === "warm-up"))!;
  if (p.content?.kind !== "day") throw new Error("not a day");
  const original = p.questions[0], n = p.questions.length + 1;
  const question = { ...original, number: n, package: { ...original.package, text: "Sam says 7 + 6 = 12.",
    item: { format: "spot-the-error" as const, scorable: true, parentChecked: false, error: null, checks: [], regions: [
      ...(choice ? [{ id: "right", kind: "choice" as const, mark: "tick" as const, label: null, choices: ["Yes", "No"], answer: "No" }] : []),
      { id: "fix", kind: "box" as const, label: null, answer: { type: "number" as const, value: 13 } },
    ] } } };
  const page: DraftPage = { ...p, questions: [...p.questions, question], content: { ...p.content, consistentLayout,
    blocks: [...p.content.blocks, { slot: "spot-the-error", items: [n], lines: [] }] } };
  const root = parsedPage(workbookTemplate().page(page, { qr: "", qrUrl: "" }, draft)!);
  expect(root.querySelector(`[data-measure="question-${n}"]`)?.textContent).toContain("Tick one");
});
