// The synthetic second-opinion comparison (#851, spec #850 slice A): does a decision model confirm right answers and
// never call a wrong, blank or unclear answer Right? For each scored region of an item (markingRegions, on the items the
// crop plan supports) it asks one yes/no question that states the key in its accepted forms, on that region's crop. An
// item is confirmed only when every scored region's P(yes) is at or above the threshold. Both models get the same rows.
// Truth groups: `right` rows count toward the confirm rate; `wrong`, `blank` and `uncertain` rows count toward false
// Right; `parent` rows are listed and left out. An error, a refusal, a block or a time-out is never a pass: that item is
// not confirmed at any threshold. Known wrong answers are never shown to the model.
// Slice B (#853): the same comparison on the real phone photos of the made-up Robin booklet (`physicalComparisonSet`,
// from scan-marking-physical's set.json): only the photos the page check accepted can be cropped, the set must hold at
// least 40 wrong and 20 blank items, and `comparisonWinner` names the model and threshold that pass on both sets.
// Local tool only: made-up child, no real child data, no database. The CLI is scripts/decision-marking-comparison-cli.ts.
import { cropPlan } from "@/lib/scan-calibration";
import { SYNTHETIC_IDS } from "@/lib/scan-marking-comparison";
import { FROZEN_KIT } from "@/lib/scan-marking-physical";
import { markingRegions, type MarkingRegion } from "@/lib/scan-marking-regions";
import { packageItem, valueText, type QuestionPackage } from "@/lib/question-package";
import type { Box, PrintedRegion } from "@/lib/workbook-print-contract";
import { DecisionError, attemptCostBound, requestCostBound, type DecisionClient, type DecisionErrorKind, type DecisionQuestion } from "@/lib/decision-client";

export const COMPARISON_VERSION = 1;
/** The two models this comparison runs, in report order. */
export const COMPARISON_MODELS = ["typesafe/jev-1.14", "google/gemini-decision-1"] as const;
/**
 * Jev's image limits. The Multimodal Decisions guide says 256 to 1,568 px a side and 78,400 to 2,458,624 px in total, but
 * Jev refused every image with a side under 280 px ("Invalid image dimensions": 300x279, 279x400, 1568x279 refused;
 * 300x280, 280x400, 1568x280 answered; probed 2026-11-11). So each side is 280 to 1,568 px here.
 */
export const IMAGE_MIN_SIDE = 280;
export const IMAGE_MAX_SIDE = 1568;
export const IMAGE_MIN_PIXELS = 78_400;
/** Thresholds from 0.50 to 0.99 in steps of 0.01. */
export const THRESHOLDS = Array.from({ length: 50 }, (_, n) => (50 + n) / 100);
/** The pass bar (spec #850): 0 false Right and at least this share of right items confirmed. */
export const PASS_CONFIRM_RATE = 0.8;

export type TruthResult = "right" | "wrong" | "blank" | "uncertain" | "parent";
export interface SetQuestion {
  number: number;
  package: QuestionPackage | null;
  regions: readonly PrintedRegion[] | null;
}
export interface SetPhoto {
  id: string;
  clear: boolean;
  image: { path: string; width: number; height: number };
  frame: { pageNumber: number; questions: readonly SetQuestion[] };
  truth: readonly { itemId: string; format: string; result: TruthResult }[];
}
/** The parts of the fixed 40 manifest (scan-marking-comparison) this comparison reads; a physical set has the same shape. */
export interface SetManifest {
  /** false for the real phone photos of the made-up booklet (#853). */
  synthetic: boolean;
  identity: { containsRealData: false };
  photos: readonly SetPhoto[];
}

/** One question about one scored region. */
export interface RegionAsk {
  regionId: string;
  /** The region's printed box, in page image pixels. */
  box: Box;
  question: DecisionQuestion & { type: "noul" };
}
export interface ComparisonItem {
  photo: string;
  clear: boolean;
  itemId: string;
  number: number;
  format: string;
  result: Exclude<TruthResult, "parent">;
  regions: RegionAsk[];
}
export interface LeftOut {
  photo: string;
  itemId: string;
  format: string;
}

const YES_BOX = "The box holds exactly this answer, in a child's writing.";
const NO_BOX = "Anything else: a blank box, a different answer, an answer that is crossed out, two answers, or writing that cannot be read.";

