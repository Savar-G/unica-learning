import { beforeAll, describe, expect, it } from "vitest";
import { COVER_PAGES, MAX_SHEETS, MAX_TOTAL_PAGES } from "../assemble/plan-book";
import { bookCheckInput, planBook } from "../build/build-book";
import type { BookItem, PageModel, Region } from "../contract";
import { openRenderer } from "../render/typst";
import type { Rendering } from "../renderer";
import { SHAPES } from "../shapes";
import { questionKey, type Shape } from "../shapes/shape";
import { fakeRenderer } from "../testing/fake-renderer";
import { FULL_SIZE_PAGES_A_DAY, fullSizeCheckInput } from "../testing/full-size-book";
import { goldenInput, SYNTHETIC_LEVELS } from "../testing/golden-books";
import { drawPage, paint, pagePng, toPng } from "../testing/raster";
import { skipTypstTests, testAssets } from "../testing/typst";
import { BOOK_CHECK_STEPS, checkBook, checkLayout, checkLevel, formatFinding, type BookCheckInput, type BookFinding } from "./book-checks";
import { attemptOf } from "./findings";
import { itemSourceHash, snapshotItemHashes, sourceKey } from "./source-check";

const PAGES_A_DAY = 4;
const TITLES = { source: "Source", layout: "Layout", level: "Level" } as const;

/** A golden Book 2 of the facts level, planned and drawn: the weak child repeats a sheet with the history of Book 1. */
async function goldenBook(child: "weak" | "strong"): Promise<BookCheckInput> {
  const plan = planBook(goldenInput(SYNTHETIC_LEVELS[0], child));
  if (!plan.ok) throw new Error(plan.problems.join("\n"));
  return bookCheckInput(plan, await fakeRenderer().render(plan.pages), SHAPES, { pagesPerDay: PAGES_A_DAY });
}

let weak: BookCheckInput;
let strong: BookCheckInput;
beforeAll(async () => { [weak, strong] = await Promise.all([goldenBook("weak"), goldenBook("strong")]); });

/**
 * The finding of a check and rule, with the place that the test expects. Each one names its check, sheet, page and slot,
 * on the finding and in its plain words.
 */
function named(findings: readonly BookFinding[], check: BookFinding["check"], rule: string, where: Partial<Pick<BookFinding, "sheet" | "page" | "slot">> = {}): BookFinding {
  const found = findings.find((f) => f.check === check && f.rule === rule && Object.entries(where).every(([k, v]) => f[k as keyof BookFinding] === v));
  if (!found) throw new Error(`No ${check} finding "${rule}" at ${JSON.stringify(where)} in:\n${findings.map(formatFinding).join("\n")}`);
  expect(found.sheet).toMatch(/^\S+$/);
  expect(found.slot).toMatch(/^\S+$/);
  expect(found.page === "none" || Number.isSafeInteger(found.page)).toBe(true);
  const text = formatFinding(found);
  for (const part of [`${TITLES[check]} check`, `sheet "${found.sheet}"`, `page ${found.page}`, `slot "${found.slot}"`]) expect(text).toContain(part);
  expect(text).toContain(found.message);
  return found;
}

const repeatOf = (input: BookCheckInput) => {
  const checked = input.sheets.find((s) => s.attempt >= 2);
  if (!checked) throw new Error("no repeat");
  return { checked, items: input.items.filter((i) => i.sheetId === checked.sheet.id && attemptOf(i) === checked.attempt) };
};
const rowOf = (input: BookCheckInput, item: BookItem) => repeatOf(input).checked.sheet[item.side].rows.find((r) => r.id === item.rowId)!;
const keyOf = (shape: Shape, question: unknown) => `${shape.id} ${questionKey(shape, question)}`;
const isMixed = (input: BookCheckInput, item: BookItem) => { const row = rowOf(input, item); return !row.shape.orderedRuns?.(row.limits, row.items) && Boolean(row.shape.list ?? row.shape.space); };
const withItems = (input: BookCheckInput, change: (items: BookItem[]) => void): BookCheckInput => {
  const items = input.items.map((i) => ({ ...i }));
  change(items);
  return { ...input, items };
};
const pageOf = (input: BookCheckInput, item: BookItem) => input.pages.find((p) => item.id.startsWith(`${p.id}/`))!;

