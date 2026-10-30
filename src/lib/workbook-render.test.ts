import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { workbookProblem, type WorkbookFiles } from "@/lib/workbook-content";
import { renderWorkbook, replaceRendering, saveRenderedWorkbook } from "@/lib/workbook-render";
import { sampleDraft } from "@/lib/workbook-sample";
import { workbookFiles } from "@/lib/workbook-store";
import { memoryWorkbookFiles, memoryWorkbookStore } from "@/lib/workbook-store-memory";
import { fixedTemplate } from "@/lib/workbook-template-fixed";

// The workbook renderer (#309): a workbook's content and a template in; the print PDF, one image per page, each
// question's box on its page image and each page's QR link out. The print engine is behind a seam: these tests use the
// fake engine (src/lib/print-engine-fake.ts), which measures what the template marks the way Chromium does, from rects
// the test gives it. src/lib/print-engine-chromium.test.ts renders the same book with real Chromium.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "55555555-5555-4555-8555-555555555555";
const TOKENS = ["first-page-token-1xx", "first-page-token-2xx", "first-page-token-3xx"];

const draft = () => sampleDraft({ workbookId: WORKBOOK, childId: CHILD, qrTokens: TOKENS });
const render = (engine = fakePrintEngine(), template = fixedTemplate(), fileKey?: string) =>
  renderWorkbook({ draft: draft(), parentId: PARENT, template, engine, fileKey });

