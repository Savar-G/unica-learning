import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { MeasuredElement, PrintEngine, PrintOutput, WorkbookDraft, WorkbookTemplate, RenderProblem } from "@/lib/workbook-render";
import { renderWorkbook, reviewPrint } from "@/lib/workbook-render";

/** Exact, bounded in-run cache. The CSS, fonts, QR code, dimensions and scale are binding. */
export function samplePrintCache(engine: PrintEngine, limit = 64) {
  const cache = new Map<string, Promise<PrintOutput>>();
  const retained = new Map<number, { key: string; output: Promise<PrintOutput> }>();
  const keyOf = (job: Parameters<PrintEngine["print"]>[0]) => createHash("sha256").update(JSON.stringify(job)).digest("hex");
  const stats = { hits: 0, renders: 0 };
  return {
    stats,
    clear() { cache.clear(); retained.clear(); },
    retain(page: number, job: Parameters<PrintEngine["print"]>[0]) {
      const key = keyOf(job), output = cache.get(key);
      if (output) retained.set(page, { key, output });
    },
    async print(job: Parameters<PrintEngine["print"]>[0]) {
      const key = keyOf(job);
      const previous = cache.get(key) ?? [...retained.values()].find(value => value.key === key)?.output;
      if (previous) {
        stats.hits++;
        cache.delete(key);
        cache.set(key, previous);
        if (cache.size > limit) cache.delete(cache.keys().next().value!);
        return previous;
      }
      stats.renders++;
      const pending = engine.print(job);
      cache.set(key, pending);
      if (cache.size > limit) cache.delete(cache.keys().next().value!);
      try { return await pending; }
      catch (error) { if (cache.get(key) === pending) cache.delete(key); throw error; }
    },
  };
}

export async function parallelMap<T, R>(items: readonly T[], concurrency: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i], i);
    }
  });
  // Finish all active leases before a caller closes the shared browser after an error.
  const settled = await Promise.allSettled(workers);
  const failed = settled.find(result => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results;
}

export async function joinPdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const combined = await PDFDocument.create();
  for (const bytes of parts) {
    const source = await PDFDocument.load(bytes);
    if (source.getPageCount() !== 1) throw new Error("A sample page PDF must contain exactly one page.");
    const [page] = await combined.copyPages(source, [0]);
    combined.addPage(page);
  }
  return combined.save();
}

/** Run the public strict renderer per page. Reuse the exact fit print, and proof only failed pages. */
export async function renderSamplePages(o: {
  draft: WorkbookDraft; parentId: string; template: WorkbookTemplate; engine: PrintEngine;
  problems: RenderProblem[]; concurrency: number;
  onPhase?: (phase: "full-render" | "review-print" | "pdf-assembly", ms: number) => void;
}) {
  const pages = await parallelMap(o.draft.pages, o.concurrency, async page => {
    let measured: MeasuredElement[] = [];
    const engine: PrintEngine = { print: async job => {
      const output = await o.engine.print(job);
      measured = output.measured;
      return output;
    } };
    const draft = { ...o.draft, pages: [page] };
    const started = performance.now();
    const strict = await renderWorkbook({ ...o, draft, engine });
    const strictMeasured = measured;
    o.onPhase?.("full-render", performance.now() - started);
    const strictProblems = strict.status === "failed" ? strict.problems : [];
    const problems = [...o.problems.filter(p => p.page === page.number), ...strictProblems];
    if (strict.status === "rendered" && !problems.length) {
      return { pdf: strict.files[0].bytes, png: strict.files[1].bytes, measured, problems, strictProblems, page: page.number };
    }
    const proofStart = performance.now();
    const proof = await reviewPrint({ ...o, draft, engine, problems });
    o.onPhase?.("review-print", performance.now() - proofStart);
    return { pdf: proof.pdf, png: proof.images[0], measured: strictMeasured, problems, strictProblems, page: page.number };
  });
  const start = performance.now();
  const pdf = await joinPdfs(pages.map(p => p.pdf));
  o.onPhase?.("pdf-assembly", performance.now() - start);
  return { pdf, images: pages.map(p => p.png), problems: pages.flatMap(p => p.problems), strictProblems: pages.flatMap(p => p.strictProblems),
    measured: pages.flatMap((p, i) => p.measured.map(m => ({ ...m, sheet: i }))) };
}
