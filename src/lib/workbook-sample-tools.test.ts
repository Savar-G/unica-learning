import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { requestHash, sampleAiCache } from "../../scripts/workbook-sample-cache";
import { changedPages, pagesMarkdown, samplePages, writePageDiff, type SamplePage } from "../../scripts/workbook-sample-pages";
import { renderSamplePages, samplePrintCache } from "../../scripts/workbook-sample-render";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import { sampleDraft } from "@/lib/workbook-sample";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import type { GeneratedWorkbook } from "@/lib/workbook-generator";
import type { PrintEngine, PrintJob } from "@/lib/workbook-render";

const folders: string[] = [];
const folder = async () => { const path = await mkdtemp(join(tmpdir(), "sample-tools-")); folders.push(path); return path; };
afterEach(async () => { await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const signal = () => new AbortController().signal;
const request = (): AiJsonRequest => ({ name: "item", system: "Use these inputs.", content: [{ type: "text", text: "3 + 4" }], schema: { type: "object" }, effort: "low", maxTokens: 40 });

describe("sample AI replay", () => {
  it("persists exact requests and replays them without invoking the live client", async () => {
    const before = await folder(), after = await folder();
    let calls = 0;
    const live: AiClient = { model: "subscription-model", json: async () => { calls++; return { answer: 7 }; } };
    const first = await sampleAiCache(join(before, "U16-ai-cache.jsonl"));
    expect(await first.client(live).json(request(), signal())).toEqual({ answer: 7 });
    const second = await sampleAiCache(join(after, "U16-ai-cache.jsonl"), before);
    expect(await second.client(live).json(request(), signal())).toEqual({ answer: 7 });
    expect(calls).toBe(1);
    expect(second.counts).toMatchObject({ replayed: 1, new: 0, writeReplayed: 1 });
    const entry = JSON.parse(await readFile(join(after, "U16-ai-cache.jsonl"), "utf8"));
    expect(entry).toMatchObject({ hash: requestHash(live.model, request()), request: request(), response: { answer: 7 } });
  });

  it.each(["model", "prompt", "inputs", "schema", "effort", "maxTokens"])("calls the provider when %s changes", async field => {
    const before = await folder(), after = await folder();
    let calls = 0;
    const live: AiClient = { model: "writer", json: async () => { calls++; return { answer: calls }; } };
    const first = await sampleAiCache(join(before, "U16-ai-cache.jsonl"));
    await first.client(live).json(request(), signal());
    const next = request();
    if (field === "prompt") next.system += " Changed.";
    if (field === "inputs") next.content = [{ type: "text", text: "4 + 5" }];
    if (field === "schema") next.schema = { type: "object", required: ["answer"] };
    if (field === "effort") next.effort = "high";
    if (field === "maxTokens") next.maxTokens = 80;
    const second = await sampleAiCache(join(after, "U16-ai-cache.jsonl"), before);
    await second.client({ ...live, model: field === "model" ? "different-model" : live.model }).json(next, signal());
    expect(calls).toBe(2);
    expect(second.counts).toMatchObject({ replayed: 0, new: 1 });
  });

  it("replays solve checks only for exactly the same printed question and current solver request", async () => {
    const before = await folder(), after = await folder();
    let calls = 0;
    const solver = { model: "reader", solve: async () => { calls++; return { answers: [], problem: null }; } };
    const input = { questions: [{ id: "question", text: "Three packs of 4. How many?", picture: null, shown: null, boxes: [{ id: "a", asks: "answer" }] }], key: [] };
    const first = await sampleAiCache(join(before, "U16-ai-cache.jsonl"));
    await first.solver(solver).solve(input, signal());
    const entry = JSON.parse(await readFile(join(before, "U16-ai-cache.jsonl"), "utf8"));
    expect(entry.request.name).toBe("solve_check");
    expect(entry.request.system).toContain("Use only what is printed");
    expect(entry.request.content[0].text).not.toContain('"key"');
    const second = await sampleAiCache(join(after, "U16-ai-cache.jsonl"), before);
    await second.solver(solver).solve(input, signal());
    await second.solver(solver).solve({ ...input, questions: [{ ...input.questions[0], text: "Three packs of 5. How many?" }] }, signal());
    expect(calls).toBe(2);
    expect(second.counts).toMatchObject({ solveReplayed: 1, solveNew: 1 });
  });

  it("rejects a corrupt hash and refuses to overwrite its replay source", async () => {
    const before = await folder(), after = await folder();
    await writeFile(join(before, "U16-ai-cache.jsonl"), JSON.stringify({ version: 1, hash: "wrong", model: "m", request: request(), response: 1 }));
    await expect(sampleAiCache(join(after, "U16-ai-cache.jsonl"), before)).rejects.toThrow("Invalid AI cache");
    await expect(sampleAiCache(join(before, "U16-ai-cache.jsonl"), before)).rejects.toThrow("must differ");
  });

  it("keeps repeated exact request answers in their recorded order", async () => {
    const before = await folder(), after = await folder();
    let calls = 0;
    const live: AiClient = { model: "writer", json: async () => ({ attempt: ++calls }) };
    const first = await sampleAiCache(join(before, "U16-ai-cache.jsonl"));
    await first.client(live).json(request(), signal());
    await first.client(live).json(request(), signal());
    const second = await sampleAiCache(join(after, "U16-ai-cache.jsonl"), before);
    expect(await second.client(live).json(request(), signal())).toEqual({ attempt: 1 });
    expect(await second.client(live).json(request(), signal())).toEqual({ attempt: 2 });
    expect(calls).toBe(2);
  });
});

describe("sample strict rendering", () => {
  const job: PrintJob = { html: "page", sheets: 1, page: { width: 816, height: 1056 }, scale: 1 };
  it("shares concurrent exact prints, retains passed pages and renders changed inputs", async () => {
    let calls = 0;
    const engine: PrintEngine = { print: async () => { calls++; return { pdf: new Uint8Array(), pdfPages: 1, images: [], measured: [] }; } };
    const cache = samplePrintCache(engine, 1);
    await Promise.all([cache.print(job), cache.print(structuredClone(job))]);
    cache.retain(1, job);
    await cache.print({ ...job, html: "changed CSS or question" });
    await cache.print(job);
    await cache.print({ ...job, scale: 2 });
    expect(calls).toBe(3);
    expect(cache.stats.hits).toBe(2);
  });

  it("does not cache a failed print", async () => {
    let calls = 0;
    const cache = samplePrintCache({ print: async () => { calls++; throw new Error("printer failed"); } });
    await expect(cache.print(job)).rejects.toThrow("printer failed");
    await expect(cache.print(job)).rejects.toThrow("printer failed");
    expect(calls).toBe(2);
  });

  it("preserves strict failures, proofs only the failed page and assembles pages in order", async () => {
    const draft = sampleDraft({ workbookId: "55555555-5555-4555-8555-555555555555", childId: "22222222-2222-4222-8222-222222222222", qrTokens: ["token-111111111111", "token-222222222222", "token-333333333333"] });
    const fake = fakePrintEngine();
    const broken = fakePrintEngine({ blank: ["1 question-1-content"] });
    const pdf = await PDFDocument.create(); pdf.addPage([612, 792]);
    const bytes = await pdf.save();
    const engine = samplePrintCache({ print: async input => ({
      ...await (input.html.includes('data-measure="page-number">2<') ? broken : fake).print(input), pdf: bytes,
    }) });
    const result = await renderSamplePages({ draft, parentId: "p", template: fixedTemplate(), engine, concurrency: 3,
      problems: [],
    });
    expect((await PDFDocument.load(result.pdf)).getPageCount()).toBe(3);
    expect(result.images).toHaveLength(3);
    expect(result.problems).toEqual([{ page: 2, question: 1, reason: "question 1's content is not printed" }]);
    const jobs = [...fake.jobs, ...broken.jobs];
    expect(jobs).toHaveLength(4);
    expect(jobs.filter(input => input.html.includes("RENDER FAILED"))).toHaveLength(1);
  });
});

describe("sample text and page changes", () => {
  const page = (number: number): SamplePage => ({ number, kind: "practice", title: "Practice", instruction: "Answer.", text: "3 + 4", layout: "same", warnings: [] });
  it("detects text, layout, warnings, additions and removals without marking identical pages", () => {
    const changes = changedPages([page(1), page(2), page(3), page(4), page(6)], [page(1), { ...page(2), text: "4 + 5" }, { ...page(3), layout: "new" }, { ...page(4), warnings: ["failed"] }, page(5)]);
    expect(changes.map(p => [p.number, p.reasons])).toEqual([[2, ["text or answer"]], [3, ["layout input"]], [4, ["warnings"]], [6, ["removed"]], [5, ["added"]]]);
    expect(pagesMarkdown("U16", [page(1)])).toContain("Instruction: Answer.");
  });

  it("writes one before/after image pair for the changed page only", async () => {
    const before = await folder(), out = await folder();
    await writeFile(join(before, "U16-pages.json"), JSON.stringify([page(1), page(2)]));
    for (const path of [before, out]) {
      await mkdir(join(path, "pages/U16"), { recursive: true });
      await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toFile(join(path, "pages/U16/p02.png"));
    }
    expect(await writePageDiff({ label: "U16", before, out, pages: [page(1), { ...page(2), text: "changed" }] })).toEqual([2]);
    const md = await readFile(join(out, "U16-diff.md"), "utf8");
    expect(md).toContain("- Page 2:");
    expect(md).not.toContain("- Page 1:");
    expect(await sharp(join(out, "U16-changed.png")).metadata()).toMatchObject({ width: 728, height: 498 });
  });

  it("reads question text, choices and answers in the template's printed order", async () => {
    const input = sampleDraft({ workbookId: "55555555-5555-4555-8555-555555555555", childId: "22222222-2222-4222-8222-222222222222", qrTokens: ["token-111111111111", "token-222222222222", "token-333333333333"] });
    const pages: GeneratedWorkbook["pages"] = input.pages.map(p => ({ ...p, type: p.number === 1 ? "cover" : "practice", day: null, pageOfDay: null, fit: { status: "fits" }, attempts: 0,
      questions: p.questions.map(q => ({ ...q, slot: String(q.number), part: "practice", attempts: 1, check: { status: "checked" } })),
    }));
    const generated: GeneratedWorkbook = { ...input, model: "fake", pages, counts: { pages: 3, questions: 8, checked: 8, notChecked: 0, failed: 0, failedPages: 0 } };
    const template = fixedTemplate();
    const snapshots = await samplePages(generated, template, []);
    expect(snapshots[1].text).toContain("Question text:");
    expect(snapshots[1].text).toContain("Answer:");
    expect(snapshots[1].text.indexOf("### Question 1")).toBeLessThan(snapshots[1].text.indexOf("### Question 2"));
    const changedTokens = { ...generated, pages: generated.pages.map(p => ({ ...p, qrToken: "other-token-11111111" })) };
    expect(changedPages(snapshots, await samplePages(changedTokens, template, []))).toEqual([]);
  });
});