describe("renderWorkbook", () => {
  it("renders the sample book to one PDF and one image per page, each page with its QR link", async () => {
    const result = await render();
    if (result.status !== "rendered") throw new Error(JSON.stringify(result));

    expect(result.pages).toEqual([
      { number: 1, qrUrl: "https://unicalearning.com/tutor/p/first-page-token-1xx" },
      { number: 2, qrUrl: "https://unicalearning.com/tutor/p/first-page-token-2xx" },
      { number: 3, qrUrl: "https://unicalearning.com/tutor/p/first-page-token-3xx" },
    ]);
    expect(result.files.map((f) => [f.path, f.contentType])).toEqual([
      [`${PARENT}/${WORKBOOK}/workbook.pdf`, "application/pdf"],
      [`${PARENT}/${WORKBOOK}/page-1.png`, "image/png"],
      [`${PARENT}/${WORKBOOK}/page-2.png`, "image/png"],
      [`${PARENT}/${WORKBOOK}/page-3.png`, "image/png"],
    ]);
    expect(result.files.every((f) => f.bytes.length > 0)).toBe(true);

    // The workbook to store: the PDF and every page image named, US Letter at 150 dots per inch.
    expect(workbookProblem(result.workbook)).toBeNull();
    expect(result.workbook.pdfPath).toBe(`${PARENT}/${WORKBOOK}/workbook.pdf`);
    expect(result.workbook.pages.map((p) => p.image)).toEqual([1, 2, 3].map((n) => ({ path: `${PARENT}/${WORKBOOK}/page-${n}.png`, width: 1275, height: 1650 })));
    expect(result.workbook.pages.map((p) => p.questions.length)).toEqual([0, 4, 4]);
  });

  it("gives each question its measured box, in whole pixels of the page image, covering the measured rect", async () => {
    const engine = fakePrintEngine({
      rects: { "2 question-1": { x: 56, y: 236.5, width: 340, height: 340 }, "2 question-4": { x: 420, y: 600.2, width: 340, height: 340 } },
    });
    const result = await render(engine);
    if (result.status !== "rendered") throw new Error(JSON.stringify(result));
    const boxes = result.workbook.pages[1].questions.map((q) => q.box);
    expect(boxes[0]).toEqual({ x: 87, y: 369, width: 532, height: 532 });
    expect(boxes[3]).toEqual({ x: 656, y: 937, width: 532, height: 533 });
  });

  it("fails a page whose question is outside the page or not laid out", async () => {
    const engine = fakePrintEngine({ rects: { "3 question-2": { x: 600, y: 900, width: 340, height: 340 } } });
    const template = fixedTemplate();
    const dropQuestion4 = { ...template, page: (...a: Parameters<typeof template.page>) => template.page(...a)?.replace(`data-measure="question-4"`, "") ?? null };
    expect(await render(engine, dropQuestion4)).toEqual({
      status: "failed",
      problems: [
        { page: 2, question: 4, reason: "question 4 is not on the page" },
        { page: 3, question: 2, reason: "question 2 is not inside the page" },
        { page: 3, question: 4, reason: "question 4 is not on the page" },
      ],
    });
  });

  it("fails a page whose content overflows a slot, a question or the page itself, naming it", async () => {
    const engine = fakePrintEngine({ overflow: ["1 slot-title", "2 question-3", "3 sheet"] });
    expect(await render(engine)).toEqual({
      status: "failed",
      problems: [
        { page: 1, question: null, reason: "the title does not fit its space" },
        { page: 2, question: 3, reason: "question 3 does not fit its space" },
        { page: 3, question: null, reason: "the content does not fit the page" },
      ],
    });
  });

  it("fails a page whose number or QR code is not printed, or whose QR code is too small to scan", async () => {
    const template = fixedTemplate();
    const broken = {
      ...template,
      page: (...a: Parameters<typeof template.page>) => {
        const html = template.page(...a)!;
        if (a[0].number === 1) return html.replace(`data-measure="page-number">1<`, `data-measure="page-number">7<`);
        if (a[0].number === 2) return html.replace(`data-measure="qr"`, "");
        return html;
      },
    };
    const engine = fakePrintEngine({ rects: { "3 qr": { x: 700, y: 980, width: 40, height: 40 }, "3 page-number": { x: 700, y: 1050, width: 30, height: 30 } } });
    expect(await render(engine, broken)).toEqual({
      status: "failed",
      problems: [
        { page: 1, question: null, reason: "the page number is not printed" },
        { page: 2, question: null, reason: "the QR code is not printed" },
        { page: 3, question: null, reason: "the page number is not printed" },
        { page: 3, question: null, reason: "the QR code is smaller than 0.6 inches or not inside the page" },
      ],
    });
  });

  it("fails a page whose number, QR code or question is hidden, or whose QR code does not read as the page's link", async () => {
    const engine = fakePrintEngine({
      hidden: ["1 page-number", "1 qr", "2 question-2"],
      qrText: { 2: null, 3: "https://unicalearning.com/tutor/p/another-page-token" },
    });
    expect(await render(engine)).toEqual({
      status: "failed",
      problems: [
        { page: 1, question: null, reason: "the page number is not printed" },
        { page: 1, question: null, reason: "the QR code is not printed" },
        { page: 2, question: null, reason: "the QR code does not read as the page's link" },
        { page: 2, question: 2, reason: "question 2 is hidden" },
        { page: 3, question: null, reason: "the QR code does not read as the page's link" },
      ],
    });
  });

  it("fails a question whose content does not print or lies outside it, or whose answer space is missing or too small", async () => {
    const template = fixedTemplate();
    const noAnswer = { ...template, page: (...a: Parameters<typeof template.page>) => template.page(...a)?.replace(`data-measure="question-4-answer"`, "") ?? null };
    const question = { x: 56, y: 240, width: 340, height: 320 };
    const engine = fakePrintEngine({
      blank: ["1 page-number", "2 question-1-content"],
      hidden: ["3 question-1-answer"],
      rects: {
        "2 question-2": question, "2 question-2-content": { ...question, y: 500, height: 100 },
        "3 question-2": question, "3 question-2-answer": { x: 80, y: 400, width: 200, height: 40 },
      },
    });
    expect(await render(engine, noAnswer)).toEqual({
      status: "failed",
      problems: [
        { page: 1, question: null, reason: "the page number is not printed" },
        { page: 2, question: 1, reason: "question 1's content is not printed" },
        { page: 2, question: 2, reason: "question 2's content is not printed" },
        { page: 2, question: 4, reason: "question 4 has no answer space" },
        { page: 3, question: 1, reason: "question 1 has no answer space" },
        { page: 3, question: 2, reason: "question 2 has no answer space" },
        { page: 3, question: 4, reason: "question 4 has no answer space" },
      ],
    });
  });

  it("prints each page's QR code itself, so a template's own empty QR mark does not pass", async () => {
    const template = fixedTemplate();
    const ownMark = {
      ...template,
      page: (...a: Parameters<typeof template.page>) => template.page(a[0], { ...a[1], qr: `<div data-measure="qr"></div>` }, a[2]),
    };
    const engine = fakePrintEngine();
    expect(await render(engine, ownMark)).toEqual({
      status: "failed",
      problems: [1, 2, 3].map((page) => ({ page, question: null, reason: "the QR code does not read as the page's link" })),
    });
  });

  it("fails a page whose template marks the same part twice, so no mark goes unchecked", async () => {
    const template = fixedTemplate();
    const twice = { ...template, page: (...a: Parameters<typeof template.page>) => template.page(...a)!.replace(`<div class="pill">`, `<div class="pill" data-measure="slot-title">`) };
    const result = await render(fakePrintEngine(), twice);
    expect(result).toEqual({
      status: "failed",
      problems: [2, 3].map((page) => ({ page, question: null, reason: "the template marks slot-title more than once" })),
    });
  });

  it("refuses a print whose PDF does not have one page per page", async () => {
    await expect(render(fakePrintEngine({ pdfPages: 4 }))).rejects.toThrow("print engine: the PDF has 4 pages for 3");
  });

  it("prints a question the fixed template cannot set in columns as its text", async () => {
    const engine = fakePrintEngine();
    const book = draft();
    const q = book.pages[2].questions[0];
    q.package = { ...q.package, text: "12 × 3 = ?", operation: { kind: "multiply", operands: [12, 3] } };
    expect((await renderWorkbook({ draft: book, parentId: PARENT, template: fixedTemplate(), engine })).status).toBe("rendered");
    expect(engine.jobs[0].html).toContain(`<p class="text" data-measure="question-1-content">12 × 3 = ?</p><div class="space" data-measure="question-1-answer"></div>`);
  });

  it("fails a page whose type the template has no layout for, before printing", async () => {
    const engine = fakePrintEngine();
    const book = draft();
    book.pages[2].type = "story";
    expect(await renderWorkbook({ draft: book, parentId: PARENT, template: fixedTemplate(), engine })).toEqual({
      status: "failed", problems: [{ page: 3, question: null, reason: "the template has no layout for a story page" }],
    });
    expect(engine.jobs).toEqual([]);
  });
});