describe("a good book", () => {
  it("passes all three checks: the golden books of both children, as whole planned books", () => {
    expect(checkBook(weak)).toEqual([]);
    expect(checkBook(strong)).toEqual([]);
  });

  it("gives each printed item the item hash of its snapshot row", () => {
    const hashes = snapshotItemHashes(weak.snapshot);
    for (const item of weak.items) expect(hashes.get(sourceKey(item.sheetId, item.side, item.rowId))).toBe(itemSourceHash(item));
    expect(new Set(hashes.values()).size).toBe(hashes.size);
  });
});

describe("the source check", () => {
  it.each<[string, (items: BookItem[]) => void]>([
    ["a tampered item hash (another shape version)", (items) => { items[0].shapeVersion += 1; }],
    ["an unknown row", (items) => { items[0].rowId = "no-such-row"; }],
    ["a foreign sheet", (items) => { items[0].sheetId = "foreign-sheet"; }],
  ])("stops %s", (_name, change) => {
    const bad = withItems(weak, change);
    const finding = named(BOOK_CHECK_STEPS.source(bad), "source", "snapshot-item", { slot: "slot-1" });
    expect(finding.page).toBe(pageOf(weak, weak.items[0]).page);
  });

  it("stops a row that misses a question", () => {
    const [gone] = weak.items;
    const finding = named(BOOK_CHECK_STEPS.source({ ...weak, items: weak.items.slice(1) }), "source", "snapshot-item", { sheet: gone.sheetId, page: pageOf(weak, gone).page });
    expect(finding.message).toMatch(/prints \d+ questions?, and the snapshot row has \d+/);
  });

  it("stops an answer that the second computation does not agree with", () => {
    const bad = withItems(weak, (items) => { items[2].answer = { parts: [{ ...items[2].answer.parts[0], value: String(Number(items[2].answer.parts[0].value) + 1) }] }; });
    const finding = named(BOOK_CHECK_STEPS.source(bad), "source", "answer-twice", { sheet: weak.items[2].sheetId, slot: "slot-3" });
    expect(finding.message).toMatch(/by one computation and ".+" by another/);
  });

  it("stops a repeat that prints a seen question while its row has unseen ones", () => {
    const { items } = repeatOf(weak);
    const before = new Set(weak.history?.lastAttempts.flatMap((a) => a.items.map((i) => `${i.shape} ${i.key}`)));
    const item = items.find((i) => {
      const row = rowOf(weak, i);
      const turned = row.shape.swapped?.(i.question, row.limits);
      return isMixed(weak, i) && !(turned?.inLimits && before.has(keyOf(row.shape, turned.question)));
    });
    if (!item || !weak.history) throw new Error("no unseen question to mark seen");
    const shape = rowOf(weak, item).shape;
    const history = { ...weak.history, books: [...weak.history.books, { bookId: "seen-before", items: [{ shape: shape.id, key: questionKey(shape, item.question) }] }] };
    named(BOOK_CHECK_STEPS.source({ ...weak, history }), "source", "unseen-first", { sheet: item.sheetId, slot: `slot-${item.number}` });
  });

  it("stops a question of the last attempt that prints unswapped when its swapped form is allowed", () => {
    const { checked, items } = repeatOf(weak);
    const history = weak.history;
    if (!history) throw new Error("no history");
    const onSheet = new Set(items.map((i) => keyOf(rowOf(weak, i).shape, i.question)));
    const last = history.lastAttempts.find((a) => a.sheetId === checked.sheet.id)!;
    const before = new Set(last.items.map((i) => `${i.shape} ${i.key}`));
    const item = items.find((i) => {
      const { shape, limits } = rowOf(weak, i);
      const turned = isMixed(weak, i) ? shape.swapped?.(i.question, limits) : null;
      const key = turned && keyOf(shape, turned.question);
      return turned?.inLimits && key !== keyOf(shape, i.question) && !onSheet.has(key!) && !before.has(key!);
    });
    if (!item) throw new Error("no question with a swapped form");
    const shape = rowOf(weak, item).shape;
    const seen = { shape: shape.id, key: questionKey(shape, item.question), side: item.side, rowId: item.rowId, form: JSON.stringify(item.question) };
    const changed = { ...history, lastAttempts: history.lastAttempts.map((a) => (a === last ? { ...a, items: [...a.items, seen] } : a)) };
    named(BOOK_CHECK_STEPS.source({ ...weak, history: changed }), "source", "swapped-form", { sheet: item.sheetId, slot: `slot-${item.number}` });
  });

  it("stops a repeated side that prints the questions of the last attempt in the same order", () => {
    const { checked, items } = repeatOf(weak);
    const history = weak.history;
    if (!history) throw new Error("no history");
    const front = items.filter((i) => i.side === "front");
    const pair = front.findIndex((i, n) => n > 0 && isMixed(weak, i) && front[n - 1].rowId === i.rowId && JSON.stringify(front[n - 1].question) !== JSON.stringify(i.question));
    // Two questions of one row with one difficulty can change places, so the build would have changed the order.
    const bad = withItems(weak, (all) => { const at = all.findIndex((i) => i.id === front[pair].id); all[at].difficulty = all[at - 1].difficulty; });
    const forms = front.map((i) => ({ shape: i.shape, key: questionKey(rowOf(weak, i).shape, i.question), side: i.side, rowId: i.rowId, form: JSON.stringify(i.question) }));
    const lastAttempts = history.lastAttempts.map((a) => (a.sheetId === checked.sheet.id ? { ...a, items: [...forms, ...a.items.filter((i) => i.side === "back")] } : a));
    named(BOOK_CHECK_STEPS.source({ ...bad, history: { ...history, lastAttempts } }), "source", "new-order", { sheet: checked.sheet.id, slot: `slot-${front[0].number}` });
  });

  it("stops a question twice on a sheet when its row has questions the sheet does not print", () => {
    const { items } = repeatOf(weak);
    const twin = items.findIndex((i, n) => n > 0 && isMixed(weak, i) && items[n - 1].rowId === i.rowId);
    const second = items[twin];
    const bad = withItems(weak, (all) => { const at = all.findIndex((i) => i.id === second.id); all[at] = { ...all[at], question: items[twin - 1].question, answer: items[twin - 1].answer }; });
    named(BOOK_CHECK_STEPS.source(bad), "source", "no-repeat", { sheet: second.sheetId, slot: `slot-${second.number}` });
  });
});