/**
 * The yes/no question for one scored region. A number, a fraction or a word states the key in each form the item
 * accepts, joined with " or ", with the unit when the item prints one; a choice asks whether that option is the one marked.
 */
export function regionQuestion(region: MarkingRegion, pkg: QuestionPackage, onlyBox: boolean): RegionAsk["question"] {
  if (region.kind === "choice") {
    const mark = region.mark === "circle" ? "circled" : "ticked";
    return {
      type: "noul",
      instructions: `The options printed in this box are: ${region.choices.map((c) => `"${c}"`).join(", ")}. Is option "${region.answer}" the one ${mark}?`,
      yes: `Option "${region.answer}" is ${mark} and no other option is marked.`,
      no: "Anything else: no option marked, another option marked, two options marked, or a mark that cannot be read.",
    };
  }
  if (region.kind === "method") throw new Error("a method region is not asked in this comparison");
  const key = region.kind === "number" ? valueText({ type: "number", value: region.answer }) : region.kind === "fraction" ? valueText(region.answer) : region.answer;
  // The package's other accepted forms and unit belong to its one answer box.
  const extra = onlyBox && pkg.answer ? pkg.answer.accepted.map(valueText) : [];
  const forms = [...new Set([key, ...extra])];
  const unit = onlyBox ? pkg.answer?.unit ?? null : null;
  return { type: "noul", instructions: `Does this box show ${forms.map((f) => (unit ? `${f} ${unit}` : f)).join(" or ")}?`, yes: YES_BOX, no: NO_BOX };
}

/**
 * The items to ask about, and the rows left out, from the manifest: parent rows, and items with a method region (two
 * ways), which our team marks while the method switch is off. Throws on a row the crop plan cannot ask about.
 */
export function comparisonItems(manifest: SetManifest): { items: ComparisonItem[]; leftOut: LeftOut[] } {
  if (manifest.identity?.containsRealData !== false) throw new Error("made-up-child-set-required");
  const items: ComparisonItem[] = [], leftOut: LeftOut[] = [];
  for (const photo of manifest.photos) {
    const plan = cropPlan(photo.frame.questions);
    for (const row of photo.truth) {
      if (row.result === "parent") {
        leftOut.push({ photo: photo.id, itemId: row.itemId, format: row.format });
        continue;
      }
      const q = photo.frame.questions.find((q) => q.package?.id === row.itemId);
      if (!q?.package || !plan.crops.some((c) => c.itemId === row.itemId)) throw new Error(`no-crop-for-item:${photo.id}:${row.itemId}`);
      const scored = markingRegions(q);
      const boxes = packageItem(q.package).regions.filter((r) => r.kind === "box").length;
      if (scored.some((r) => r.kind === "method")) {
        leftOut.push({ photo: photo.id, itemId: row.itemId, format: row.format });
        continue;
      }
      items.push({
        photo: photo.id, clear: photo.clear, itemId: row.itemId, number: q.number, format: row.format, result: row.result,
        regions: scored.map((r) => ({ regionId: r.id, box: r.box, question: regionQuestion(r, q.package!, boxes === 1) })),
      });
    }
  }
  return { items, leftOut };
}

/** #853: the real set must hold at least this many wrong and blank items, so 0 false Right cannot pass for lack of them. */
export const PHYSICAL_MIN_ITEMS = { wrong: 40, blank: 20 } as const;

/** The parts of scan-marking-physical's set.json (version robin-physical-v2) this comparison reads. */
export interface PhysicalSetFile {
  version: string;
  proofClass?: string;
  kit?: Readonly<Record<string, string>>;
  devices?: readonly string[];
  photos: readonly { mapping: { file: string; device: string }; status: string; reason: string | null; photo: SetPhoto & { image: SetPhoto["image"] & { sha256?: string } } }[];
}
export interface PhysicalSet {
  manifest: SetManifest;
  /** Photos the page check refused: they have no straightened page, so no region of them can be cropped or asked. */
  refused: { file: string; reason: string | null }[];
  devices: string[];
  /** The spec's set is both phones; an iPhone-only set is recorded as such and never stands in for it. */
  bothPhones: boolean;
  /** The source set's proof class, kept in the report: `physical-input` real photos, or a `local-fake` control. */
  proofClass: "physical-input" | "local-fake";
}

