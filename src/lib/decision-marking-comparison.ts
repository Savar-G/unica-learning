// The synthetic second-opinion comparison (#851, spec #850 slice A): does a decision model confirm right answers and
// never call a wrong, blank or unclear answer Right? For each scored region of an item (markingRegions, on the items the
// crop plan supports) it asks one yes/no question that states the key in its accepted forms, on that region's crop. An
// item is confirmed only when every scored region's P(yes) is at or above the threshold. Both models get the same rows.
// Truth groups: `right` rows count toward the confirm rate; `wrong`, `blank` and `uncertain` rows count toward false
// Right; `parent` rows are listed and left out. An error, a refusal, a block or a time-out is never a pass: that item is
// not confirmed at any threshold. Known wrong answers are never shown to the model.
// Local tool only: synthetic photos, no real child data, no database. The CLI is scripts/decision-marking-comparison-cli.ts.
import { cropPlan } from "@/lib/scan-calibration";
import { markingRegions, type MarkingRegion } from "@/lib/scan-marking-regions";
import { packageItem, valueText, type QuestionPackage } from "@/lib/question-package";
import type { Box, PrintedRegion } from "@/lib/workbook-print-contract";
import { DecisionError, type DecisionClient, type DecisionErrorKind, type DecisionQuestion } from "@/lib/decision-client";

export const COMPARISON_VERSION = 1;
/** The two models this comparison runs, in report order. */
export const COMPARISON_MODELS = ["typesafe/jev-1.14", "google/gemini-decision-1"] as const;
/** Input price in US dollars per million tokens (OpenRouter, 2026-11-11). Output is free on both. */
export const INPUT_USD_PER_M: Readonly<Record<string, number>> = { "typesafe/jev-1.14": 0.042, "google/gemini-decision-1": 0.1 };
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
/** The parts of the fixed 40 manifest (scan-marking-comparison) this comparison reads. */
export interface SetManifest {
  synthetic: true;
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

/** The items to ask about, the parent rows left out, from the manifest. Throws on a row the crop plan cannot ask about. */
export function comparisonItems(manifest: SetManifest): { items: ComparisonItem[]; leftOut: LeftOut[] } {
  if (manifest.synthetic !== true || manifest.identity?.containsRealData !== false) throw new Error("synthetic-set-required");
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
      if (scored.some((r) => r.kind === "method")) throw new Error(`method-region-not-asked:${photo.id}:${row.itemId}`);
      items.push({
        photo: photo.id, clear: photo.clear, itemId: row.itemId, number: q.number, format: row.format, result: row.result,
        regions: scored.map((r) => ({ regionId: r.id, box: r.box, question: regionQuestion(r, q.package!, boxes === 1) })),
      });
    }
  }
  return { items, leftOut };
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
  usd: number | null;
  provider: string | null;
}

/**
 * Asks every region of every item, one request each, with `concurrency` requests in flight per model. A request is not
 * sent when the money spent so far plus its estimate would pass `maxUsd`: it is recorded as "budget" (not confirmed).
 */