/** The drawing of the book with one page image changed. */
const withImage = (input: BookCheckInput, page: number, change: (canvas: ReturnType<typeof drawPage>, model: PageModel) => void): BookCheckInput => {
  const canvas = drawPage(input.pages[page]);
  change(canvas, input.pages[page]);
  const images = input.drawn.images.map((image, i) => (i === page ? toPng(canvas) : image));
  return { ...input, drawn: { ...input.drawn, images } };
};
const regionOf = (page: PageModel, role: Region["role"]) => page.regions.find((r) => r.role === role)!;
const layout = (input: BookCheckInput) => BOOK_CHECK_STEPS.layout(input);

describe("the layout check", () => {
  it("stops a fit assertion that fired: a text wider than its place", () => {
    const texts = weak.drawn.texts.map((t, i) => (i === 0 ? { ...t, natural: { ...t.natural, w: 500 } } : t));
    const finding = named(layout({ ...weak, drawn: { ...weak.drawn, texts } }), "layout", "fit", { page: weak.pages[0].page, slot: "heading" });
    expect(finding.message).toMatch(/is 500 points wide and its place is/);
  });

  it.each<[string, (page: PageModel) => { x: number; y: number }, string]>([
    ["an answer area", (page) => { const { rect } = regionOf(page, "answer"); return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }; }, "answer-1"],
    ["a reach box", (page) => { const { rect } = regionOf(page, "reach"); return { x: rect.x + 4, y: rect.y + rect.h / 2 }; }, "reach-1"],
    ["the spine zone", () => ({ x: 50, y: 400 }), "spine-zone"],
    ["the margin", (page) => ({ x: page.size.w - 18, y: 400 }), "margin"],
  ])("stops ink in %s", (_name, at, slot) => {
    const bad = withImage(weak, 0, (canvas, page) => paint(canvas, { ...at(page), w: 3, h: 3 }));
    named(layout(bad), "layout", "blank-zone-ink", { page: weak.pages[0].page, sheet: weak.pages[0].sheetId, slot });
  });

  it("stops a whole book whose pages and cover are not a multiple of 4", async () => {
    const pages = weak.pages.slice(0, 2);
    const finding = named(layout({ ...weak, pages, drawn: await fakeRenderer().render(pages) }), "layout", "page-count", { sheet: "none", page: "none", slot: "none" });
    expect(finding.message).toBe(`the book has 2 pages and ${COVER_PAGES} cover pages, 6 in all, which is not a multiple of 4`);
  });

  it("stops a whole book of more than 120 pages with its cover, and passes a part of a book", () => {
    const pages = Array.from({ length: MAX_TOTAL_PAGES - COVER_PAGES + 4 }, () => weak.pages[0]);
    const finding = named(checkLayout({ pages, items: weak.items, drawn: weak.drawn, wholeBook: true }), "layout", "page-count", { page: "none" });
    expect(finding.message).toBe(`the book has 120 pages and ${COVER_PAGES} cover pages, 124 in all, and a book has at most ${MAX_TOTAL_PAGES}`);
    expect(checkLayout({ pages, items: weak.items, drawn: weak.drawn, wholeBook: false }).filter((f) => f.rule === "page-count")).toEqual([]);
  });

  it("stops a QR code that reads another payload than its page", () => {
    const pages = weak.pages.map((p, i) => (i === 1 ? { ...p, qr: "https://unicalearning.com/tutor/p/another-page" } : p));
    const finding = named(layout({ ...weak, pages }), "layout", "qr", { page: weak.pages[1].page, slot: "qr" });
    expect(finding.message).toMatch(/^the QR code reads ".+" and must read "https:\/\/unicalearning\.com\/tutor\/p\/another-page"$/);
  });

  it("stops a page whose QR code cannot be read", () => {
    const page = weak.pages[2];
    const images = weak.drawn.images.map((image, i) => (i === 2 ? pagePng({ ...page, regions: page.regions.filter((r) => r.role !== "qr") }) : image));
    const finding = named(layout({ ...weak, drawn: { ...weak.drawn, images } }), "layout", "qr", { page: page.page, slot: "qr" });
    expect(finding.message).toBe("the image has no QR code that can be read in its box");
  });

  it("names the page of a typesetter that gives no image of it, and stops before it reads the images", () => {
    const drawn: Rendering = { ...weak.drawn, images: weak.drawn.images.map((image, i) => (i === 1 ? new Uint8Array() : image)) };
    expect(layout({ ...weak, drawn })).toEqual([{ check: "layout", rule: "typesetter", sheet: weak.pages[1].sheetId, page: weak.pages[1].page, slot: "page", message: `The typesetter gave no image of page ${weak.pages[1].page}.` }]);
  });
});