/** The real Robin set from scan-marking-physical's set.json: the photos the page check accepted, each named by its file. */
export function physicalComparisonSet(file: PhysicalSetFile, o: { allowFake?: boolean } = {}): PhysicalSet {
  if (file?.version !== "robin-physical-v2" || !Array.isArray(file.photos)) throw new Error("physical-set-required");
  // #853 review: only the real photos of the frozen, made-up Robin booklet. A local fake set is a control, read only by a
  // fake run; any other proof class, kit or child is refused, all before a key is read.
  const proofClass = file.proofClass;
  if (proofClass !== "physical-input" && !(proofClass === "local-fake" && o.allowFake)) throw new Error("physical-set-proof-class");
  const kit = file.kit ?? {};
  if (Object.keys(kit).length !== Object.keys(FROZEN_KIT).length || Object.entries(FROZEN_KIT).some(([k, v]) => kit[k] !== v)) throw new Error("physical-set-not-the-robin-kit");
  const ready = file.photos.filter((p) => p.status === "ready");
  for (const p of ready) {
    // The kit's items: the made-up Robin workbook's, and its three made-up scalar items (fraction, decimal, word).
    if (!p.photo.truth.length || p.photo.truth.some((t: { itemId: string }) => !t.itemId.startsWith(`${SYNTHETIC_IDS.workbook}:`) && !/^synthetic-scalar-[1-3]$/.test(t.itemId))) throw new Error("physical-set-not-robin");
    if (!/^[0-9a-f]{64}$/.test(p.photo.image.sha256 ?? "")) throw new Error("physical-set-image-hash-required");
  }
  const devices = [...new Set(file.devices?.length ? file.devices : ready.map((p) => p.mapping.device))].sort();
  return {
    manifest: { synthetic: false, identity: { containsRealData: false }, photos: ready.map((p) => ({ ...p.photo, id: p.mapping.file })) },
    refused: file.photos.filter((p) => p.status !== "ready").map((p) => ({ file: p.mapping.file, reason: p.reason })),
    devices, bothPhones: devices.includes("iphone") && devices.includes("android"), proofClass,
  };
}

/** Each asked photo's image file must have the hash its set recorded: checked before a key is read. */
export function checkPhysicalImages(file: PhysicalSetFile, sha256Of: (path: string) => string): void {
  for (const p of file.photos.filter((x) => x.status === "ready")) if (sha256Of(p.photo.image.path) !== p.photo.image.sha256) throw new Error(`physical-set-image-changed: ${p.mapping.file}`);
}

/** The real set's shortfall against PHYSICAL_MIN_ITEMS, as a refusal reason; null when it has enough. */
export function physicalShortfall(items: readonly ComparisonItem[]): string | null {
  const wrong = items.filter((i) => i.result === "wrong").length, blank = items.filter((i) => i.result === "blank").length;
  if (wrong >= PHYSICAL_MIN_ITEMS.wrong && blank >= PHYSICAL_MIN_ITEMS.blank) return null;
  return `physical-set-too-few-items: ${wrong} wrong (needs ${PHYSICAL_MIN_ITEMS.wrong}), ${blank} blank (needs ${PHYSICAL_MIN_ITEMS.blank})`;
}