// ---------- Storing a rendered workbook ----------

/** The Supabase file store against a fake Storage API that keeps uploads in a map. `failOn`: a path whose upload fails. */
function supabaseFiles(failOn?: string): WorkbookFiles & { paths(): string[] } {
  const kept = new Map<string, string>();
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const object = url.pathname.replace("/storage/v1/object/workbook-pages/", "");
    if (method === "POST" && object !== url.pathname) {
      if (object === failOn || kept.has(object)) return Response.json({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }, { status: 400 });
      kept.set(object, String(new Headers(init?.headers).get("content-type")));
      return Response.json({ Key: `workbook-pages/${object}` });
    }
    if (method === "DELETE" && url.pathname === "/storage/v1/object/workbook-pages") {
      const { prefixes } = JSON.parse(String(init?.body)) as { prefixes: string[] };
      prefixes.forEach((p) => kept.delete(p));
      return Response.json(prefixes.map((name) => ({ name })));
    }
    throw new Error(`unexpected ${method} ${url.pathname}`);
  } } });
  return { ...workbookFiles(db), paths: () => [...kept.keys()].sort() };
}

const fileStores: [string, (failOn?: string) => WorkbookFiles & { paths(): string[] }][] = [
  ["Supabase", supabaseFiles],
  ["in memory", (failOn) => {
    const files = memoryWorkbookFiles();
    // A failing upload here is stored but its answer is lost, the hardest case to clean up.
    const put = async (f: Parameters<typeof files.put>[0]) => {
      await files.put(f);
      if (f.path === failOn) throw new Error("upload answer lost");
    };
    return { ...files, put, paths: () => [...files.files.keys()].sort() };
  }],
];

