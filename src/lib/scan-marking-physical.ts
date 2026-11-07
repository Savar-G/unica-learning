// Physical photos of the frozen, made-up Robin kit. This is not the fixed40 set.
import { COMPARISON_MODELS, COMPARISON_SETTINGS, COMPARISON_DEFERRAL_POLICY, SYNTHETIC_IDS, comparisonItemFormat, hashValue, labelledOutput, scoreComparison, type ComparisonManifest, type ComparisonPhoto, type ComparisonResult, type EndpointEvidence, type TruthRow } from "@/lib/scan-marking-comparison";
import { expectedItems, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { markingRegions } from "@/lib/scan-marking-regions";
import { markingRequest, readMarkingOutput, validMarkingOutput, type MarkingFrame } from "@/lib/scan-marking";

export const PHYSICAL_VERSION = "robin-physical-v1";
export const PHYSICAL_MODEL = COMPARISON_MODELS.find(m => m.model === "anthropic/claude-sonnet-5.5")!;
export const FROZEN_KIT = Object.freeze({
  "Robin-marking-test-booklet.pdf": "d95cec84ed1cd4780e9fef18dd18faf6e02dfa736e02b0e1de1f01bc122b5659",
  "rendered-workbook.json": "52bfbe003525759920a47429e10f6b6431950ecce9ba0ce8caf489a1e1ed84e3",
  "fixture-manifest.json": "81a2b2e9f2e1602a5f0960b5941294c267b54cd2326e98e90ad2d23c5eee2025",
});
export const TRUTH_COLUMNS = ["pdf_page", "printed_page", "page_id", "question", "format", "parent_methods_required", "final_written_answer", "intended_result", "notes", "photo", "item_id", "region_id", "reading_state", "reading_issue", "photo_clarity", "device"] as const;
export interface PhotoMapping { file: string; pdf_page: number; device: "iphone" | "android"; clarity: "clear" | "unclear" }
export interface PhysicalMapping { version: 1; madeUpRobinOnly: true; photos: PhotoMapping[] }
export interface PhysicalPage { pdfPage: number; printedPage: number; label: string; frame: MarkingFrame }
export interface PhysicalPhoto {
  mapping: PhotoMapping; rawSha256: string | null;
  status: "ready" | "refused" | "incomplete"; reason: string | null;
  normalizedSha256: string | null; calibration: unknown; crops: unknown;
  photo: ComparisonPhoto;
}
export interface PhysicalSet {
  version: typeof PHYSICAL_VERSION; proofClass: "physical-input" | "local-fake";
  kit: typeof FROZEN_KIT; draftSha256: string; revision: string; truthSha256: string; mappingSha256: string;
  photos: PhysicalPhoto[]; missing: string[];
  inventory: { file: string; rawSha256: string | null; reason: string | null }[];
}
const fail = (reason: string): never => { throw Error(reason); };
export const safePhotoName = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.(jpg|jpeg|png|webp|heic|heif)$/i.test(s) && !s.includes("..");

/** Strict RFC4180 subset, including multiline quoted notes. No quote repair or dropped rows. */
export function parseTruthCsv(text: string): Record<string, string>[] {
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (!text || text.includes("\0")) fail("empty-or-nul-csv");
  const rows: string[][] = []; let row: string[] = [], field = "", mode: "start" | "plain" | "quoted" | "closed" = "start";
  const cell = () => { row.push(field); field = ""; mode = "start"; };
  const line = () => { cell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (mode === "quoted") {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else mode = "closed"; }
      else field += ch;
    } else if (ch === ",") cell();
    else if (ch === "\r" || ch === "\n") { if (ch === "\r" && text[i + 1] !== "\n") fail("bare-cr-csv"); if (ch === "\r") i++; line(); }
    else if (ch === '"') { if (mode !== "start") fail("malformed-csv-quote"); mode = "quoted"; }
    else { if (mode === "closed") fail("text-after-csv-quote"); field += ch; mode = "plain"; }
  }
  if (mode === "quoted") fail("unclosed-csv-quote");
  if (row.length || field || mode !== "start") line();
  const header = rows.shift()!;
  if (header.length !== TRUTH_COLUMNS.length || new Set(header).size !== header.length || TRUTH_COLUMNS.some(c => !header.includes(c))) fail("physical-truth-columns-required");
  return rows.map(r => { if (r.length !== header.length) fail("csv-row-width"); return Object.fromEntries(header.map((c, n) => [c, r[n]])); });
}
export const writeTruthCsv = (rows: readonly Record<string, string>[]) => [TRUTH_COLUMNS.join(","), ...rows.map(row => TRUTH_COLUMNS.map(c => `"${(row[c] ?? "").replaceAll('"', '""')}"`).join(","))].join("\r\n") + "\r\n";

