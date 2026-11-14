// The photo check's threshold run (#855), for the local script scripts/photo-check-thresholds-cli.ts. It asks one
// question about each labelled photo, one request at a time, under a cost cap: each request is admitted only when its
// whole cost bound fits (costCap from the #851 comparison), and is settled at its known cost plus the bound of each
// attempt that gave no cost. So a cap of 0 sends nothing, and an unknown charge uses up the cap. A request that is not
// admitted is a row with error "budget" and no answer. Local tool only: synthetic photos, no database.
import { DecisionError, attemptCostBound, requestCostBound, type DecisionClient } from "@/lib/decision-client";
import { costCap, type CostCap } from "@/lib/decision-marking-comparison";
import { PHOTO_CHECK_CATCH_RATE, PHOTO_CHECK_CONTEXT, PHOTO_CHECK_QUESTIONS, PHOTO_THRESHOLD_GRID, type PhotoProblem, type ThresholdRow } from "@/lib/scan-photo-check";

/** The --max-usd value: a finite number of at least 0, else an error. */
export function parseMaxUsd(text: string | undefined): number {
  const value = text === undefined || text.trim() === "" ? NaN : Number(text);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--max-usd must be a number of at least 0, not ${JSON.stringify(text)}`);
  return value;
}

export interface ThresholdPhoto { id: string; problem: boolean; image: () => Promise<Uint8Array> }
export type ThresholdRunRow = ThresholdRow & { run: number; ms: number | null; error: string | null; usd: number | null; unpriced: number };

export async function runThresholdSet(o: {
  photos: readonly ThresholdPhoto[]; question: PhotoProblem; client: DecisionClient; maxUsd: number; runs?: number;
  timeoutMs?: number; now?: () => number;
}): Promise<{ rows: ThresholdRunRow[]; cap: CostCap }> {
  const now = o.now ?? Date.now;
  const cap = costCap(o.maxUsd);
  const attempt = attemptCostBound(o.client.model), bound = requestCostBound(o.client);
  const settled = (usd: number | null, unpriced: number) => (usd ?? 0) + unpriced * attempt;
  const rows: ThresholdRunRow[] = [];
  for (let run = 1; run <= (o.runs ?? 1); run++) {
    for (const photo of o.photos) {
      const base = { run, photo: photo.id, problem: photo.problem };
      const reservation = await cap.reserve(bound);
      if (reservation === null) { rows.push({ ...base, yes: null, ms: null, error: "budget", usd: null, unpriced: 0 }); continue; }
      const started = now();
      try {
        const data = await photo.image();
        const out = await o.client.decide({
          input: [{ type: "text", text: PHOTO_CHECK_CONTEXT }, { type: "image", mediaType: "image/jpeg", data }],
          questions: { [o.question]: PHOTO_CHECK_QUESTIONS[o.question] }, signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
        });
        cap.settle(reservation, settled(out.usd, out.unpricedAttempts));
        const a = out.answers[o.question];
        rows.push({ ...base, yes: a?.type === "noul" ? a.yes : null, ms: now() - started, error: a?.type === "noul" ? null : "malformed", usd: out.usd, unpriced: out.unpricedAttempts });
      } catch (e) {
        const known = e instanceof DecisionError;
        // An error that says nothing of its attempts is settled at its whole reservation.
        cap.settle(reservation, known ? settled(e.usd, e.unpricedAttempts) : reservation);
        rows.push({ ...base, yes: null, ms: now() - started, error: known ? `${e.kind}: ${e.message}` : String(e), usd: known ? e.usd : null, unpriced: known ? e.unpricedAttempts : 0 });
      }
    }
  }
  return { rows, cap };
}

// ---------- Real photos of each kind (#856, spec #850 slice C) ----------

/** A labelled real photo's kind: clear, or the one problem it was taken to show. */
export type PhotoKind = "clear" | PhotoProblem;
export interface KindPhoto { id: string; kind: PhotoKind; image: () => Promise<Uint8Array> }
export interface KindRow {
  run: number; photo: string; kind: PhotoKind; probabilities: Partial<Record<PhotoProblem, number>>;
  ms: number | null; error: string | null; usd: number | null; unpriced: number;
}
/**
 * A kind ships only with at least this many photos of it. The 80% rule alone would ship a kind on 1 photo of 1; with 5,
 * the rule means at least 4 caught.
 */
export const PHOTO_CHECK_MIN_PROBLEM_PHOTOS = 5;

/**
 * Asks the four questions about each photo in one request, as the check would with every question on, one request at a
 * time under the same cost cap as runThresholdSet. A failed or not admitted request is a row with no probabilities.
 */
export async function runKindSet(o: {
  photos: readonly KindPhoto[]; client: DecisionClient; maxUsd: number; runs?: number; timeoutMs?: number; now?: () => number;
}): Promise<{ rows: KindRow[]; cap: CostCap }> {
  const now = o.now ?? Date.now;
  const cap = costCap(o.maxUsd);
  const attempt = attemptCostBound(o.client.model), bound = requestCostBound(o.client);
  const settled = (usd: number | null, unpriced: number) => (usd ?? 0) + unpriced * attempt;
  const problems = Object.keys(PHOTO_CHECK_QUESTIONS) as PhotoProblem[];
  const rows: KindRow[] = [];
  for (let run = 1; run <= (o.runs ?? 1); run++) {
    for (const photo of o.photos) {
      const base = { run, photo: photo.id, kind: photo.kind };
      const reservation = await cap.reserve(bound);
      if (reservation === null) { rows.push({ ...base, probabilities: {}, ms: null, error: "budget", usd: null, unpriced: 0 }); continue; }
      const started = now();
      try {
        const data = await photo.image();
        const out = await o.client.decide({
          input: [{ type: "text", text: PHOTO_CHECK_CONTEXT }, { type: "image", mediaType: "image/jpeg", data }],
          questions: Object.fromEntries(problems.map((p) => [p, PHOTO_CHECK_QUESTIONS[p]])), signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
        });
        cap.settle(reservation, settled(out.usd, out.unpricedAttempts));
        const probabilities: Partial<Record<PhotoProblem, number>> = {};
        let malformed = false;
        for (const p of problems) {
          const a = out.answers[p];
          if (a?.type === "noul") probabilities[p] = a.yes; else malformed = true;
        }
        rows.push({ ...base, probabilities: malformed ? {} : probabilities, ms: now() - started, error: malformed ? "malformed" : null, usd: out.usd, unpriced: out.unpricedAttempts });
      } catch (e) {
        const known = e instanceof DecisionError;
        cap.settle(reservation, known ? settled(e.usd, e.unpricedAttempts) : reservation);
        rows.push({ ...base, probabilities: {}, ms: now() - started, error: known ? `${e.kind}: ${e.message}` : String(e), usd: known ? e.usd : null, unpriced: known ? e.unpricedAttempts : 0 });
      }
    }
  }
  return { rows, cap };
}

/**
 * One problem's threshold from real photos of each kind: of the grid values that flag no clear photo, those that flag the
 * most photos of this kind; the middle of that range, so the threshold sits between the clear photos and the caught ones
 * rather than just above the highest clear photo. A request with no answer on a clear photo flags nothing; on a photo of
 * the kind it is not caught. Photos of other problem kinds are not counted either way. It ships only with at least
 * PHOTO_CHECK_MIN_PROBLEM_PHOTOS photos of the kind and at least PHOTO_CHECK_CATCH_RATE of them caught.
 */
export function kindThreshold(rows: readonly KindRow[], problem: PhotoProblem) {
  const clear = rows.filter((r) => r.kind === "clear"), own = rows.filter((r) => r.kind === problem);
  const yes = (r: KindRow) => r.probabilities[problem];
  const flags = (t: number, r: KindRow) => { const v = yes(r); return typeof v === "number" && v >= t; };
  const clean = PHOTO_THRESHOLD_GRID.filter((t) => !clear.some((r) => flags(t, r)));
  const catches = (t: number) => own.filter((r) => flags(t, r)).length;
  const best = clean.length ? Math.max(...clean.map(catches)) : 0;
  const tied = clean.filter((t) => catches(t) === best);
  // No photo of the kind: nothing to set a threshold from.
  const threshold = own.length && tied.length ? tied[Math.floor((tied.length - 1) / 2)] : null;
  const caught = threshold === null ? 0 : catches(threshold);
  const values = (list: KindRow[]) => list.flatMap((r) => { const v = yes(r); return typeof v === "number" ? [v] : []; });
  // Photos, not rows: a photo asked in several runs counts once toward the minimum.
  const distinct = new Set(own.map((r) => r.photo)).size;
  const enough = distinct >= PHOTO_CHECK_MIN_PROBLEM_PHOTOS;
  return {
    problem, threshold, caught, rows: own.length, photos: distinct, clear: clear.length, failed: [...clear, ...own].filter((r) => yes(r) === undefined).length,
    maxClear: values(clear).length ? Math.max(...values(clear)) : null, ownValues: values(own).sort((a, b) => a - b),
    tied: tied.length ? [tied[0], tied[tied.length - 1]] as const : null, enough,
    passes: threshold !== null && enough && caught / own.length >= PHOTO_CHECK_CATCH_RATE,
  };
}