describe.each(fileStores)("saveRenderedWorkbook with the %s file store", (_name, makeFiles) => {
  const store = () => memoryWorkbookStore({ children: [{ id: CHILD, parentId: PARENT }], now: () => new Date("2026-10-29T18:00:00.000Z") });
  const rendered = async () => {
    const result = await render(fakePrintEngine({ rects: { "2 question-1": { x: 56, y: 236.5, width: 340, height: 340 } } }));
    if (result.status !== "rendered") throw new Error(JSON.stringify(result));
    return result;
  };
  const allPaths = [`${PARENT}/${WORKBOOK}/page-1.png`, `${PARENT}/${WORKBOOK}/page-2.png`, `${PARENT}/${WORKBOOK}/page-3.png`, `${PARENT}/${WORKBOOK}/workbook.pdf`];

  it("stores every file, then the workbook with its measured boxes", async () => {
    const files = makeFiles();
    const workbooks = store();
    expect(await saveRenderedWorkbook(await rendered(), { files, store: workbooks })).toEqual({ status: "written", workbookId: WORKBOOK });
    expect(files.paths()).toEqual(allPaths);
    const stored = await workbooks.workbook(WORKBOOK);
    expect(stored?.pdfPath).toBe(`${PARENT}/${WORKBOOK}/workbook.pdf`);
    expect(stored?.pages[1].questions[0].box).toEqual({ x: 87, y: 369, width: 532, height: 532 });
  });

  it("removes the files it stored when the store refuses the workbook", async () => {
    const files = makeFiles();
    const workbooks = store();
    const first = await rendered();
    await saveRenderedWorkbook(first, { files: makeFiles(), store: workbooks });
    expect(await saveRenderedWorkbook(first, { files, store: workbooks })).toEqual({ status: "refused", reason: "the workbook id is already used" });
    expect(files.paths()).toEqual([]);
  });

  it("keeps the files when the write answer is lost, since the workbook may be stored", async () => {
    const files = makeFiles();
    const workbooks = store();
    const lost = { ...workbooks, write: async (w: Parameters<typeof workbooks.write>[0]) => { await workbooks.write(w); throw new Error("workbook write: fetch failed"); } };
    await expect(saveRenderedWorkbook(await rendered(), { files, store: lost })).rejects.toThrow("fetch failed");
    expect(files.paths()).toEqual(allPaths);
    expect((await workbooks.workbook(WORKBOOK))?.pdfPath).toBe(`${PARENT}/${WORKBOOK}/workbook.pdf`);
  });

  it("removes the files it stored when an upload fails, and stores no workbook", async () => {
    const files = makeFiles(`${PARENT}/${WORKBOOK}/page-2.png`);
    const workbooks = store();
    await expect(saveRenderedWorkbook(await rendered(), { files, store: workbooks })).rejects.toThrow();
    expect(files.paths()).toEqual([]);
    expect(await workbooks.workbook(WORKBOOK)).toBeNull();
  });
});