export function validateMapping(value: PhysicalMapping, pages: readonly PhysicalPage[]): string[] {
  if (value?.version !== 1 || value.madeUpRobinOnly !== true || !Array.isArray(value.photos) || !value.photos.length || value.photos.length > 200) fail("physical-mapping-required");
  const names = new Set<string>();
  for (const p of value.photos) {
    if (!safePhotoName(p.file) || names.has(p.file.toLowerCase())) fail("unsafe-or-duplicate-photo-name");
    names.add(p.file.toLowerCase());
    if (!Number.isSafeInteger(p.pdf_page) || !pages.some(page => page.pdfPage === p.pdf_page)) fail("unknown-exercise-page");
    if (!["iphone", "android"].includes(p.device) || !["clear", "unclear"].includes(p.clarity)) fail("human-device-and-clarity-required");
  }
  // Both phones must cover all ten pages. Extra controls stay in the same denominator.
  return ["iphone", "android"].flatMap(device => pages.filter(page => !value.photos.some(p => p.device === device && p.pdf_page === page.pdfPage)).map(page => `${device}:pdf-${page.pdfPage}`));
}
export function truthTemplate(mapping: PhysicalMapping, pages: readonly PhysicalPage[]): Record<string, string>[] {
  validateMapping(mapping, pages);
  return mapping.photos.flatMap(m => {
    const page = pages.find(p => p.pdfPage === m.pdf_page)!;
    return expectedItems(page.frame).flatMap(e => {
      const q = page.frame.questions.find(q => q.number === e.number)!;
      const regions = e.method === "parent" ? ["parent-methods"] : markingRegions(q).map(r => r.id);
      if (!regions.length || !["parent", "code"].includes(e.method)) fail("unsupported-or-unmeasured-item");
      return regions.map(region => ({ pdf_page: String(page.pdfPage), printed_page: String(page.printedPage), page_id: page.label, question: String(e.number), format: q.package!.item!.format,
        parent_methods_required: String(e.method === "parent"), final_written_answer: "", intended_result: e.method === "parent" ? "parent" : "", notes: "",
        photo: m.file, item_id: e.identity.itemId, region_id: region, reading_state: e.method === "parent" ? "parent" : "", reading_issue: "", photo_clarity: m.clarity, device: m.device }));
    });
  });
}
/** Truth remains human input. The reader checks consistency but never supplies a missing label. */
export function physicalTruth(mapping: PhysicalMapping, pages: readonly PhysicalPage[], csv: string): Map<string, TruthRow[]> {
  const wanted = truthTemplate(mapping, pages), rows = parseTruthCsv(csv);
  const key = (r: Record<string, string>) => JSON.stringify([r.photo, r.item_id, r.region_id]);
  const indexed = new Map<string, Record<string, string>>();
  for (const row of rows) { if (indexed.has(key(row))) fail("duplicate-truth-row"); indexed.set(key(row), row); }
  if (rows.length !== wanted.length) fail("missing-or-extra-truth-rows");
  for (const target of wanted) {
    const row = indexed.get(key(target)); if (!row) fail("missing-or-extra-truth-row");
    for (const c of TRUTH_COLUMNS.filter(c => !["final_written_answer", "intended_result", "notes", "reading_state", "reading_issue"].includes(c))) if (row![c] !== target[c]) fail(`truth-identity-${c}`);
    if (row!.final_written_answer.length > 200 || row!.notes.length > 2000) fail("truth-text-bound");
    if (target.parent_methods_required === "true") {
      if (row!.intended_result !== "parent" || row!.reading_state !== "parent" || row!.reading_issue || row!.final_written_answer) fail("parent-methods-must-stay-pending");
    } else {
      if (!["right", "wrong", "blank", "uncertain"].includes(row!.intended_result) || !["written", "blank", "uncertain"].includes(row!.reading_state)) fail("incomplete-human-truth");
      if (row!.reading_state === "written" && (!row!.final_written_answer.trim() || row!.reading_issue)) fail("written-truth-needs-text");
      if (row!.reading_state === "blank" && (row!.final_written_answer || row!.reading_issue)) fail("blank-truth-needs-empty-text");
      if (row!.reading_state === "uncertain" && (!READING_ISSUES.includes(row!.reading_issue as ReadingIssue) || row!.intended_result !== "uncertain")) fail("uncertain-truth-needs-issue");
    }
  }
  const output = new Map<string, TruthRow[]>();
  for (const m of mapping.photos) {
    const page = pages.find(p => p.pdfPage === m.pdf_page)!;
    const truth = expectedItems(page.frame).map(e => {
      const q = page.frame.questions.find(q => q.number === e.number)!;
      const selected = wanted.filter(r => r.photo === m.file && r.item_id === e.identity.itemId).map(r => indexed.get(key(r))!);
      if (new Set(selected.map(r => r.intended_result)).size !== 1) fail("item-result-conflict");
      return { itemId: e.identity.itemId, format: comparisonItemFormat(page.frame, e.identity.itemId), result: selected[0].intended_result as TruthRow["result"],
        readings: e.method === "parent" ? [] : markingRegions(q).map((region, n) => ({ regionId: region.id, state: selected[n].reading_state as "written" | "blank" | "uncertain", text: selected[n].reading_state === "uncertain" && !selected[n].final_written_answer ? null : selected[n].final_written_answer, issue: selected[n].reading_issue ? selected[n].reading_issue as ReadingIssue : null })) };
    });
    const photo = { frame: page.frame, truth } as ComparisonPhoto;
    const labelled = labelledOutput(photo);
    if (!validMarkingOutput(page.frame, labelled)) fail("truth-strict-schema");
    const observations = readMarkingOutput(page.frame, labelled);
    for (const t of truth) {
      const observed = observations.find(o => o.identity.itemId === t.itemId)!;
      if (t.result !== "parent" && observed.result !== (t.result === "uncertain" ? null : t.result) && !(t.format === "write-words" && t.result === "wrong" && observed.result === null)) fail("human-truth-reader-conflict");
    }
    output.set(m.file, truth);
  }
  return output;
}

