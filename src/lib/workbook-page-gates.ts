// The page layout gate on rendered workbook pages (#859, spec #850 slice D). After a run renders its book, the decision
// model looks at each rendered page image once and answers three yes/no questions: is text cut off, do parts overlap,
// is an answer box too small to write in. A page above a gate's threshold is flagged for the admin. There is no rewrite.
// Each result is stored in public.workbook_run_gates at the key "page:<page>", so a resume asks nothing again.
// Every gate is off until it is calibrated on sample pages and changed pages (a held-out catch of 90% with at most 5%
// false flags, as the question gates). With no gate on, the run asks nothing.
import sharp from "sharp";
import { decisionClient, type DecisionClient, type DecisionQuestion } from "@/lib/decision-client";
import type { AiUsageTag } from "@/lib/ai-usage";

export const PAGE_GATES = ["text_cut_off", "overlap", "box_too_small"] as const;
export type PageGate = (typeof PAGE_GATES)[number];

/** Raise when a threshold changes; each stored row keeps the version it was judged with. */
export const PAGE_GATE_THRESHOLD_VERSION = 2;
type Terms = { enabled: true; threshold: number } | { enabled: false; threshold: null; reason: string };
export type PageGateTerms = Readonly<Record<PageGate, Terms>>;
export const PAGE_GATE_THRESHOLDS: Readonly<Record<string, PageGateTerms>> = {
  // Version 2 (2026-11-13, docs/workbook-page-gate-set-report.md): fitted on the whole set; both folds passed.
  "typesafe/jev-1.14": {
    text_cut_off: { enabled: true, threshold: 0.48 },
    overlap: { enabled: true, threshold: 0.74 },
    box_too_small: { enabled: false, threshold: null, reason: "changed and unchanged pages overlap (0.13-0.56 against up to 0.43)" },
  },
};

/** The longest side of the image the model reads (TypeSafe refuses larger, "Invalid image dimensions"; the photo check uses the same). A page is scaled down to it, never up. */
export const PAGE_GATE_MAX_SIDE = 1568;

const QUESTIONS: Record<PageGate, DecisionQuestion> = {
  text_cut_off: { type: "noul", instructions: "Is any printed text on this workbook page cut off: clipped at an edge of the page, of a box or of a card, or hidden under something else?" },
  overlap: { type: "noul", instructions: "Do any two things on this workbook page overlap: text over text, text over a box or a picture, or one box over another?" },
  box_too_small: { type: "noul", instructions: "Is any answer box or work space on this workbook page too small for a child to write the answer by hand?" },
};

const FLAG_REASON: Record<PageGate, string> = {
  text_cut_off: "text may be cut off",
  overlap: "parts of the page may overlap",
  box_too_small: "an answer box may be too small to write in",
};

/** The model's thresholds; a model that is not in the table has none, so it asks no gate. */
export const pageGateTerms = (model: string): PageGateTerms | undefined => Object.hasOwn(PAGE_GATE_THRESHOLDS, model) ? PAGE_GATE_THRESHOLDS[model] : undefined;

/** The gates that are on in these thresholds. */
export function activePageGates(terms: PageGateTerms | undefined): PageGate[] {
  return terms ? PAGE_GATES.filter((gate) => terms[gate].enabled) : [];
}

