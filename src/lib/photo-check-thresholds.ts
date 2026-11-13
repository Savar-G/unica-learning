// The photo check's threshold run (#855), for the local script scripts/photo-check-thresholds-cli.ts. It asks one
// question about each labelled photo, one request at a time, under a cost cap: each request is admitted only when its
// whole cost bound fits (costCap from the #851 comparison), and is settled at its known cost plus the bound of each
// attempt that gave no cost. So a cap of 0 sends nothing, and an unknown charge uses up the cap. A request that is not
// admitted is a row with error "budget" and no answer. Local tool only: synthetic photos, no database.
import { DecisionError, attemptCostBound, requestCostBound, type DecisionClient } from "@/lib/decision-client";
import { costCap, type CostCap } from "@/lib/decision-marking-comparison";
import { PHOTO_CHECK_CONTEXT, PHOTO_CHECK_QUESTIONS, type PhotoProblem, type ThresholdRow } from "@/lib/scan-photo-check";

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
