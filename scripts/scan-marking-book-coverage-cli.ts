// Read a frozen local contract. No image read, render, model, database or credential access.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expectedItems, firstObservation, type ExpectedItem, type Observation } from "../src/lib/scan-observation";
import { markingRegions, type MarkingRegion } from "../src/lib/scan-marking-regions";
import { suppliedFilledInText, suppliedMethodText } from "../src/lib/scan-marking-methods";
import { markingPageView, readMarkingOutput, TWO_WAYS_METHOD_MARKS, validMarkingOutput, waitsForTeam, MARKING_PROMPT_VERSION, type MarkingFrame } from "../src/lib/scan-marking";
import { HISTORY_LABELS } from "../src/lib/scan-history";
import { comparisonItemFormat, labelledOutput, type ComparisonPhoto } from "../src/lib/scan-marking-comparison";
import { isUuid, storedQuestion, type WorkbookInput } from "../src/lib/workbook-content";
import { QUESTION_PACKAGE_VERSION } from "../src/lib/question-package";
import { isPrintedRevision, storedPrintContract } from "../src/lib/workbook-print-contract";

globalThis.fetch = async () => { throw new Error("book-coverage-is-offline"); };
const [path, expectedHash] = process.argv.slice(2);
if (!path || !/^[a-f0-9]{64}$/.test(expectedHash ?? "")) throw new Error("Use: node scripts/scan-marking-book-coverage.mjs CONTRACT.json EXPECTED_SHA256");
const bytes = await readFile(path), sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== expectedHash) throw new Error("frozen-contract-hash-mismatch");
const book = JSON.parse(bytes.toString()) as WorkbookInput;
if (!isUuid(book.id) || !isUuid(book.childId) || !isPrintedRevision(book.printedRevision) || !Array.isArray(book.pages) || !book.pages.length
  || new Set(book.pages.map(p => p.number)).size !== book.pages.length
  || book.pages.some(p => !Number.isSafeInteger(p.number) || p.number < 1 || !p.printContract || !Array.isArray(p.questions)
    || p.questions.some(q => !Number.isSafeInteger(q.number) || q.number < 1)
    || new Set(p.questions.map(q => q.number)).size !== p.questions.length)) throw new Error("frozen-measured-contract-required");
if (book.pages.some(p => !p.image || ![p.image.width, p.image.height].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 10000)
  || !storedPrintContract(p.printContract, {
  workbookId: book.id, page: p.number, image: { width: p.image.width, height: p.image.height },
}))) throw new Error("invalid-frozen-page-contract");
const totals = { questions: 0, aiMarked: 0, parent: 0, suppliedRight: 0, suppliedNullBlank: 0, suppliedUnclear: 0, suppliedWrongMethod: 0, suppliedMissingMethod: 0, suppliedDoesNotSolve: 0, suppliedFilledIn: 0, suppliedTwoWaysToTeam: 0 };
/** Labels that ask a parent to judge. Counted from what markingPageView shows for each stored question, on each path. */
const ASKS_PARENT = /please check|check this answer|check both/i;
const judging: Record<"not-read-yet" | "model-answer-form" | "alternate-form", { count: number; formats: Record<string, number>; ids: string[] }> = {
  "not-read-yet": { count: 0, formats: {}, ids: [] }, "model-answer-form": { count: 0, formats: {}, ids: [] }, "alternate-form": { count: 0, formats: {}, ids: [] } };