/** The page image at most PAGE_GATE_MAX_SIDE on its longest side, as PNG. */
export async function scaledPage(png: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(png).resize({ width: PAGE_GATE_MAX_SIDE, height: PAGE_GATE_MAX_SIDE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return new Uint8Array(out);
}

/** The probability that each asked gate should flag the page (the probability of yes: each question asks about a fault). */
export async function pageGateProbabilities(client: DecisionClient, png: Uint8Array, signal: AbortSignal, only: readonly PageGate[] = PAGE_GATES) {
  if (!only.length) throw new Error("no page gates apply");
  const questions = Object.fromEntries(only.map((gate) => [gate, QUESTIONS[gate]]));
  const result = await client.decide({ input: [{ type: "image", mediaType: "image/png", data: await scaledPage(png) }], questions, signal });
  const probabilities: Partial<Record<PageGate, number>> = {};
  for (const gate of only) {
    const answer = result.answers[gate];
    if (!answer || answer.type !== "noul") throw new Error(`invalid ${gate} answer`);
    probabilities[gate] = answer.yes;
  }
  return { probabilities, result };
}

/** The gates that flag the page: on, and at or above their threshold. A missing probability is an error. */
export function pageGateFlags(terms: PageGateTerms | undefined, probabilities: Partial<Record<PageGate, number>>): PageGate[] {
  return activePageGates(terms).filter((gate) => {
    const p = probabilities[gate];
    if (p === undefined) throw new Error(`missing ${gate} probability`);
    const t = terms![gate];
    return t.enabled && p >= t.threshold;
  });
}

export function pageGateReason(flags: readonly PageGate[]): string {
  return `The page layout gate flagged this page: ${flags.map((f) => FLAG_REASON[f]).join("; ")}. Look at the page before you approve.`;
}

/** The stored key of a page's result. */
export const pageGateKey = (page: number) => `page:${page}`;

/** One stored page result (a row of public.workbook_run_gates). */
export interface StoredPageGate {
  callKey: string;
  questionId: string;
  model: string;
  thresholdVersion: number;
  outcome: "pass" | "flag" | "unknown";
  flags: PageGate[];
  probabilities: Partial<Record<PageGate, number>>;
  reason: string | null;
}

/** What the admin run page shows on a page that did not pass. */
export interface PageGateMark { outcome: "flag" | "unknown"; flags: PageGate[]; reason: string }

export function pageGateMark(row: StoredPageGate): PageGateMark | null {
  if (row.outcome === "pass") return null;
  return { outcome: row.outcome, flags: row.flags, reason: row.reason ?? (row.outcome === "unknown" ? "The page layout gate did not answer, so this page is flagged for review." : pageGateReason(row.flags)) };
}

export interface PageGateChecker {
  readonly model: string;
  check(page: number, png: Uint8Array, signal: AbortSignal): Promise<StoredPageGate>;
}

/**
 * The checker for a decision client: an errored request is `unknown`, not a throw, so the run flags the page and goes on.
 * `terms`: the model's thresholds (PAGE_GATE_THRESHOLDS); a calibration or a test passes its own.
 */
export function pageGateChecker(client: DecisionClient, terms: PageGateTerms | undefined = pageGateTerms(client.model)): PageGateChecker | null {
  const only = activePageGates(terms);
  if (!only.length) return null;
  const base = (page: number) => ({ callKey: pageGateKey(page), questionId: `page-${page}`, model: client.model, thresholdVersion: PAGE_GATE_THRESHOLD_VERSION });
  return {
    model: client.model,
    async check(page, png, signal) {
      try {
        const { probabilities } = await pageGateProbabilities(client, png, signal, only);
        const flags = pageGateFlags(terms, probabilities);
        return { ...base(page), outcome: flags.length ? "flag" : "pass", flags, probabilities, reason: flags.length ? pageGateReason(flags) : null };
      } catch (e) {
        return { ...base(page), outcome: "unknown", flags: [], probabilities: {}, reason: e instanceof Error ? e.message.slice(0, 200) : "the page layout gate failed" };
      }
    },
  };
}

/** The live checker: null when decisions are off or no page gate is on, so the run asks nothing. */
export function decisionPageGateChecker(env: Record<string, string | undefined>, usage?: AiUsageTag): PageGateChecker | null {
  const client = decisionClient(env, undefined, { usage: usage ?? { feature: "workbook_gate" } });
  return client ? pageGateChecker(client) : null;
}

const OUTAGE_MIN = 10;
const OUTAGE_RATE = 0.2;

/**
 * Checks each rendered page once, in page order. A page with a stored result is not asked again. After 10 requests, more
 * than 20% errors stop later requests (counting the stored ones), and the pages left have no result. `save` stores a
 * row before the next page is asked; a throw from it stops the pass.
 */
export async function checkRenderedPages(
  checker: PageGateChecker,
  stored: readonly StoredPageGate[],
  pages: readonly { number: number; png: Uint8Array }[],
  save: (row: StoredPageGate) => Promise<void>,
  signal: AbortSignal,
): Promise<{ rows: Map<number, StoredPageGate>; unavailable: boolean }> {
  const byKey = new Map(stored.map((r) => [r.callKey, r]));
  const rows = new Map<number, StoredPageGate>();
  let asked = stored.length;
  let errored = stored.filter((r) => r.outcome === "unknown").length;
  const down = () => asked >= OUTAGE_MIN && errored / asked > OUTAGE_RATE;
  for (const page of [...pages].sort((a, b) => a.number - b.number)) {
    const kept = byKey.get(pageGateKey(page.number));
    if (kept) { rows.set(page.number, kept); continue; }
    if (down() || signal.aborted) continue;
    asked += 1;
    const row = await checker.check(page.number, page.png, signal);
    if (row.outcome === "unknown") errored += 1;
    await save(row);
    rows.set(page.number, row);
  }
  return { rows, unavailable: down() };
}

// ---------- Calibration (#859) ----------

/** One page of the calibration set: an unchanged sample page, or a changed copy of one that shows `gate`'s fault. */
export interface PageGateCase { id: string; source: string; gate: PageGate | null }
/** One model answer: the probability of each gate's fault on that page. */
export interface PageGateCaseRow { id: string; probabilities: Record<PageGate, number> }

/**
 * Two halves, without reading any answer. A changed copy goes to its source page's half, so no fold sees a page and its
 * copy apart. Each gate's source pages alternate between the halves in set order, so every fold has copies of every
 * gate; the other pages then fill the smaller half, in source order.
 */
export function splitPageGateCases(cases: readonly PageGateCase[]): Map<string, 0 | 1> {
  const side = new Map<string, 0 | 1>();
  const count = [0, 0];
  const n = new Map<PageGate, number>();
  for (const c of cases) {
    if (c.gate === null || side.has(c.source)) continue;
    const k = n.get(c.gate) ?? 0;
    n.set(c.gate, k + 1);
    side.set(c.source, (k % 2) as 0 | 1);
    count[k % 2] += 1;
  }
  for (const source of new Set(cases.map((c) => c.source))) {
    if (side.has(source)) continue;
    const s = (count[0] <= count[1] ? 0 : 1) as 0 | 1;
    side.set(source, s);
    count[s] += 1;
  }
  return new Map(cases.map((c) => [c.id, side.get(c.source)!]));
}

/**
 * The threshold that catches the most changed pages while it flags at most 5% of unchanged pages (then the fewest false
 * flags). Several thresholds often tie; the middle of the tied range is chosen, the most room on both sides: the highest
 * one (the first rule, 2026-11-13) sat just under the fitted half's lowest changed page and missed the other half's.
 * Null when no cut-off meets the false-flag limit.
 */
export function calibratePageGate(unchanged: readonly number[], changed: readonly number[]): { threshold: number; caught: number; falseFlags: number } | null {
  if (!unchanged.length || !changed.length || [...unchanged, ...changed].some((p) => !Number.isFinite(p) || p < 0 || p > 1)) throw new Error("invalid page gate probabilities");
  const choices = Array.from({ length: 101 }, (_, n) => n / 100).map((t) => ({ threshold: t, caught: changed.filter((p) => p >= t).length, falseFlags: unchanged.filter((p) => p >= t).length }))
    .filter((x) => x.falseFlags / unchanged.length <= 0.05);
  if (!choices.length) return null;
  const best = choices.reduce((a, b) => (b.caught > a.caught || (b.caught === a.caught && b.falseFlags < a.falseFlags) ? b : a));
  const tied = choices.filter((x) => x.caught === best.caught && x.falseFlags === best.falseFlags).map((x) => x.threshold);
  const threshold = Math.round(((Math.min(...tied) + Math.max(...tied)) / 2) * 100) / 100;
  return { threshold, caught: best.caught, falseFlags: best.falseFlags };
}

/**
 * Fit a gate's threshold on one half and measure it on the other, then swap (as the question gates, #857). A fold
 * passes at 90% caught with at most 5% false flags; a gate may be turned on only when both pass. Unchanged pages count
 * for every gate; a changed copy counts only for its own gate.
 */
export function evaluatePageGateFolds(cases: readonly PageGateCase[], rows: readonly PageGateCaseRow[], gate: PageGate) {
  const split = splitPageGateCases(cases);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const data = [{ unchanged: [] as number[], changed: [] as number[] }, { unchanged: [] as number[], changed: [] as number[] }];
  for (const c of cases) {
    if (c.gate !== null && c.gate !== gate) continue;
    const row = byId.get(c.id);
    if (!row) throw new Error(`missing page gate result for ${c.id}`);
    data[split.get(c.id)!][c.gate ? "changed" : "unchanged"].push(row.probabilities[gate]);
  }
  return ([0, 1] as const).map((testSide) => {
    const train = data[1 - testSide];
    // (A half with no changed copy of this gate has nothing to fit on: the gate stays off.)
    const fit = train.changed.length && train.unchanged.length ? calibratePageGate(train.unchanged, train.changed) : null;
    const test = data[testSide];
    if (!fit) return { testSide, threshold: null, caught: 0, changed: test.changed.length, falseFlags: 0, unchanged: test.unchanged.length, passed: false };
    const caught = test.changed.filter((p) => p >= fit.threshold).length;
    const falseFlags = test.unchanged.filter((p) => p >= fit.threshold).length;
    return { testSide, threshold: fit.threshold, caught, changed: test.changed.length, falseFlags, unchanged: test.unchanged.length,
      passed: test.changed.length > 0 && caught / test.changed.length >= 0.9 && falseFlags / test.unchanged.length <= 0.05 };
  });
}
