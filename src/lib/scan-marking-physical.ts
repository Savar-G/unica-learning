// Physical photos of the frozen, made-up Robin kit. This is not the fixed40 set.
import reviewedEvidence from "../../data/scan-marking-physical-reviewed-evidence-20261107.json";
import { COMPARISON_ALLOWED_MODELS, COMPARISON_SETTINGS, COMPARISON_DEFERRAL_POLICY, SYNTHETIC_IDS, comparisonItemFormat, hashValue, labelledOutput, reserveMaximum, scoreComparison, teamItemsOf, teamLine, type ComparisonManifest, type ComparisonModel, type ComparisonPhoto, type ComparisonResult, type EndpointEvidence, type TruthRow } from "@/lib/scan-marking-comparison";
import { expectedItems, READING_ISSUES, type ReadingIssue } from "@/lib/scan-observation";
import { markingRegions } from "@/lib/scan-marking-regions";
import { markingRequest, readMarkingOutput, TWO_WAYS_METHOD_MARKS, validMarkingOutput, type MarkingFrame } from "@/lib/scan-marking";

export const PHYSICAL_VERSION = "robin-physical-v2";
/** Both run on the same photos, truth, prompt, reader, scorer and D-267 bar, with fallbacks off. Neither is selected here. */
export const PHYSICAL_MODELS: readonly ComparisonModel[] = Object.freeze(["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-terra"].map(id => COMPARISON_ALLOWED_MODELS.find(m => m.model === id)!));
const MODEL_NAMES: Record<string, string> = { "anthropic/claude-sonnet-5.5": "Sonnet 5.5", "openai/gpt-6.1-terra": "Terra 6.1" };
/** Two complete phone sets of the frozen kit. Extra control photos add to these counts. */
export const PHYSICAL_EXPECTED = Object.freeze({ photos: 20, itemLabels: 148, aiMarked: 148, parent: 0 });
/** One provider request at a time, for both models together. */
export const PHYSICAL_PARALLEL_REQUESTS = 1;
/** An expected page, about twice the measured v7 cost per page. The worst case is the ledger's reservation bound. */
export const PHYSICAL_EXPECTED_TOKENS = Object.freeze({ input: 4000, output: 1500 });
export const FROZEN_KIT = Object.freeze({
  "Robin-marking-test-booklet.pdf": "d95cec84ed1cd4780e9fef18dd18faf6e02dfa736e02b0e1de1f01bc122b5659",
  "rendered-workbook.json": "52bfbe003525759920a47429e10f6b6431950ecce9ba0ce8caf489a1e1ed84e3",
  "fixture-manifest.json": "81a2b2e9f2e1602a5f0960b5941294c267b54cd2326e98e90ad2d23c5eee2025",
});
export const TRUTH_COLUMNS = ["pdf_page", "printed_page", "page_id", "question", "format", "methods_required", "final_written_answer", "intended_result", "notes", "photo", "item_id", "region_id", "reading_state", "reading_issue", "photo_clarity", "device"] as const;
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
      const regions = markingRegions(q).map(r => r.id);
      if (!regions.length || e.method !== "code") fail("unsupported-or-unmeasured-item");
      return regions.map(region => ({ pdf_page: String(page.pdfPage), printed_page: String(page.printedPage), page_id: page.label, question: String(e.number), format: q.package!.item!.format,
        methods_required: String(e.twoWays === true), final_written_answer: "", intended_result: "", notes: "",
        photo: m.file, item_id: e.identity.itemId, region_id: region, reading_state: "", reading_issue: "", photo_clarity: m.clarity, device: m.device }));
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
    if (!["right", "wrong", "blank", "uncertain"].includes(row!.intended_result) || !["written", "blank", "uncertain"].includes(row!.reading_state)) fail("incomplete-human-truth");
    if (row!.reading_state === "written" && (!row!.final_written_answer.trim() || row!.reading_issue)) fail("written-truth-needs-text");
    if (row!.reading_state === "blank" && (row!.final_written_answer || row!.reading_issue)) fail("blank-truth-needs-empty-text");
    if (row!.reading_state === "uncertain" && (!READING_ISSUES.includes(row!.reading_issue as ReadingIssue) || row!.intended_result !== "uncertain")) fail("uncertain-truth-needs-issue");
  }
  const output = new Map<string, TruthRow[]>();
  for (const m of mapping.photos) {
    const page = pages.find(p => p.pdfPage === m.pdf_page)!;
    const truth = expectedItems(page.frame).map(e => {
      const q = page.frame.questions.find(q => q.number === e.number)!;
      const selected = wanted.filter(r => r.photo === m.file && r.item_id === e.identity.itemId).map(r => indexed.get(key(r))!);
      if (new Set(selected.map(r => r.intended_result)).size !== 1) fail("item-result-conflict");
      return { itemId: e.identity.itemId, format: comparisonItemFormat(page.frame, e.identity.itemId), result: selected[0].intended_result as TruthRow["result"],
        readings: markingRegions(q).map((region, n) => ({ regionId: region.id, state: selected[n].reading_state as "written" | "blank" | "uncertain", text: selected[n].reading_state === "uncertain" && !selected[n].final_written_answer ? null : selected[n].final_written_answer, issue: selected[n].reading_issue ? selected[n].reading_issue as ReadingIssue : null,
          // A human judges a method directly. The strict reader check needs a verdict on written work.
          ...(region.kind === "method" && selected[n].reading_state === "written" ? { verdict: "solves" as const } : {}) })) };
    });
    const photo = { frame: page.frame, truth } as ComparisonPhoto;
    const labelled = labelledOutput(photo);
    if (!validMarkingOutput(page.frame, labelled)) fail("truth-strict-schema");
    const observations = readMarkingOutput(page.frame, labelled);
    for (const t of truth) {
      const observed = observations.find(o => o.identity.itemId === t.itemId)!;
      // A human judges a method; code checks only its arithmetic. A two-ways disagreement is a result to report, not a bad label.
      if (t.format === "two-ways" && (t.result === "right" || t.result === "wrong" || (!TWO_WAYS_METHOD_MARKS && observed.result === null))) continue;
      if (observed.result !== (t.result === "uncertain" ? null : t.result) && !(t.format === "write-words" && t.result === "wrong" && observed.result === null)) fail("human-truth-reader-conflict");
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
type TwoWaysTally = { items: number; clearItems: number; right: number; wrong: number; blank: number; unsure: number; clearUnsure: number; unsureRate: number | null; clearUnsureRate: number | null; wrongMarks: number; wrongAsRight: number };
const observed = (result: ComparisonResult | undefined, photo: ComparisonPhoto, itemId: string) => result?.status === "complete" && result.schemaValid ? result.observations.find(o => o.identity.itemId === itemId && o.identity.pageId === photo.frame.pageId) ?? null : null;
const rate = (n: number, of: number) => of ? n / of : null;
/** Two-ways results apart from the page, so the unsure rate of two-ways items is visible on its own. */
function twoWaysTally(photos: readonly ComparisonPhoto[], own: readonly ComparisonResult[]): TwoWaysTally {
  const t = { items: 0, clearItems: 0, right: 0, wrong: 0, blank: 0, unsure: 0, clearUnsure: 0, wrongMarks: 0, wrongAsRight: 0 };
  for (const photo of photos) for (const truth of photo.truth.filter(r => r.format === "two-ways")) {
    t.items++; if (photo.clear) t.clearItems++;
    const o = observed(own.find(r => r.photo === photo.id), photo, truth.itemId);
    if (!o || o.result === null) { t.unsure++; if (photo.clear) t.clearUnsure++; continue; }
    t[o.result]++;
    if (o.result !== truth.result) { t.wrongMarks++; if (truth.result === "wrong" && o.result === "right") t.wrongAsRight++; }
  }
  return { ...t, unsureRate: rate(t.unsure, t.items), clearUnsureRate: rate(t.clearUnsure, t.clearItems) };
}
/** Every photo and item where the models' results differ, with the human truth beside them. */
function modelDisagreements(set: PhysicalSet, results: readonly ComparisonResult[]) {
  return set.photos.flatMap(({ mapping, photo }) => {
    const items = expectedItems(photo.frame);
    return photo.truth.flatMap(truth => {
      const byModel = PHYSICAL_MODELS.map(m => {
        const result = results.find(r => r.model === m.model && r.photo === photo.id), o = observed(result, photo, truth.itemId);
        return [m.model, !result || result.status === "deferred" ? "no-result" : o ? o.result ?? "unsure" : "no-result"] as const;
      });
      if (new Set(byModel.map(([, r]) => r)).size < 2) return [];
      return [{ photo: mapping.file, pdfPage: mapping.pdf_page, question: items.find(e => e.identity.itemId === truth.itemId)!.number, itemId: truth.itemId, format: truth.format, truth: truth.result, results: Object.fromEntries(byModel) as Record<string, string> }];
    });
  });
}
function modelReport(set: PhysicalSet, model: ComparisonModel, results: readonly ComparisonResult[], evidence: EndpointEvidence, inputsComplete: boolean) {
  const own = results.filter(r => r.model === model.model);
  const score = scoreComparison(physicalScoringInput(set), model, own, evidence);
  const reasons: Record<string, number> = {};
  for (const r of own) for (const o of r.observations) if (o.result === null && o.method === "code") reasons[o.issue ?? "missing-reason"] = (reasons[o.issue ?? "missing-reason"] ?? 0) + 1;
  const latencies = own.filter(r => r.attempts.length).map(r => r.attempts.reduce((n, a) => n + a.latencyMs, 0)).sort((a, b) => a - b);
  const latency = (p: number) => latencies.length ? latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] : null;
  const complete = score.complete && inputsComplete;
  return { ...score, complete, passed: complete && score.passed, clearUnsureRate: rate(score.clearUnsure, score.clearDenominator), clearUnsureRateWithTeam: rate(score.clearUnsureWithTeam, score.clearDenominatorWithTeam), twoWays: twoWaysTally(set.photos.map(p => p.photo), own), latencyP50Ms: latency(.5), latencyP95Ms: latency(.95), unsureReasons: reasons,
    measuredUsage: own.flatMap(r => r.attempts.map(a => ({ photo: r.photo, latencyMs: a.latencyMs, ...a.usage }))) };
}
export function physicalReport(set: PhysicalSet, results: ComparisonResult[], evidences: readonly EndpointEvidence[], run: string, replay = false) {
  const refused = set.photos.filter(p => p.status === "refused"), incomplete = set.photos.filter(p => p.status === "incomplete");
  const inputsComplete = !refused.length && !incomplete.length && !set.missing.length;
  const models = PHYSICAL_MODELS.map(model => modelReport(set, model, results, evidences.find(e => e.model === model.model) ?? fail("physical-evidence-required"), inputsComplete));
  const items = set.photos.flatMap(p => expectedItems(p.photo.frame)), team = teamItemsOf(set.photos.map(p => p.photo));
  return { version: PHYSICAL_VERSION, run, setHash: hashValue(set), proofClass: replay ? "saved-reader-replay" : set.proofClass === "local-fake" ? "local-fake" : results.length ? "physical-provider" : "physical-preparation",
    realHandwritingProven: false, familyRelease: false, selectedModel: null, d267: { wrongDefinitePercentMaximum: 1, wrongAsRightMaximum: 0, clearUnsurePercentMaximum: 5 },
    counts: { photos: set.photos.length, itemLabels: set.photos.reduce((n, p) => n + p.photo.truth.length, 0), aiMarked: items.filter(e => e.method === "code").length, parent: items.filter(e => e.method === "parent").length, teamMarked: team.items }, team, expectedCounts: PHYSICAL_EXPECTED,
    complete: models.every(m => m.complete), passed: models.every(m => m.passed), models, disagreements: modelDisagreements(set, results),
    totalPhotos: set.photos.length, refusedPhotos: refused.length, incompletePhotos: incomplete.length, missingPhotos: set.missing,
    inputs: set.photos.map(p => ({ file: p.mapping.file, rawSha256: p.rawSha256, normalizedSha256: p.normalizedSha256, status: p.status, reason: p.reason })),
    rawInputs: set.inventory, unmappedFiles: set.inventory.filter(i => i.reason === "unmapped-photo-or-file").length,
    refusedOrIncompleteInputCount: refused.length + incomplete.length + set.inventory.filter(i => !set.photos.some(p => p.mapping.file === i.file)).length,
  };
}
const percent = (r: number | null) => r === null ? "none" : `${(r * 100).toFixed(1)}%`;
/** Our team marks two-ways items while the method switch is off, so their unsure rate reads 100% and D-267 leaves them out. */
const TWO_WAYS_NOTE = TWO_WAYS_METHOD_MARKS ? "D-267 at most 5%" : "reads 100% while the method switch is off, as our team marks these";
const usd = (micros: number | null, digits = 2) => micros === null ? "unknown" : `USD ${(micros / 1e6).toFixed(digits)}`;
/** The report as a plain table, with each model in its own column. */
export function physicalSideBySide(report: ReturnType<typeof physicalReport>): string {
  const [left, right] = report.models;
  const rows: [string, (m: typeof left) => string][] = [
    ["Wrong marks", m => `${m.wrongMarks}/${m.wrongMarkDenominator}`],
    ["Wrong marked right", m => String(m.wrongAsRight)],
    ["Clear unsure", m => `${m.clearUnsure}/${m.clearDenominator}`],
    ["Clear unsure rate", m => `${m.clearUnsure}/${m.clearDenominator} (${percent(m.clearUnsureRate)}; D-267 at most 5%, AI-markable items only)`],
    ["Clear unsure with team", m => `${m.clearUnsureWithTeam}/${m.clearDenominatorWithTeam} (${percent(m.clearUnsureRateWithTeam)}; with ${m.clearTeamItems} team item${m.clearTeamItems === 1 ? "" : "s"})`],
    ["Two-ways unsure (clear)", m => `${m.twoWays.clearUnsure}/${m.twoWays.clearItems} (${percent(m.twoWays.clearUnsureRate)}; ${TWO_WAYS_NOTE})`],
    ["Two-ways", m => `${m.twoWays.right} right, ${m.twoWays.wrong} wrong, ${m.twoWays.blank} blank, ${m.twoWays.unsure} unsure of ${m.twoWays.items}; ${m.twoWays.wrongMarks} wrong marks`],
    ["Cost per page", m => m.costPerPageUsd === null ? "unknown" : `USD ${m.costPerPageUsd.toFixed(6)}`],
    ["Latency p50", m => m.latencyP50Ms === null ? "unknown" : `${m.latencyP50Ms} ms`],
    ["Latency p95", m => m.latencyP95Ms === null ? "unknown" : `${m.latencyP95Ms} ms`],
    ["Complete", m => m.complete ? "yes" : "no"],
    ["Passes D-267", m => m.passed ? "yes" : "no"],
  ];
  const name = (m: typeof left) => `${MODEL_NAMES[m.model] ?? m.model} (${m.endpoint})`;
  const col = Math.max(...rows.map(([, f]) => f(left).length), name(left).length) + 2;
  const c = report.counts;
  return [
    teamLine(report.team),
    `Robin phone test (${report.proofClass}). Photos ${c.photos}, item labels ${c.itemLabels}, AI-marked ${c.aiMarked}, of which ${report.team.reasons["two-ways-method-marks-off"] ?? 0} team-marked; parent ${c.parent}. Real handwriting proven: ${report.realHandwritingProven ? "yes" : "no"}.`,
    `${"".padEnd(25)}${name(left).padEnd(col)}${name(right)}`,
    ...rows.map(([label, f]) => `${label.padEnd(25)}${f(left).padEnd(col)}${f(right)}`),
    `Disagreements: ${report.disagreements.length}`,
    ...report.disagreements.map(d => `  ${d.photo} question ${d.question} (${d.format}), truth ${d.truth}: ${report.models.map(m => `${MODEL_NAMES[m.model] ?? m.model} ${d.results[m.model]}`).join(", ")}`),
  ].join("\n");
}
export const physicalSettings = (maxMicros: number) => {
  if (!Number.isSafeInteger(maxMicros) || maxMicros < 1 || maxMicros > 15_000_000) fail("invalid-physical-cap");
  return { version: PHYSICAL_VERSION, models: PHYSICAL_MODELS, parallelRequests: PHYSICAL_PARALLEL_REQUESTS, prompt: COMPARISON_SETTINGS.promptVersion, effort: "low", outputTokens: 4096, fallbacks: false,
    deferral: COMPARISON_DEFERRAL_POLICY, maxMicros, aggregateMicros: 15_000_000, sharedMonthlyMicros: 50_000_000, dedicatedTotalMicros: 50_000_000 };
};
export type PhysicalState = { evidence: EndpointEvidence; maximumMicros: number };
/**
 * The evidence hashes of the enabled rows in public.scan_marking_evaluation_prices. The price check refuses any other,
 * so the plan starts from exactly this reviewed evidence, never from a newer public snapshot.
 */
export const PHYSICAL_REVIEWED_EVIDENCE_SHA256: Readonly<Record<string, string>> = {
  "anthropic/claude-sonnet-5.5": "caf1ec5580ae81b87df0bcd396c58c594ef3acb67457633c76f05d3352ba6278",
  "openai/gpt-6.1-terra": "669916576e5f10e6cff3a77539a98f68f35bbf2452276568e2b02bf6c70bc71e",
};
export function reviewedPhysicalStates(): PhysicalState[] {
  const saved = reviewedEvidence.evidence as unknown as Record<string, EndpointEvidence>;
  return PHYSICAL_MODELS.map(model => {
    const evidence = saved[model.model];
    if (!evidence || hashValue(evidence) !== PHYSICAL_REVIEWED_EVIDENCE_SHA256[model.model] || evidence.model !== model.model
      || evidence.endpoint.tag !== model.endpoint || evidence.endpoint.provider_name !== model.providerName) fail("reviewed-evidence-changed");
    const maximumMicros = reserveMaximum(evidence);
    if (!Number.isSafeInteger(maximumMicros) || maximumMicros < 1 || maximumMicros > 15_000_000) fail("reviewed-evidence-reservation");
    return { evidence, maximumMicros };
  });
}
export type PhysicalEstimate = ReturnType<typeof physicalEstimate>;
/** Expected cost from the pinned base prices, for Robin and the fixed set. The in-flight need is the most that requests running at one time can cost. */
export function physicalEstimate(photos: number, states: readonly PhysicalState[], maxMicros: number, fixedPhotos = 0) {
  if (!Number.isSafeInteger(photos) || photos < 0 || !Number.isSafeInteger(fixedPhotos) || fixedPhotos < 0 || PHYSICAL_MODELS.some(m => !states.some(s => s.evidence.model === m.model))) fail("physical-estimate-input");
  const models = PHYSICAL_MODELS.map(m => {
    const s = states.find(x => x.evidence.model === m.model)!, input = Number(s.evidence.endpoint.pricing.prompt), output = Number(s.evidence.endpoint.pricing.completion);
    if (!(input > 0) || !(output > 0) || !Number.isSafeInteger(s.maximumMicros) || s.maximumMicros < 1) fail("physical-estimate-price");
    const perRequestMicros = Math.ceil((PHYSICAL_EXPECTED_TOKENS.input * input + PHYSICAL_EXPECTED_TOKENS.output * output) * 1e6);
    return { model: m.model, requests: photos + fixedPhotos, perRequestMicros, totalMicros: perRequestMicros * (photos + fixedPhotos), robinMicros: perRequestMicros * photos, fixedMicros: perRequestMicros * fixedPhotos, worstRequestMicros: s.maximumMicros };
  });
  const estimateMicros = models.reduce((n, m) => n + m.totalMicros, 0), inFlightMicros = PHYSICAL_PARALLEL_REQUESTS * Math.max(...models.map(m => m.worstRequestMicros));
  return { paid: false, models, estimateMicros, robinMicros: models.reduce((n, m) => n + m.robinMicros, 0), fixedMicros: models.reduce((n, m) => n + m.fixedMicros, 0), fixedPhotos, inFlightMicros, parallelRequests: PHYSICAL_PARALLEL_REQUESTS, maxMicros, overStop: estimateMicros > maxMicros };
}
export function physicalEstimateLines(e: PhysicalEstimate, remainingMicros?: number | null): string[] {
  return [
    `Estimate: ${usd(e.estimateMicros)} (${e.fixedPhotos ? `Robin ${usd(e.robinMicros)}, fixed ${e.fixedPhotos} ${usd(e.fixedMicros)}; ` : ""}${e.models.map(m => `${MODEL_NAMES[m.model] ?? m.model}: ${m.requests} x ${usd(m.perRequestMicros, 4)}`).join("; ")}). Stop: ${usd(e.maxMicros)}.`,
    `In-flight need: ${usd(e.inFlightMicros)} (${e.parallelRequests} request at a time x the largest request's worst case).`,
    ...(remainingMicros === undefined ? [] : [`Remaining: ${usd(remainingMicros)}`]),
  ];
}
const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const amount = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v * 1e6)) ? Math.round(v * 1e6) : null;
/** Reads total_credits and total_usage. Any failed read refuses. The key and the provider's text never enter the result. */
export async function physicalCreditPreflight(key: string, estimate: PhysicalEstimate, fetcher: typeof fetch) {
  const requiredMicros = estimate.estimateMicros + estimate.inFlightMicros, base = { estimateMicros: estimate.estimateMicros, inFlightMicros: estimate.inFlightMicros, requiredMicros };
  let remainingMicros: number | null = null;
  try {
    const response = await fetcher(CREDITS_URL, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (response.ok) {
      const data = (await response.json() as { data?: { total_credits?: unknown; total_usage?: unknown } } | null)?.data;
      const total = amount(data?.total_credits), usage = amount(data?.total_usage);
      if (total !== null && usage !== null) remainingMicros = total - usage;
    }
  } catch { /* A failed read refuses below. */ }
  if (remainingMicros === null) return { ...base, remainingMicros, enough: false, reason: "credit-read-failed" as const };
  const enough = remainingMicros >= requiredMicros;
  return { ...base, remainingMicros, enough, reason: enough ? null : "insufficient-credits" as const };
}
/** The saved v7 rows of the fixed set (docs/scan-marking-v7-acceptance-20261107.md). Saved results, not new inference. */
export const FIXED40_V7_ROWS: Record<string, { prompt: string; wrongMarks: number; definite: number; wrongAsRight: number; clearUnsure: number; clear: number; schemaFailures: number; costPerPageUsd: number; latencyP50Ms: number; latencyP95Ms: number }> = {
  "anthropic/claude-sonnet-5.5": { prompt: "whole-page-scalar-readings-v7", wrongMarks: 0, definite: 218, wrongAsRight: 0, clearUnsure: 1, clear: 219, schemaFailures: 0, costPerPageUsd: 0.01095165, latencyP50Ms: 2551, latencyP95Ms: 3164 },
  "openai/gpt-6.1-terra": { prompt: "whole-page-scalar-readings-v7", wrongMarks: 0, definite: 218, wrongAsRight: 0, clearUnsure: 1, clear: 219, schemaFailures: 0, costPerPageUsd: 0.005076625, latencyP50Ms: 2270, latencyP95Ms: 3264 },
};
export const FIXED40_PHOTOS = 40;
/** The unchanged D-267 scorer on the fixed set, with the saved v7 row beside each v8 row. */
export function physicalFixedReport(manifest: ComparisonManifest, results: readonly ComparisonResult[], evidences: readonly EndpointEvidence[], run: string, proofClass: "local-fake" | "provider" | "saved-reader-replay" = "provider") {
  const rows = PHYSICAL_MODELS.map(model => {
    const s = scoreComparison(manifest, model, results, evidences.find(e => e.model === model.model) ?? fail("physical-evidence-required"));
    const complete = s.complete && manifest.photos.length === FIXED40_PHOTOS;
    return { model: model.model, endpoint: model.endpoint, v7: FIXED40_V7_ROWS[model.model], v8: { prompt: COMPARISON_SETTINGS.promptVersion, complete, passed: complete && s.passed, wrongMarks: s.wrongMarks, definite: s.wrongMarkDenominator, wrongAsRight: s.wrongAsRight, clearUnsure: s.clearUnsure, clear: s.clearDenominator, clearUnsureRate: rate(s.clearUnsure, s.clearDenominator),
      clearUnsureWithTeam: s.clearUnsureWithTeam, clearWithTeam: s.clearDenominatorWithTeam, clearUnsureRateWithTeam: rate(s.clearUnsureWithTeam, s.clearDenominatorWithTeam), twoWays: twoWaysTally(manifest.photos, results.filter(r => r.model === model.model)), schemaFailures: s.schemaFailures, costPerPageUsd: s.costPerPageUsd, latencyP50Ms: s.latencyP50Ms, latencyP95Ms: s.latencyP95Ms, missingRuns: s.missingRuns } };
  });
  return { version: PHYSICAL_VERSION, set: "fixed-40-synthetic", run, proofClass, realHandwritingProven: false, selectedModel: null, photos: manifest.photos.length, team: teamItemsOf(manifest.photos), rows };
}
export function physicalFixedSideBySide(report: ReturnType<typeof physicalFixedReport>): string {
  const cost = (v: number | null) => v === null ? "unknown" : `USD ${v.toFixed(6)}`, ms = (v: number | null) => v === null ? "unknown" : `${v}`;
  const line = (name: string, p: string, r: { wrongMarks: number; definite: number; wrongAsRight: number; clearUnsure: number; clear: number; clearUnsureWithTeam?: number; clearWithTeam?: number; schemaFailures: number; costPerPageUsd: number | null; latencyP50Ms: number | null; latencyP95Ms: number | null; twoWays?: TwoWaysTally }, pass: string) =>
    `${name.padEnd(12)}${p.padEnd(5)}${`${r.wrongMarks}/${r.definite}`.padEnd(8)}${String(r.wrongAsRight).padEnd(7)}${`${r.clearUnsure}/${r.clear} ${percent(r.clear ? r.clearUnsure / r.clear : null)}`.padEnd(14)}${(r.clearWithTeam === undefined ? "parent" : `${r.clearUnsureWithTeam}/${r.clearWithTeam} ${percent(r.clearWithTeam ? r.clearUnsureWithTeam! / r.clearWithTeam : null)}`).padEnd(15)}${(r.twoWays ? `${r.twoWays.clearUnsure}/${r.twoWays.clearItems} ${percent(r.twoWays.clearUnsureRate)}` : "parent").padEnd(14)}${String(r.schemaFailures).padEnd(8)}${cost(r.costPerPageUsd).padEnd(14)}${`${ms(r.latencyP50Ms)}/${ms(r.latencyP95Ms)}`.padEnd(13)}${pass}`;
  return [teamLine(report.team), `Fixed ${report.photos} synthetic photos (${report.proofClass}): prompt v8 next to the saved v7 result. v7 scored 4 fewer rows: the two-ways rows were parent rows.`,
    `D-267 allows at most 5% unsure on clear photos, counting only items the AI is meant to mark ("Unsure"). "Unsure+team" adds the items our team marks by design. Two-ways: ${TWO_WAYS_NOTE}.`,
    `${"".padEnd(12)}${"".padEnd(5)}${"Wrong".padEnd(8)}${"W->R".padEnd(7)}${"Unsure".padEnd(14)}${"Unsure+team".padEnd(15)}${"2W unsure".padEnd(14)}${"Schema".padEnd(8)}${"Cost/page".padEnd(14)}${"p50/p95 ms".padEnd(13)}D-267`,
    ...report.rows.flatMap(r => [line(MODEL_NAMES[r.model] ?? r.model, "v8", r.v8, r.v8.passed ? "pass" : r.v8.complete ? "fail" : "not complete"), line("", "v7", r.v7, "pass (saved)")])].join("\n");
}
export function physicalPhotoId(file: string) { return `synthetic-physical-${hashValue(file).slice(0, 24)}`; }
export function assertPhysicalFrame(photo: ComparisonPhoto) {
  if (photo.frame.parentId !== SYNTHETIC_IDS.parent || photo.frame.childId !== SYNTHETIC_IDS.child || photo.frame.workbookId !== SYNTHETIC_IDS.workbook || !photo.id.startsWith("synthetic-physical-") || photo.frame.photo !== photo.id || !photo.frame.ready) fail("physical-frame-identity");
  return hashValue(markingRequest(photo.frame, new Uint8Array()));
}