describe("the level check", () => {
  it("stops a sheet that is not of the child's level", () => {
    const foreign = { ...weak.sheets[1], sheet: { ...weak.sheets[1].sheet, id: "foreign-sheet" } };
    named(checkLevel({ ...weak, sheets: [weak.sheets[0], foreign] }), "level", "in-level", { sheet: "foreign-sheet", page: "none", slot: "page" });
    const page = { ...weak.pages[3], sheetId: "another-level-sheet" };
    named(checkLevel({ ...weak, pages: [...weak.pages.slice(0, 3), page] }), "level", "in-level", { sheet: "another-level-sheet", page: page.page, slot: "page" });
  });

  it("stops new sheets out of the level order", () => {
    const sheets = [...strong.sheets].reverse().map((s, i) => ({ ...s, startsDay: i === 0 }));
    named(checkLevel({ ...strong, sheets }), "level", "order", { sheet: strong.sheets[0].sheet.id, page: strong.pages[0].page, slot: "page" });
  });

  it("stops a new sheet before a repeat", () => {
    const sheets = [...weak.sheets].reverse().map((s, i) => ({ ...s, startsDay: i === 0 }));
    const repeat = weak.sheets[0];
    const finding = named(checkLevel({ ...weak, sheets }), "level", "repeats-first", { sheet: repeat.sheet.id, page: weak.pages[0].page });
    expect(finding.message).toBe(`attempt ${repeat.attempt} of this sheet comes after a new sheet, and repeats come first`);
  });

  it("stops pages a day that differ from the number set for the book, and a day that starts in the wrong place", () => {
    const finding = named(checkLevel({ ...weak, pagesPerDay: 8 }), "level", "pages-a-day", { sheet: weak.sheets[0].sheet.id, page: weak.pages[0].page, slot: "time-log" });
    expect(finding.message).toBe("day 1 has 4 pages, and this book has 8 pages a day");
    // 2 pages a day of 1 day is 1 sheet, and the book takes 1 more so that it has an even number: 4 pages on its last day.
    expect(checkLevel({ ...weak, pagesPerDay: 2 })).toEqual([]);
    const split = weak.sheets.map((s) => ({ ...s, startsDay: true }));
    named(checkLevel({ ...weak, sheets: split }), "level", "pages-a-day", { sheet: weak.sheets[1].sheet.id, page: weak.pages[2].page });
    const late = weak.sheets.map((s) => ({ ...s, startsDay: false }));
    named(checkLevel({ ...weak, sheets: late }), "level", "pages-a-day", { sheet: weak.sheets[0].sheet.id, page: weak.pages[0].page });
  });

  it("runs the order and the days only for a whole planned book", () => {
    const sheets = [...weak.sheets].reverse();
    expect(checkLevel({ ...weak, sheets, pagesPerDay: undefined })).toEqual([]);
  });
});