/** A separate physical adapter. It never calls or relaxes validateComparisonManifest. */
export function physicalScoringInput(set: PhysicalSet): ComparisonManifest {
  return { version: 1, synthetic: true, identity: { name: "Robin", madeUp: true, containsRealData: false, profileSource: "sampleChild/samplePlanInput" },
    source: { synthetic: true, draftSha256: set.draftSha256, renderSha256: FROZEN_KIT["rendered-workbook.json"], fixtureSha256: FROZEN_KIT["fixture-manifest.json"] }, photos: set.photos.map(p => p.photo) };
}
export function physicalReport(set: PhysicalSet, results: ComparisonResult[], evidence: EndpointEvidence, run: string, replay = false) {
  const score = scoreComparison(physicalScoringInput(set), PHYSICAL_MODEL, results, evidence);
  const refused = set.photos.filter(p => p.status === "refused"), incomplete = set.photos.filter(p => p.status === "incomplete");
  const reasons: Record<string, number> = {};
  for (const r of results) for (const o of r.observations) if (o.result === null && o.method === "code") reasons[o.issue ?? "missing-reason"] = (reasons[o.issue ?? "missing-reason"] ?? 0) + 1;
  const complete = score.complete && !refused.length && !incomplete.length && !set.missing.length;
  const latencies = results.filter(r => r.attempts.length).map(r => r.attempts.reduce((n, a) => n + a.latencyMs, 0)).sort((a, b) => a - b);
  const latency = (p: number) => latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] : null;
  return { version: PHYSICAL_VERSION, run, setHash: hashValue(set), proofClass: replay ? "saved-reader-replay" : set.proofClass === "local-fake" ? "local-fake" : results.length ? "physical-provider" : "physical-preparation",
    realHandwritingProven: false, familyRelease: false, selectedModel: null, d267: { wrongDefinitePercentMaximum: 1, wrongAsRightMaximum: 0, clearUnsurePercentMaximum: 5 },
    ...score, complete, passed: complete && score.passed, totalPhotos: set.photos.length, refusedPhotos: refused.length, incompletePhotos: incomplete.length, missingPhotos: set.missing,
    latencyP50Ms: latency(.5), latencyP95Ms: latency(.95),
    inputs: set.photos.map(p => ({ file: p.mapping.file, rawSha256: p.rawSha256, normalizedSha256: p.normalizedSha256, status: p.status, reason: p.reason })), unsureReasons: reasons,
    rawInputs: set.inventory, unmappedFiles: set.inventory.filter(i => i.reason === "unmapped-photo-or-file").length,
    refusedOrIncompleteInputCount: refused.length + incomplete.length + set.inventory.filter(i => !set.photos.some(p => p.mapping.file === i.file)).length,
    measuredUsage: results.flatMap(r => r.attempts.map(a => ({ photo: r.photo, latencyMs: a.latencyMs, ...a.usage }))),
  };
}
export const physicalSettings = (maxMicros: number) => {
  if (!Number.isSafeInteger(maxMicros) || maxMicros < 1 || maxMicros > 15_000_000) fail("invalid-physical-cap");
  return { version: PHYSICAL_VERSION, model: PHYSICAL_MODEL, prompt: COMPARISON_SETTINGS.promptVersion, effort: "low", outputTokens: 4096, fallbacks: false,
    deferral: COMPARISON_DEFERRAL_POLICY, maxMicros, aggregateMicros: 15_000_000, sharedMonthlyMicros: 50_000_000, dedicatedTotalMicros: 50_000_000 };
};
export function physicalPhotoId(file: string) { return `synthetic-physical-${hashValue(file).slice(0, 24)}`; }
export function assertPhysicalFrame(photo: ComparisonPhoto) {
  if (photo.frame.parentId !== SYNTHETIC_IDS.parent || photo.frame.childId !== SYNTHETIC_IDS.child || photo.frame.workbookId !== SYNTHETIC_IDS.workbook || !photo.id.startsWith("synthetic-physical-") || photo.frame.photo !== photo.id || !photo.frame.ready) fail("physical-frame-identity");
  return hashValue(markingRequest(photo.frame, new Uint8Array()));
}
