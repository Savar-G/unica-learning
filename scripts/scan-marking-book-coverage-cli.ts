// Read a frozen local contract. No image read, render, model, database or credential access.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expectedItems } from "../src/lib/scan-observation";
import { markingRegions, reviewRegions, type MarkingRegion } from "../src/lib/scan-marking-regions";
import { readMarkingOutput, validMarkingOutput, MARKING_PROMPT_VERSION, type MarkingFrame } from "../src/lib/scan-marking";
import { comparisonItemFormat, labelledOutput, type ComparisonPhoto } from "../src/lib/scan-marking-comparison";
import type { WorkbookInput } from "../src/lib/workbook-content";
import { isPrintedRevision, storedPrintContract } from "../src/lib/workbook-print-contract";

globalThis.fetch = async () => { throw new Error("book-coverage-is-offline"); };
const [path, expectedHash] = process.argv.slice(2);
if (!path || !/^[a-f0-9]{64}$/.test(expectedHash ?? "")) throw new Error("Use: node scripts/scan-marking-book-coverage.mjs CONTRACT.json EXPECTED_SHA256");
const bytes = await readFile(path), sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== expectedHash) throw new Error("frozen-contract-hash-mismatch");
const book = JSON.parse(bytes.toString()) as WorkbookInput;
if (!isPrintedRevision(book.printedRevision) || !Array.isArray(book.pages) || !book.pages.length
  || new Set(book.pages.map(p => p.number)).size !== book.pages.length
  || book.pages.some(p => !Number.isSafeInteger(p.number) || p.number < 1 || !p.printContract || !Array.isArray(p.questions)
    || p.questions.some(q => !Number.isSafeInteger(q.number) || q.number < 1)
    || new Set(p.questions.map(q => q.number)).size !== p.questions.length)) throw new Error("frozen-measured-contract-required");
if (book.pages.some(p => !p.image || !storedPrintContract(p.printContract, {
  workbookId: book.id, page: p.number, image: { width: p.image.width, height: p.image.height },
}))) throw new Error("invalid-frozen-page-contract");
const totals = { questions: 0, code: 0, parentMethods: 0, suppliedRight: 0, suppliedNullBlank: 0, suppliedUnclear: 0 };
const formats: Record<string, number> = {}, readingFormats: Record<string, number> = {}, gaps = new Map<string, { page: number; question: number; reason: string }>();
function answer(r: MarkingRegion): string {
  if (r.kind !== "fraction") return String(r.answer);
  const a = r.answer;
  return a.type === "mixed" ? `${a.whole} ${a.numerator}/${a.denominator}` : a.type === "fraction" ? `${a.numerator}/${a.denominator}` : String(a.value);
}
for (const page of book.pages) {
  if (!page.questions.length) continue;
  const frame: MarkingFrame = { parentId: "local-offline", childId: book.childId, workbookId: book.id, pageId: `local-page-${page.number}`,
    pageNumber: page.number, photo: "local-supplied-reading", printedRevision: book.printedRevision, ready: true,
    questions: page.questions.map(q => ({ number: q.number, package: q.package, regions: q.regions ?? null, teaching: q.teaching ?? null })) };
  const expected = expectedItems(frame);
  const supported = new Set<string>();
  for (const e of expected) {
    const q = frame.questions.find(q => q.number === e.number)!;
    const format = q.package?.item?.format ?? "missing";
    formats[format] = (formats[format] ?? 0) + 1;
    totals.questions++;
    const gap = (reason: string) => gaps.set(`${page.number}:${q.number}`, { page: page.number, question: q.number, reason });
    if (e.method === "parent" && e.review === "two-ways" && reviewRegions(q).length >= 3 && !e.mastery.eligible) {
      totals.parentMethods++; readingFormats["two-ways"] = (readingFormats["two-ways"] ?? 0) + 1;
    } else if (e.method === "code" && markingRegions(q).length > 0) {
      totals.code++; supported.add(e.identity.itemId);
      const readingFormat = comparisonItemFormat(frame, e.identity.itemId);
      readingFormats[readingFormat] = (readingFormats[readingFormat] ?? 0) + 1;
    }
    else gap(`No supported measured route: ${e.method}/${format}`);
  }
  for (const mode of ["right", "blank", "unclear"] as const) {
    const photo: ComparisonPhoto = { id: "local-supplied-reading", clear: mode !== "unclear", image: { path: "unused", sha256: "0".repeat(64), width: 1, height: 1, metadataFree: true }, frame,
      truth: expected.map(e => {
        const q = frame.questions.find(q => q.number === e.number)!;
        return { itemId: e.identity.itemId, format: supported.has(e.identity.itemId) ? comparisonItemFormat(frame, e.identity.itemId) : "two-ways",
          result: e.method === "parent" ? "parent" : mode === "unclear" ? "uncertain" : mode,
          readings: supported.has(e.identity.itemId) ? markingRegions(q).map(r => ({ regionId: r.id, state: mode === "right" ? "written" : mode === "blank" ? "blank" : "uncertain",
            text: mode === "right" ? answer(r) : null, issue: mode === "unclear" ? "blurry" : null })) : [] };
      }) };
    const output = labelledOutput(photo);
    if (!validMarkingOutput(frame, output)) throw new Error(`invalid-supplied-reading-schema-page-${page.number}`);
    const observations = readMarkingOutput(frame, output);
    for (const e of expected) {
      const found = observations.filter(o => o.identity.itemId === e.identity.itemId);
      const o = found.length === 1 ? found[0] : null;
      if (supported.has(e.identity.itemId)) {
        const correct = mode === "unclear" ? o?.result === null && o.issue === "blurry" : o?.result === mode;
        if (!correct) gaps.set(`${page.number}:${e.number}`, { page: page.number, question: e.number, reason: `Supplied ${mode} reading failed the public reader` });
        else if (mode === "right") totals.suppliedRight++; else if (mode === "blank") totals.suppliedNullBlank++; else totals.suppliedUnclear++;
      } else if (e.method === "parent" && (!o || o.result !== null || o.state !== "parent-pending" || o.mastery.eligible)) {
        gaps.set(`${page.number}:${e.number}`, { page: page.number, question: e.number, reason: "Parent methods received an automatic result or mastery eligibility" });
      }
    }
  }
}
const complete = totals.questions > 0 && gaps.size === 0 && totals.code + totals.parentMethods === totals.questions;
console.log(JSON.stringify({ label: "Offline supplied-reading coverage, not recognition or print approval", sha256, prompt: MARKING_PROMPT_VERSION,
  pages: book.pages.length, ...totals, unsupported: gaps.size, formats: Object.fromEntries(Object.entries(formats).sort()),
  readingFormats: Object.fromEntries(Object.entries(readingFormats).sort()), complete, gaps: [...gaps.values()] }, null, 2));
if (!complete) process.exitCode = 1;