describe("a full-size book of 120 pages", () => {
  /**
   * Times each check of the book. The engine has no clock; the test does. The budget is on the processor time of this
   * process, which other programs on a busy computer do not add to; the time on the clock is printed beside it.
   */
  function timed(input: BookCheckInput) {
    const ms: Record<string, number> = {};
    const findings: BookFinding[] = [];
    const cpu = process.cpuUsage();
    const start = performance.now();
    for (const [name, step] of Object.entries(BOOK_CHECK_STEPS)) {
      const at = performance.now();
      findings.push(...step(input));
      ms[name] = Math.round(performance.now() - at);
    }
    const used = process.cpuUsage(cpu);
    return { findings, ms, totalMs: Math.round(performance.now() - start), cpuMs: Math.round((used.user + used.system) / 1000) };
  }

  it("is 58 sheets: 3 repeats first, the last day with one more sheet, and passes all three checks in under 5 s", async () => {
    const { input } = await fullSizeCheckInput(fakeRenderer());
    expect(input.pages).toHaveLength(2 * MAX_SHEETS);
    expect(input.pages.length + COVER_PAGES).toBe(MAX_TOTAL_PAGES);
    expect(input.pagesPerDay).toBe(FULL_SIZE_PAGES_A_DAY);
    expect(input.sheets.slice(0, 4).map((s) => s.attempt)).toEqual([2, 2, 2, 1]);
    expect(input.sheets.filter((s) => s.startsDay)).toHaveLength(19);
    const { findings, ms, totalMs, cpuMs } = timed(input);
    expect(findings.map(formatFinding)).toEqual([]);
    console.info(`120-page book, fake typesetter: ${JSON.stringify({ ...ms, totalMs, cpuMs })} ms`);
    expect(cpuMs).toBeLessThan(5000);
  }, 60_000);

  it.skipIf(skipTypstTests())("passes all three checks in under 5 s with the page images of Typst", async () => {
    const { input } = await fullSizeCheckInput(await openRenderer(testAssets()));
    const { findings, ms, totalMs, cpuMs } = timed(input);
    expect(findings.map(formatFinding)).toEqual([]);
    console.info(`120-page book, Typst: ${JSON.stringify({ ...ms, totalMs, cpuMs })} ms`);
    expect(cpuMs).toBeLessThan(5000);
  }, 120_000);
});