/** The crop of a region: its box with a margin, inside the page. Whole pixels. */
export function cropRect(box: Box, page: { width: number; height: number }) {
  const mx = Math.max(8, box.width * 0.15), my = Math.max(8, box.height * 0.15);
  const left = Math.max(0, Math.floor(box.x - mx)), top = Math.max(0, Math.floor(box.y - my));
  const right = Math.min(page.width, Math.ceil(box.x + box.width + mx)), bottom = Math.min(page.height, Math.ceil(box.y + box.height + my));
  if (right - left < 1 || bottom - top < 1) throw new Error("crop-outside-page");
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * The size a crop is sent at, inside Jev's limits: scaled so its short side is at least 280 px, it has at least 78,400 px
 * in total, and its long side is at most 1,568 px; a crop too long for all three is scaled to the long side and padded
 * with white to 280 px on the short side.
 */
export function imageSize(width: number, height: number) {
  let scale = Math.max(1, IMAGE_MIN_SIDE / Math.min(width, height), Math.sqrt(IMAGE_MIN_PIXELS / (width * height)) * 1.001);
  if (Math.max(width, height) * scale > IMAGE_MAX_SIDE) scale = IMAGE_MAX_SIDE / Math.max(width, height);
  // Rounded up, so a crop scaled to a minimum stays at or above it; never above the long-side limit.
  const side = (x: number) => Math.min(IMAGE_MAX_SIDE, Math.max(1, Math.ceil(x * scale - 1e-9)));
  const w = side(width), h = side(height);
  return { width: w, height: h, canvas: { width: Math.max(w, IMAGE_MIN_SIDE), height: Math.max(h, IMAGE_MIN_SIDE) } };
}

/** A conservative input token count of one request: the text plus one token per 14 by 14 px of image. */
export function estimateTokens(question: DecisionQuestion, canvas: { width: number; height: number }) {
  return 600 + Math.ceil(JSON.stringify(question).length / 3) + Math.ceil((canvas.width * canvas.height) / 196);
}

/** What one region's request gave. */
export interface AskResult {
  photo: string;
  itemId: string;
  regionId: string;
  /** P(yes); null when the request failed. */
  yes: number | null;
  error: DecisionErrorKind | "budget" | null;
  /** The error's message (codes and OpenRouter's words, never the key or the image). */
  message?: string;
  ms: number | null;
  /** The known part of the request's cost; null when no attempt gave a cost. */
  usd: number | null;
  /** False when an attempt of the request came back with no cost: `usd` is then only part of the charge. */
  costKnown: boolean;
  provider: string | null;
}

/**
 * The money cap of one run, shared by every model in it. A request is admitted only when the money spent, plus the
 * reservations of the requests in flight, plus its own reservation, is at most the cap. Its reservation is the most the
 * request can cost (requestCostBound: the model's whole context at its pinned prices, times the client's most attempts),
 * so no admitted request can take the spend past the cap. When the request ends, its reservation is replaced by its
 * known cost plus, for each attempt that came back with no cost, the attempt's bound. A request that does not fit waits
 * while others are in flight, as their settlements can free money. If a settled cost is still above its reservation (the
 * pinned prices are out of date), the run stops at the cost cap: no new request is admitted.
 */
export interface CostCap {
  readonly maxUsd: number;
  /** Money spent: known costs, and the bound of each attempt whose cost is unknown. */
  readonly spentUsd: number;
  /** Reservations of the requests in flight. */
  readonly reservedUsd: number;
  /** True after a settled cost was above its reservation. */
  readonly stopped: boolean;
  /** Admits a request that can cost at most `boundUsd`: the reservation, or null when it is not admitted. */
  reserve(boundUsd: number): Promise<number | null>;
  /** Ends a request: its reservation is replaced by `settledUsd`. */
  settle(reservationUsd: number, settledUsd: number): void;
}

export function costCap(maxUsd: number): CostCap {
  let waiting: (() => void)[] = [];
  const cap = {
    maxUsd, spentUsd: 0, reservedUsd: 0, stopped: false,
    async reserve(boundUsd: number) {
      if (!Number.isFinite(boundUsd) || boundUsd <= 0) throw new Error("a request needs a positive cost bound");
      for (;;) {
        if (cap.stopped) return null;
        if (cap.spentUsd + cap.reservedUsd + boundUsd <= cap.maxUsd) {
          cap.reservedUsd += boundUsd;
          return boundUsd;
        }
        // Nothing in flight: no settlement can free money, so this request is never admitted.
        if (cap.reservedUsd <= 0) return null;
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
    },
    settle(reservationUsd: number, settledUsd: number) {
      cap.reservedUsd = Math.max(0, cap.reservedUsd - reservationUsd);
      cap.spentUsd += settledUsd;
      if (settledUsd > reservationUsd) cap.stopped = true;
      const wake = waiting;
      waiting = [];
      for (const w of wake) w();
    },
  };
  return cap;
}

/**
 * Asks every region of every item, one request each, with `concurrency` requests in flight. Each request is admitted
 * through the run's cost cap with the request bound of the client's model (a model outside the pinned table throws); a
 * request the cap does not admit is not sent and is recorded as "budget" (not confirmed).
 */
export async function askAll(o: {
  items: readonly ComparisonItem[];
  client: DecisionClient;
  image: (item: ComparisonItem, region: RegionAsk) => Promise<Uint8Array>;
  cap: CostCap;
  concurrency?: number;
  timeLimitMs?: number;
  now?: () => number;
  onResult?: (r: AskResult) => void;
}): Promise<AskResult[]> {
  const now = o.now ?? (() => performance.now());
  const bound = requestCostBound(o.client);
  const attemptBound = attemptCostBound(o.client.model);
  // What a request is settled at: its known cost plus the bound of each attempt with no cost.
  const settled = (usd: number | null, unpriced: number) => (usd ?? 0) + unpriced * attemptBound;
  const jobs = o.items.flatMap((item) => item.regions.map((region) => ({ item, region })));
  const results: AskResult[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (let n = next++; n < jobs.length; n = next++) {
      const { item, region } = jobs[n];
      const base = { photo: item.photo, itemId: item.itemId, regionId: region.regionId };
      const data = await o.image(item, region);
      const reservation = await o.cap.reserve(bound);
      if (reservation === null) {
        results[n] = { ...base, yes: null, error: "budget", message: o.cap.stopped ? "stopped at the cost cap" : "not admitted: the cost cap is full", ms: null, usd: null, costKnown: true, provider: null };
      } else {
        const started = now();
        try {
          const out = await o.client.decide({
            input: [{ type: "text", text: "One answer box cut from a child's workbook page." }, { type: "image", mediaType: "image/jpeg", data }],
            questions: { shows: region.question },
            signal: AbortSignal.timeout(o.timeLimitMs ?? 60_000),
          });
          o.cap.settle(reservation, settled(out.usd, out.unpricedAttempts));
          const answer = out.answers.shows;
          results[n] = { ...base, yes: answer.type === "noul" ? answer.yes : null, error: answer.type === "noul" ? null : "malformed", ms: now() - started, usd: out.usd, costKnown: out.costKnown, provider: out.provider };
        } catch (e) {
          const known = e instanceof DecisionError;
          // An error that is not a DecisionError says nothing of its attempts: it is settled at its whole reservation.
          o.cap.settle(reservation, known ? settled(e.usd, e.unpricedAttempts) : reservation);
          results[n] = { ...base, yes: null, error: known ? e.kind : "unavailable", message: String(e instanceof Error ? e.message : e).slice(0, 300), ms: now() - started, usd: known ? e.usd : null, costKnown: known && e.costKnown, provider: null };
        }
      }
      o.onResult?.(results[n]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 4) }, worker));
  return results;
}

const quantile = (values: readonly number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
};
const round = (x: number, places = 4) => Math.round(x * 10 ** places) / 10 ** places;

export interface ModelReport {
  model: string;
  requests: number;
  /** Requests by error kind; "budget" means not sent. */
  errors: Record<string, number>;
  providers: Record<string, number>;
  rightItems: number;
  falseRightCandidates: { wrong: number; blank: number; uncertain: number };
  thresholds: { threshold: number; confirmed: number; confirmRate: number; falseRight: number; falseRightBy: { wrong: number; blank: number; uncertain: number } }[];
  /** The lowest threshold with 0 false Right, and the confirm rate there; null when no threshold gives 0. */
  lowestZeroFalseRight: number | null;
  confirmRateAtLowest: number | null;
  /** Requests with no answer (an error, or not sent under the cost cap), by the truth group of their item. */
  failedRequests: { right: number; wrong: number; blank: number; uncertain: number };
  /**
   * "incomplete: <n> non-right requests failed" when a wrong, blank or uncertain row has a request with no answer: the
   * threshold table still counts only answered rows, so its 0 false Right is not proven, and the model does not pass. null
   * when every non-right request has an answer.
   */
  incomplete: string | null;
  /** The pass bar is met: 0 false Right with every non-right request answered, and at least 80% of right items confirmed. */
  passes: boolean;
  /** Items by their P(yes) (the lowest of their regions) in bands of 0.1, with the share that is right. */
  reliability: { band: string; items: number; right: number; rightRate: number | null }[];
  costUsd: number;
  /** Requests sent with an attempt that gave no cost: costUsd holds only their known part (the cap counted the bound). */
  costMissing: number;
  costPerPhotoUsd: number;
  latencyMs: { p50: number | null; p95: number | null };
}

/** One model's report from its region results. */
export function modelReport(model: string, items: readonly ComparisonItem[], results: readonly AskResult[], photos: number): ModelReport {
  const byRegion = new Map(results.map((r) => [`${r.photo}\u0000${r.itemId}\u0000${r.regionId}`, r]));
  // An item's P(yes): the lowest of its regions; null when any region has no answer.
  const scored = items.map((item) => {
    const ys = item.regions.map((r) => byRegion.get(`${item.photo}\u0000${item.itemId}\u0000${r.regionId}`)?.yes ?? null);
    return { item, p: ys.some((y) => y === null) ? null : Math.min(...(ys as number[])) };
  });
  const right = scored.filter((s) => s.item.result === "right");
  const count = (result: string) => scored.filter((s) => s.item.result === result).length;
  const thresholds = THRESHOLDS.map((threshold) => {
    const on = (s: (typeof scored)[number]) => s.p !== null && s.p >= threshold;
    const by = { wrong: 0, blank: 0, uncertain: 0 };
    for (const s of scored) if (s.item.result !== "right" && on(s)) by[s.item.result]++;
    const confirmed = right.filter(on).length;
    return { threshold, confirmed, confirmRate: right.length ? round(confirmed / right.length) : 0, falseRight: by.wrong + by.blank + by.uncertain, falseRightBy: by };
  });
  const lowest = thresholds.find((t) => t.falseRight === 0) ?? null;
  const reliability = Array.from({ length: 10 }, (_, n) => {
    const inBand = scored.filter((s) => s.p !== null && (n === 9 ? s.p >= 0.9 : s.p >= n / 10 && s.p < (n + 1) / 10));
    const r = inBand.filter((s) => s.item.result === "right").length;
    return { band: `${(n / 10).toFixed(1)}-${n === 9 ? "1.0" : ((n + 1) / 10).toFixed(1)}`, items: inBand.length, right: r, rightRate: inBand.length ? round(r / inBand.length) : null };
  });
  const errors: Record<string, number> = {}, providers: Record<string, number> = {};
  for (const r of results) {
    if (r.error) errors[r.error] = (errors[r.error] ?? 0) + 1;
    if (r.provider) providers[r.provider] = (providers[r.provider] ?? 0) + 1;
  }
  // A right row with no answer is not confirmed; a non-right row with no answer leaves the comparison incomplete.
  const failedRequests = { right: 0, wrong: 0, blank: 0, uncertain: 0 };
  for (const item of items) for (const r of item.regions) {
    if ((byRegion.get(`${item.photo}\u0000${item.itemId}\u0000${r.regionId}`)?.yes ?? null) === null) failedRequests[item.result]++;
  }
  const failedNonRight = failedRequests.wrong + failedRequests.blank + failedRequests.uncertain;
  const incomplete = failedNonRight ? `incomplete: ${failedNonRight} non-right requests failed` : null;
  const sent = results.filter((r) => r.error !== "budget");
  const cost = results.reduce((sum, r) => sum + (r.usd ?? 0), 0);
  const ms = sent.flatMap((r) => (r.ms === null ? [] : [r.ms]));
  const p50 = quantile(ms, 0.5), p95 = quantile(ms, 0.95);
  return {
    model, requests: results.length, errors, providers, rightItems: right.length,
    falseRightCandidates: { wrong: count("wrong"), blank: count("blank"), uncertain: count("uncertain") },
    thresholds, lowestZeroFalseRight: lowest?.threshold ?? null, confirmRateAtLowest: lowest?.confirmRate ?? null,
    failedRequests, incomplete,
    passes: !incomplete && !!lowest && lowest.confirmRate >= PASS_CONFIRM_RATE, reliability,
    costUsd: round(cost, 8), costMissing: sent.filter((r) => !r.costKnown).length, costPerPhotoUsd: photos ? round(cost / photos, 8) : 0,
    latencyMs: { p50: p50 === null ? null : Math.round(p50), p95: p95 === null ? null : Math.round(p95) },
  };
}

export interface ComparisonReport {
  version: number;
  synthetic: boolean;
  /** The real set's facts (#853); null for the synthetic set. */
  physical: { devices: string[]; bothPhones: boolean; proofClass: "physical-input" | "local-fake"; refused: { file: string; reason: string | null }[] } | null;
  fake: boolean;
  photos: number;
  items: { right: number; wrong: number; blank: number; uncertain: number };
  requestsPerModel: number;
  leftOut: LeftOut[];
  /** The run's cost cap: the cap, the money spent, and whether the run stopped at the cap. */
  cap: { maxUsd: number; spentUsd: number; stopped: boolean } | null;
  models: ModelReport[];
}

export function comparisonReport(o: { items: readonly ComparisonItem[]; leftOut: readonly LeftOut[]; photos: number; fake: boolean; results: Readonly<Record<string, readonly AskResult[]>>; cap?: CostCap; physical?: Omit<PhysicalSet, "manifest"> }): ComparisonReport {
  const count = (result: string) => o.items.filter((i) => i.result === result).length;
  return {
    version: COMPARISON_VERSION, synthetic: !o.physical, physical: o.physical ? { devices: o.physical.devices, bothPhones: o.physical.bothPhones, proofClass: o.physical.proofClass, refused: o.physical.refused } : null,
    fake: o.fake, photos: o.photos,
    items: { right: count("right"), wrong: count("wrong"), blank: count("blank"), uncertain: count("uncertain") },
    requestsPerModel: o.items.reduce((n, i) => n + i.regions.length, 0),
    leftOut: [...o.leftOut],
    cap: o.cap ? { maxUsd: o.cap.maxUsd, spentUsd: round(o.cap.spentUsd, 8), stopped: o.cap.stopped } : null,
    models: Object.entries(o.results).map(([model, results]) => modelReport(model, o.items, results, o.photos)),
  };
}

const pct = (x: number | null) => (x === null ? "none" : `${(x * 100).toFixed(1)}%`);
const usd = (x: number) => `USD ${x.toFixed(6)}`;

/** The report as Markdown: the summary table first, then each model's threshold and reliability tables. */
export function reportMarkdown(r: ComparisonReport): string {
  const lines = [
    `# Decision second-opinion comparison${r.fake ? " (fake HTTP: not a model result)" : ""}`,
    "",
    `${r.physical ? `Real phone photos of the made-up Robin booklet (${r.physical.devices.join(" and ")})` : "Synthetic fixed set"}: ${r.photos} photos; items asked: ${r.items.right} right, ${r.items.wrong} wrong, ${r.items.blank} blank, ${r.items.uncertain} uncertain; ${r.requestsPerModel} requests per model. Rows left out (parent or team-marked two ways): ${r.leftOut.length}.`,
    ...(r.physical ? [`Photos the page check refused (not asked: no straightened page to crop): ${r.physical.refused.length}${r.physical.refused.length ? ` (${r.physical.refused.map((x) => `${x.file}: ${x.reason ?? "refused"}`).join("; ")})` : ""}.`, ...(r.physical.bothPhones ? [] : ["One phone only: Android not tested. This set does not stand in for the spec's two-phone set."])] : []),
    `Pass bar: 0 false Right, with every wrong, blank and uncertain request answered, and at least ${PASS_CONFIRM_RATE * 100}% of right items confirmed at the same threshold.${r.physical ? "" : " Synthetic ink does not prove real handwriting."}`,
    ...(r.cap ? [`Cost cap: USD ${r.cap.maxUsd}; spent USD ${r.cap.spentUsd.toFixed(6)} (known costs, and the bound of each attempt with a missing cost).${r.cap.stopped ? " The run stopped at the cost cap: a cost was above its bound, so the pinned prices are out of date, and no new request was sent." : ""}`] : []),
    "",
    "| Model | Lowest 0-false-Right threshold | Confirm rate there | Passes | Cost | Cost per photo | p50 latency | p95 latency | Errors |",
    "|---|---|---|---|---|---|---|---|---|",
    ...r.models.map((m) => `| ${m.model} | ${m.lowestZeroFalseRight?.toFixed(2) ?? "none"} | ${pct(m.confirmRateAtLowest)} | ${m.passes ? "yes" : m.incomplete ? `no (${m.incomplete})` : "no"} | ${usd(m.costUsd)}${m.costMissing ? ` known part; ${m.costMissing} requests with a missing cost` : ""} | ${usd(m.costPerPhotoUsd)} | ${m.latencyMs.p50 ?? "-"} ms | ${m.latencyMs.p95 ?? "-"} ms | ${Object.entries(m.errors).map(([k, v]) => `${k} ${v}`).join(", ") || "0"} |`),
  ];
  for (const m of r.models) {
    lines.push("", `## ${m.model}`, "", `Providers: ${Object.entries(m.providers).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`, "", "| Threshold | Right confirmed | Confirm rate | False Right | wrong | blank | uncertain |", "|---|---|---|---|---|---|---|");
    for (const t of m.thresholds) lines.push(`| ${t.threshold.toFixed(2)} | ${t.confirmed}/${m.rightItems} | ${pct(t.confirmRate)} | ${t.falseRight} | ${t.falseRightBy.wrong} | ${t.falseRightBy.blank} | ${t.falseRightBy.uncertain} |`);
    lines.push("", "Reliability (item P(yes) band against the share of right items):", "", "| P(yes) | Items | Right | Right rate |", "|---|---|---|---|");
    for (const b of m.reliability) lines.push(`| ${b.band} | ${b.items} | ${b.right} | ${pct(b.rightRate)} |`);
  }
  if (r.leftOut.length) lines.push("", "## Rows left out (parent or team-marked two ways)", "", ...r.leftOut.map((l) => `- ${l.photo}: ${l.itemId} (${l.format})`));
  return lines.join("\n") + "\n";
}

/** A model and threshold that pass the bar on both sets (#853), with the confirm rate on each. */
export interface Winner { model: string; threshold: number; syntheticConfirmRate: number; physicalConfirmRate: number }
export interface WinnerResult { winner: Winner | null; candidates: Winner[]; notes: string[] }

/**
 * The winner (spec #850 slice B): for each model in both reports with every non-right request answered, the lowest
 * threshold that gives 0 false Right and at least 80% of right items confirmed on both sets at once; of the models that
 * have one, the higher confirm rate on the real photos. A fake report never names a winner.
 */
export function comparisonWinner(synthetic: ComparisonReport, physical: ComparisonReport): WinnerResult {
  if (!synthetic.synthetic || !physical.physical) throw new Error("winner-needs-a-synthetic-and-a-physical-report");
  const notes: string[] = [];
  if (synthetic.fake || physical.fake) return { winner: null, candidates: [], notes: ["A fake HTTP report is not a model result: no winner."] };
  if (!physical.physical.bothPhones) notes.push("The real set is one phone only (Android not tested): this result does not meet the spec's two-phone set.");
  const candidates: Winner[] = [];
  for (const p of physical.models) {
    const s = synthetic.models.find((m) => m.model === p.model);
    if (!s) { notes.push(`${p.model}: not in the synthetic report.`); continue; }
    if (s.incomplete || p.incomplete) { notes.push(`${p.model}: ${[s.incomplete && `synthetic ${s.incomplete}`, p.incomplete && `real ${p.incomplete}`].filter(Boolean).join("; ")}.`); continue; }
    const both = p.thresholds.find((pt) => {
      const st = s.thresholds.find((t) => t.threshold === pt.threshold);
      return !!st && st.falseRight === 0 && pt.falseRight === 0 && st.confirmRate >= PASS_CONFIRM_RATE && pt.confirmRate >= PASS_CONFIRM_RATE;
    });
    if (!both) { notes.push(`${p.model}: no threshold passes the bar on both sets.`); continue; }
    candidates.push({ model: p.model, threshold: both.threshold, syntheticConfirmRate: s.thresholds.find((t) => t.threshold === both.threshold)!.confirmRate, physicalConfirmRate: both.confirmRate });
  }
  const winner = [...candidates].sort((a, b) => b.physicalConfirmRate - a.physicalConfirmRate || a.threshold - b.threshold)[0] ?? null;
  return { winner, candidates, notes };
}

export function winnerMarkdown(w: WinnerResult): string {
  const head = w.winner
    ? `Winner: ${w.winner.model} at threshold ${w.winner.threshold.toFixed(2)} (confirms ${pct(w.winner.physicalConfirmRate)} of right items on the real photos, ${pct(w.winner.syntheticConfirmRate)} on the synthetic set, with 0 false Right on both).`
    : "No model passes the bar on both sets.";
  return ["## Winner", "", head, ...w.candidates.filter((c) => c !== w.winner).map((c) => `- Also passes: ${c.model} at ${c.threshold.toFixed(2)} (real ${pct(c.physicalConfirmRate)}).`), ...w.notes.map((n) => `- ${n}`)].join("\n") + "\n";
}