const askedParent = new Set<string>();
function labelAsks(path: keyof typeof judging, e: ExpectedItem, o: Observation | undefined, page: number, format: string) {
  if (!o) return;
  const label = markingPageView([{ expected: e, observation: o, originalEvent: null, eventId: null, at: "2026-11-07T00:00:00.000Z", model: null, prompt: null }]).items[0].label;
  if (!ASKS_PARENT.test(label)) return;
  const id = `p${page}q${e.number}`, row = judging[path];
  row.count++; row.formats[format] = (row.formats[format] ?? 0) + 1; row.ids.push(id); askedParent.add(id);
}
const formats: Record<string, number> = {}, readingFormats: Record<string, number> = {}, gaps = new Map<string, { page: number; question: number; reason: string }>();
function answer(r: MarkingRegion): string {
  if (r.kind === "method") return suppliedMethodText(r, r.id === "method-2" ? 1 : 0);
  if (r.kind !== "fraction") return String(r.answer);
  const a = r.answer;
  return a.type === "mixed" ? `${a.whole} ${a.numerator}/${a.denominator}` : a.type === "fraction" ? `${a.numerator}/${a.denominator}` : String(a.value);
}
for (const page of book.pages) {
  if (!page.questions.length) continue;
  const frame: MarkingFrame = { parentId: "local-offline", childId: book.childId, workbookId: book.id, pageId: `local-page-${page.number}`,
    pageNumber: page.number, photo: "local-supplied-reading", printedRevision: book.printedRevision, ready: true,
    questions: page.questions.map(q => {
      const read = storedQuestion({ ...q, schemaVersion: QUESTION_PACKAGE_VERSION },
        { source: "workbook", workbookId: book.id, page: page.number, question: q.number }, page.image);
      if (read.content.status !== "found") throw new Error(`invalid-stored-question-page-${page.number}-question-${q.number}`);
      return { number: read.number, package: read.content.package, regions: read.regions, teaching: read.teaching };
    }) };
  const expected = expectedItems(frame);
  const supported = new Set<string>();
  for (const e of expected) {
    const q = frame.questions.find(q => q.number === e.number)!;
    const format = q.package?.item?.format ?? "missing";
    formats[format] = (formats[format] ?? 0) + 1;
    totals.questions++;
    const gap = (reason: string) => gaps.set(`${page.number}:${q.number}`, { page: page.number, question: q.number, reason });
    if (e.method === "parent") totals.parent++;
    if (e.method === "code" && markingRegions(q).length > 0) {
      totals.aiMarked++; supported.add(e.identity.itemId);
      const readingFormat = comparisonItemFormat(frame, e.identity.itemId);
      readingFormats[readingFormat] = (readingFormats[readingFormat] ?? 0) + 1;
    }
    else gap(`No supported measured route: ${e.method}/${format}`);
  }
  const pageFormat = (id: string) => supported.has(id) ? comparisonItemFormat(frame, id) : "two-ways";
  // Each stored question, on each path that can show a label: before it is read, when the model calls it an answer form,
  // and when the reading is clear but not the literal key.
  for (const e of expected) {
    const q = frame.questions.find(q => q.number === e.number)!, format = q.package?.item?.format ?? "missing", regions = supported.has(e.identity.itemId) ? markingRegions(q) : [];
    labelAsks("not-read-yet", e, firstObservation(e, frame.photo), page.number, format);
    const n = expected.indexOf(e) + 1, alias = (k: number) => ({ item: `i${n}`, region: `r${n}${k === 0 ? "" : `-${k + 1}`}` });
    const asked = (path: keyof typeof judging, reading: (r: MarkingRegion) => { state: string; text: string | null; issue: string | null }) =>
      labelAsks(path, e, readMarkingOutput(frame, { readings: regions.map((r, k) => ({ ...alias(k), reason: null, verdict: null, ...reading(r) })) }).find(o => o.identity.itemId === e.identity.itemId), page.number, format);
    if (regions.length) asked("model-answer-form", () => ({ state: "uncertain", text: null, issue: "answer-form" }));
    if (regions.some(r => r.kind === "text")) asked("alternate-form", r => r.kind === "text" ? { state: "written", text: `${r.answer} written another way`, issue: null } : { state: "written", text: answer(r), issue: null });
    if (regions.some(r => r.kind === "fraction")) asked("alternate-form", r => r.kind === "fraction" ? { state: "written", text: "1000/1000", issue: null } : { state: "written", text: answer(r), issue: null });
  }
  for (const mode of ["right", "blank", "unclear", "wrong-method", "missing-method", "does-not-solve", "filled-in"] as const) {
    // A bad method changes only a two-ways item. Every other item keeps its right reading, so the whole page stays valid.
    const badMethod = mode === "wrong-method" || mode === "missing-method" || mode === "does-not-solve" || mode === "filled-in";
    const photo: ComparisonPhoto = { id: "local-supplied-reading", clear: mode !== "unclear", image: { path: "unused", sha256: "0".repeat(64), width: 1, height: 1, metadataFree: true }, frame,
      truth: expected.map(e => {
        const q = frame.questions.find(q => q.number === e.number)!;
        return { itemId: e.identity.itemId, format: pageFormat(e.identity.itemId), result: mode === "unclear" ? "uncertain" : badMethod ? "right" : mode,
          readings: supported.has(e.identity.itemId) ? markingRegions(q).map(r => {
            if (mode === "wrong-method" && r.kind === "method") return { regionId: r.id, state: "written" as const, text: suppliedMethodText(r, r.id === "method-2" ? 1 : 0, true), issue: null, verdict: "solves" as const };
            if (mode === "does-not-solve" && r.kind === "method") return { regionId: r.id, state: "written" as const, text: answer(r), issue: null, verdict: "does-not-solve" as const };
            if (mode === "filled-in" && r.kind === "method") return { regionId: r.id, state: "written" as const, text: r.id === "method-2" ? suppliedMethodText(r, 1) : suppliedFilledInText(r), issue: null, verdict: "solves" as const };
            if (mode === "missing-method" && r.id === "method-2") return { regionId: r.id, state: "blank" as const, text: "", issue: null };
            const written = mode === "right" || badMethod;
            return { regionId: r.id, state: written ? "written" as const : mode === "blank" ? "blank" as const : "uncertain" as const, text: written ? answer(r) : null, issue: mode === "unclear" ? "blurry" as const : null, ...(r.kind === "method" && written ? { verdict: "solves" as const } : {}) };
          }) : [] };
      }) };
    const output = labelledOutput(photo);
    if (!validMarkingOutput(frame, output)) throw new Error(`invalid-supplied-reading-schema-page-${page.number}`);
    const observations = readMarkingOutput(frame, output);
    for (const e of expected) {
      const found = observations.filter(o => o.identity.itemId === e.identity.itemId);
      const o = found.length === 1 ? found[0] : null;
      if (!supported.has(e.identity.itemId) || (badMethod && !e.twoWays)) continue;
      // Until the method rules ship, every two-ways reading waits for our team, whatever it shows.
      if (e.twoWays && !TWO_WAYS_METHOD_MARKS) {
        if (!o || o.result !== null || o.state !== "pending" || !waitsForTeam({ observation: o, model: null })) gaps.set(`${page.number}:${e.number}`, { page: page.number, question: e.number, reason: `Supplied ${mode} two-ways reading did not wait for our team` });
        else totals.suppliedTwoWaysToTeam++;
        continue;
      }
      const correct = mode === "unclear" ? o?.result === null && o.issue === "blurry" : mode === "filled-in" ? o?.result === null && o.issue === "method-form" : badMethod ? o?.result === "wrong" : o?.result === mode;
      if (!correct) gaps.set(`${page.number}:${e.number}`, { page: page.number, question: e.number, reason: `Supplied ${mode} reading failed the public reader` });
      else if (mode === "right") totals.suppliedRight++; else if (mode === "blank") totals.suppliedNullBlank++; else if (mode === "unclear") totals.suppliedUnclear++;
      else if (mode === "wrong-method") totals.suppliedWrongMethod++; else if (mode === "missing-method") totals.suppliedMissingMethod++;
      else if (mode === "does-not-solve") totals.suppliedDoesNotSolve++; else totals.suppliedFilledIn++;
    }
  }
}
const parentJudgingLabels = { questions: askedParent.size, byPath: judging,
  // The page history's fixed text, on top of the item labels (src/lib/scan-history.ts).
  historyLabelsAskingParent: Object.values(HISTORY_LABELS).filter(label => ASKS_PARENT.test(label)) };
const complete = totals.questions > 0 && gaps.size === 0 && totals.aiMarked === totals.questions && totals.parent === 0;
console.log(JSON.stringify({ label: "Offline supplied-reading coverage, not recognition or print approval", sha256, prompt: MARKING_PROMPT_VERSION,
  pages: book.pages.length, ...totals, unsupported: gaps.size, formats: Object.fromEntries(Object.entries(formats).sort()),
  readingFormats: Object.fromEntries(Object.entries(readingFormats).sort()), complete, parentJudgingLabels, gaps: [...gaps.values()] }, null, 2));
if (!complete) process.exitCode = 1;