describe("replaceRendering", () => {
  const paths = (key: string) => [`${PARENT}/${WORKBOOK}/page-1-${key}.png`, `${PARENT}/${WORKBOOK}/page-2-${key}.png`, `${PARENT}/${WORKBOOK}/page-3-${key}.png`, `${PARENT}/${WORKBOOK}/workbook-${key}.pdf`];
  const moved = { "2 question-1": { x: 60, y: 300, width: 340, height: 320 } };

  /** A stored workbook rendered with key r1, and the same workbook rendered again with key r2 and a moved question. */
  async function setup(failOn?: string) {
    const files = memoryWorkbookFiles();
    const store = memoryWorkbookStore({ children: [{ id: CHILD, parentId: PARENT }], now: () => new Date("2026-10-29T18:00:00.000Z") });
    const first = await render(fakePrintEngine(), fixedTemplate(), "r1");
    if (first.status !== "rendered") throw new Error("first render failed");
    await saveRenderedWorkbook(first, { files, store });
    const second = await render(fakePrintEngine({ rects: moved }), fixedTemplate(), "r2");
    if (second.status !== "rendered") throw new Error("second render failed");
    const previous = (await store.workbook(WORKBOOK))!;
    const put = async (f: Parameters<typeof files.put>[0]) => {
      await files.put(f);
      if (f.path === failOn) throw new Error("upload answer lost");
    };
    return { files: { ...files, put }, kept: () => [...files.files.keys()].sort(), store, second, previous };
  }

  it("stores the new files, swaps the workbook to them in one step, then removes the old files", async () => {
    const { files, kept, store, second, previous } = await setup();
    expect(await replaceRendering(second, { files, store, previous })).toEqual({ status: "written", workbookId: WORKBOOK });
    expect(kept()).toEqual(paths("r2"));
    const after = await store.workbook(WORKBOOK);
    expect(after?.pdfPath).toBe(`${PARENT}/${WORKBOOK}/workbook-r2.pdf`);
    expect(after?.pages[1].questions[0].box).toEqual({ x: 93, y: 468, width: 532, height: 501 });
    expect(after?.pages.map((p) => p.qrToken)).toEqual(TOKENS);
  });

  it("keeps the old rendering and removes every new file when an upload fails, even one whose answer was lost", async () => {
    const { files, kept, store, second, previous } = await setup(`${PARENT}/${WORKBOOK}/page-2-r2.png`);
    await expect(replaceRendering(second, { files, store, previous })).rejects.toThrow("upload answer lost");
    expect(kept()).toEqual(paths("r1"));
    expect(await store.workbook(WORKBOOK)).toEqual(previous);
  });

  it("keeps the old rendering and removes the new files when the store refuses the swap", async () => {
    const { files, kept, store, second, previous } = await setup();
    const refusing = { ...store, saveRendering: async () => ({ status: "refused" as const, reason: "the workbook is not known" }) };
    expect(await replaceRendering(second, { files, store: refusing, previous })).toEqual({ status: "refused", reason: "the workbook is not known" });
    expect(kept()).toEqual(paths("r1"));
  });

  it("reads the workbook when the swap's answer is lost: a swap that happened keeps the new files and removes the old", async () => {
    const { files, kept, store, second, previous } = await setup();
    const lost = { ...store, saveRendering: async (r: Parameters<typeof store.saveRendering>[0]) => { await store.saveRendering(r); throw new Error("fetch failed"); } };
    expect(await replaceRendering(second, { files, store: lost, previous })).toEqual({ status: "written", workbookId: WORKBOOK });
    expect(kept()).toEqual(paths("r2"));
  });

  it("keeps both renderings when the swap's answer is lost and the read still names the old one, since the swap may yet commit", async () => {
    const { files, kept, store, second, previous } = await setup();
    // The swap request is still pending in the database (on a row lock, say) when the client's answer is lost: the
    // read sees the old rendering, then the swap commits.
    let commit!: () => void;
    const held = new Promise<void>((resolve) => { commit = resolve; });
    let pending: Promise<unknown> | undefined;
    const lost = {
      ...store,
      saveRendering: async (r: Parameters<typeof store.saveRendering>[0]) => {
        pending = held.then(() => store.saveRendering(r));
        throw new Error("fetch failed");
      },
    };
    await expect(replaceRendering(second, { files, store: lost, previous })).rejects.toThrow("fetch failed");
    expect(kept()).toEqual([...paths("r1"), ...paths("r2")].sort());
    commit();
    expect(await pending).toEqual({ status: "written", workbookId: WORKBOOK });
    const after = (await store.workbook(WORKBOOK))!;
    const named = [after.pdfPath!, ...after.pages.map((p) => p.image!.path)].sort();
    expect(named).toEqual(paths("r2"));
    expect(named.filter((p) => !kept().includes(p))).toEqual([]);
  });
});