export async function askAll(o: {
  items: readonly ComparisonItem[];
  client: DecisionClient;
  image: (item: ComparisonItem, region: RegionAsk) => Promise<{ data: Uint8Array; estimateUsd: number }>;
  maxUsd: number;
  spent: { usd: number };
  concurrency?: number;
  timeLimitMs?: number;
  now?: () => number;
  onResult?: (r: AskResult) => void;
}): Promise<AskResult[]> {
  const now = o.now ?? (() => performance.now());
  const jobs = o.items.flatMap((item) => item.regions.map((region) => ({ item, region })));
  const results: AskResult[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (let n = next++; n < jobs.length; n = next++) {
      const { item, region } = jobs[n];
      const base = { photo: item.photo, itemId: item.itemId, regionId: region.regionId };
      const { data, estimateUsd } = await o.image(item, region);
      if (o.spent.usd + estimateUsd > o.maxUsd) {
        results[n] = { ...base, yes: null, error: "budget", ms: null, usd: null, provider: null };
      } else {
        o.spent.usd += estimateUsd;
        const started = now();
        try {
          const out = await o.client.decide({
            input: [{ type: "text", text: "One answer box cut from a child's workbook page." }, { type: "image", mediaType: "image/jpeg", data }],
            questions: { shows: region.question },
            signal: AbortSignal.timeout(o.timeLimitMs ?? 60_000),
          });
          const answer = out.answers.shows;
          o.spent.usd += (out.usd ?? estimateUsd) - estimateUsd;
          results[n] = { ...base, yes: answer.type === "noul" ? answer.yes : null, error: answer.type === "noul" ? null : "malformed", ms: now() - started, usd: out.usd, provider: out.provider };
        } catch (e) {
          const usd = e instanceof DecisionError ? e.usd : null;
          // A failed request keeps its estimate as spent unless OpenRouter gave its cost.
          if (usd !== null) o.spent.usd += usd - estimateUsd;
          results[n] = { ...base, yes: null, error: e instanceof DecisionError ? e.kind : "unavailable", message: String(e instanceof Error ? e.message : e).slice(0, 300), ms: now() - started, usd, provider: null };
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
  passes: boolean;
  /** Items by their P(yes) (the lowest of their regions) in bands of 0.1, with the share that is right. */
  reliability: { band: string; items: number; right: number; rightRate: number | null }[];
  costUsd: number;
  /** Requests whose answer gave no cost (counted at 0 in costUsd). */
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
  const sent = results.filter((r) => r.error !== "budget");
  const cost = results.reduce((sum, r) => sum + (r.usd ?? 0), 0);
  const ms = sent.flatMap((r) => (r.ms === null ? [] : [r.ms]));
  const p50 = quantile(ms, 0.5), p95 = quantile(ms, 0.95);
  return {
    model, requests: results.length, errors, providers, rightItems: right.length,
    falseRightCandidates: { wrong: count("wrong"), blank: count("blank"), uncertain: count("uncertain") },
    thresholds, lowestZeroFalseRight: lowest?.threshold ?? null, confirmRateAtLowest: lowest?.confirmRate ?? null,
    passes: !!lowest && lowest.confirmRate >= PASS_CONFIRM_RATE, reliability,
    costUsd: round(cost, 8), costMissing: sent.filter((r) => r.usd === null).length, costPerPhotoUsd: photos ? round(cost / photos, 8) : 0,
    latencyMs: { p50: p50 === null ? null : Math.round(p50), p95: p95 === null ? null : Math.round(p95) },
  };
}

export interface ComparisonReport {
  version: number;
  synthetic: true;
  fake: boolean;
  photos: number;
  items: { right: number; wrong: number; blank: number; uncertain: number };
  requestsPerModel: number;
  leftOut: LeftOut[];
  models: ModelReport[];
}

export function comparisonReport(o: { items: readonly ComparisonItem[]; leftOut: readonly LeftOut[]; photos: number; fake: boolean; results: Readonly<Record<string, readonly AskResult[]>> }): ComparisonReport {
  const count = (result: string) => o.items.filter((i) => i.result === result).length;
  return {
    version: COMPARISON_VERSION, synthetic: true, fake: o.fake, photos: o.photos,
    items: { right: count("right"), wrong: count("wrong"), blank: count("blank"), uncertain: count("uncertain") },
    requestsPerModel: o.items.reduce((n, i) => n + i.regions.length, 0),
    leftOut: [...o.leftOut],
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
    `Synthetic fixed set: ${r.photos} photos; items asked: ${r.items.right} right, ${r.items.wrong} wrong, ${r.items.blank} blank, ${r.items.uncertain} uncertain; ${r.requestsPerModel} requests per model. Parent rows left out: ${r.leftOut.length}.`,
    `Pass bar: 0 false Right and at least ${PASS_CONFIRM_RATE * 100}% of right items confirmed at the same threshold. Synthetic ink does not prove real handwriting.`,
    "",
    "| Model | Lowest 0-false-Right threshold | Confirm rate there | Passes | Cost | Cost per photo | p50 latency | p95 latency | Errors |",
    "|---|---|---|---|---|---|---|---|---|",
    ...r.models.map((m) => `| ${m.model} | ${m.lowestZeroFalseRight?.toFixed(2) ?? "none"} | ${pct(m.confirmRateAtLowest)} | ${m.passes ? "yes" : "no"} | ${usd(m.costUsd)}${m.costMissing ? ` (${m.costMissing} without cost)` : ""} | ${usd(m.costPerPhotoUsd)} | ${m.latencyMs.p50 ?? "-"} ms | ${m.latencyMs.p95 ?? "-"} ms | ${Object.entries(m.errors).map(([k, v]) => `${k} ${v}`).join(", ") || "0"} |`),
  ];
  for (const m of r.models) {
    lines.push("", `## ${m.model}`, "", `Providers: ${Object.entries(m.providers).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`, "", "| Threshold | Right confirmed | Confirm rate | False Right | wrong | blank | uncertain |", "|---|---|---|---|---|---|---|");
    for (const t of m.thresholds) lines.push(`| ${t.threshold.toFixed(2)} | ${t.confirmed}/${m.rightItems} | ${pct(t.confirmRate)} | ${t.falseRight} | ${t.falseRightBy.wrong} | ${t.falseRightBy.blank} | ${t.falseRightBy.uncertain} |`);
    lines.push("", "Reliability (item P(yes) band against the share of right items):", "", "| P(yes) | Items | Right | Right rate |", "|---|---|---|---|");
    for (const b of m.reliability) lines.push(`| ${b.band} | ${b.items} | ${b.right} | ${pct(b.rightRate)} |`);
  }
  if (r.leftOut.length) lines.push("", "## Parent rows left out", "", ...r.leftOut.map((l) => `- ${l.photo}: ${l.itemId} (${l.format})`));
  return lines.join("\n") + "\n";
}
