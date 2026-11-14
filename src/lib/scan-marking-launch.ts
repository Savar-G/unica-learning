/** #542 evidence is maintained in source control. Browser input and environment JSON are not evidence. */
export type MarkingLaunchCandidate = Readonly<{
  model: string;
  prompt: string;
  photoSetSha256: string;
  printedRevision: string;
}>;

export const MARKING_LAUNCH_ITEMS = [
  "sample-approval", "screen-approval", "evaluation-bar", "evaluation-pass",
  "provider-policy", "dedicated-key-limit", "physical-iphone", "physical-android",
  "privacy-text", "release-flags",
] as const;
export type MarkingLaunchItem = typeof MARKING_LAUNCH_ITEMS[number];
type Proof = Readonly<{
  owner: string;
  status: "pending" | "approved" | "deferred";
  proof: string | null;
  recordedAt: string | null;
  candidate: MarkingLaunchCandidate | null;
}>;
export type MarkingLaunchEvidence = Readonly<{
  candidate: MarkingLaunchCandidate | null;
  items: Readonly<Record<MarkingLaunchItem, Proof>>;
  evaluation: Readonly<{
    barSetAt: string;
    startedAt: string;
    completedAt: string;
    maxWrongDefiniteRate: number;
    maxWrongAsRight: number;
    maxClearUnsureRate: number;
    definite: number;
    wrongDefinite: number;
    wrongAsRight: number;
    clear: number;
    clearUnsure: number;
    plainUnsureReasons: boolean;
  }> | null;
  limits: Readonly<{ sharedUtcMonthUsd: number; keyTotalUsd: number; keyReset: "never"; comparisonProjectionStopUsd: number }> | null;
}>;

const pending = (owner: string, proof: string | null = null): Proof => ({ owner, status: "pending", proof, recordedAt: null, candidate: null });
const sonnetTestCandidate: MarkingLaunchCandidate = {
  model: "anthropic/claude-sonnet-5.5", prompt: "whole-page-scalar-readings-v9",
  photoSetSha256: "c206c70d6ea3b8cb8efcd59691bf90289227c0c3e8955b0ccd9a93bf39627497",
  printedRevision: "1f5d1520b9f08b125d57d81bf292",
};

/** Canonical launch record. Pending artifacts do not establish approval or a model pass. See docs/scan-pages.md. */
export const SCAN_MARKING_LAUNCH_EVIDENCE: MarkingLaunchEvidence = {
  candidate: sonnetTestCandidate,
  items: {
    "sample-approval": pending("Savar", "Applicable first-book sample/print acceptance remains shared launch work. PR #685 and PR #672 merged; local coverage is not approval. Do not reimpose the superseded all-level sample requirement."),
    "screen-approval": pending("Savar", "PR #672 S5 local/public-interface, hosted rollback and hosted-session local-browser correction proof is recorded in .design/experiments/r458/root-verification.md and independent-review-final.md. Root browser checks exist despite the stale manifest visual_review label. Preserve the recorded r454 S1 look approval; infer no new human approval or approval demand from the stale label. #458 stays open for applicable shared acceptance, not duplicate S5 code."),
    "evaluation-bar": { owner: "Root comparison owner", status: "approved", recordedAt: "2026-11-06T21:39:19.000Z", candidate: sonnetTestCandidate,
      proof: "D-267 thresholds and unclear-reading refusal were committed at 73460cfe before any inference, and are unchanged for the v9 run (2026-11-14). No threshold, truth or denominator rule changed. See docs/scan-marking-v9-acceptance-20261114.md." },
    "evaluation-pass": { owner: "Cedric (Savar delegated marking, 2026-11-13)", status: "approved", recordedAt: "2026-11-14T01:49:07.834Z", candidate: sonnetTestCandidate,
      proof: "New inference, prompt v9, Sonnet 5.5 on the production route (#929), each endpoint pinned and run separately on the fixed 40 digital photos: anthropic 40/40 served by Anthropic, azure/global 40/40 served by Azure. Both: 0/222 wrong definite, 0 wrong marked right, 0/222 clear unsure; all 74 unsure items on the blurry photos. Spend USD 1.078752. Two-ways rows are blank in fixed40, so written methods are untested. Real handwriting remains unproved (#852). See docs/scan-marking-v9-acceptance-20261114.md." },
    "provider-policy": { owner: "Cedric (Savar delegated marking, 2026-11-13)", status: "approved", recordedAt: "2026-11-13T23:30:00.000Z", candidate: sonnetTestCandidate,
      proof: "Decided 2026-11-13 (vault: 'Scanning and marking calls Savar delegated', item 1): marking photos go to Claude only on Anthropic or Azure (global), never Google (D-337); zero data retention not required for now, because for Claude it exists only on Google Vertex or Amazon Bedrock (no strict JSON output). Neither endpoint is on OpenRouter's ZDR list (2026-11-14). Route shipped in #929." },
    "dedicated-key-limit": pending("Cedric", "The marking key's provider limit read on 2026-11-14 is USD 5 TOTAL, not the USD 50 recorded earlier, and about USD 1.15 of it is used by the v9 run and tests. Raise the key limit (or record the intended limit) and read it again before families use marking."),
    "physical-iphone": pending("Savar and root acceptance owner", "Robin synthetic booklet PDF is ready; no filled saddle-stitched booklet or iPhone Safari pass."),
    "physical-android": pending("Savar and root acceptance owner", "No filled saddle-stitched booklet or Android Chrome pass."),
    "privacy-text": { ...pending("Savar and root release owner", "deferred by Savar (D-293). No privacy text approval recorded."), status: "deferred" },
    "release-flags": pending("Savar and root release owner", "Family switches and production prices remain unchanged. Test-only access is not family approval. Inherited r454/r455 hosted records prove physical-object Storage/route boundaries, expiry, revoked-session refusal and worker deletion; S5 separately proves corrections and deletion without Storage objects. These are recorded results, not fresh hosted checks of this deployment. Round 9 has 582 questions with an AI path, none with a parent path, and no label that asks a parent to judge (#717). Two-ways items wait for our team until the method rules ship. See docs/scan-marking-first-book-coverage-ai-only-20261107.json and docs/scan-pages.md."),
  },
  evaluation: {
    barSetAt: "2026-11-06T21:39:19.000Z", startedAt: "2026-11-14T01:43:31.998Z", completedAt: "2026-11-14T01:49:07.834Z",
    maxWrongDefiniteRate: 0.01, maxWrongAsRight: 0, maxClearUnsureRate: 0.05,
    definite: 222, wrongDefinite: 0, wrongAsRight: 0, clear: 222, clearUnsure: 0, plainUnsureReasons: true,
  },
  limits: { sharedUtcMonthUsd: 50, keyTotalUsd: 5, keyReset: "never", comparisonProjectionStopUsd: 15 },
};

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function candidate(value: unknown): value is MarkingLaunchCandidate {
  const c = record(value);
  return !!c && text(c.model) && text(c.prompt) && hash(c.photoSetSha256) && text(c.printedRevision);
}
function sameCandidate(value: unknown, expected: MarkingLaunchCandidate): boolean {
  return candidate(value) && value.model === expected.model && value.prompt === expected.prompt && value.photoSetSha256 === expected.photoSetSha256 && value.printedRevision === expected.printedRevision;
}
function timestamp(value: unknown): number {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? Date.parse(value) : NaN;
}

/** A changed model, prompt, photo set or print revision makes the corresponding proof stale. No arbitrary age limit. */
export function scanMarkingLaunchReadiness(current: unknown, evidence: unknown, now: string): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const e = record(evidence), items = record(e?.items), clock = timestamp(now);
  if (!Number.isFinite(clock)) blockers.push("invalid-clock");
  if (!candidate(current) || !sameCandidate(e?.candidate, current)) blockers.push("candidate-missing-or-stale");
  for (const id of MARKING_LAUNCH_ITEMS) {
    const proof = record(items?.[id]);
    // (Savar delegated marking decisions to Cedric on 2026-11-13; the provider rule may carry that delegation.)
    const savarApproval = id === "sample-approval" || id === "screen-approval" || id === "provider-policy";
    if (!proof || proof.status !== "approved" || !text(proof.owner) || !text(proof.proof)
      || (savarApproval && proof.owner !== "Savar" && !(id === "provider-policy" && /^Cedric \(Savar delegated marking/.test(String(proof.owner))))
      || !Number.isFinite(timestamp(proof.recordedAt)) || timestamp(proof.recordedAt) > clock
      || !candidate(current) || !sameCandidate(proof.candidate, current)) blockers.push(id);
  }
  const evaluation = record(e?.evaluation);
  if (!evaluation || evaluation.maxWrongDefiniteRate !== 0.01 || evaluation.maxWrongAsRight !== 0 || evaluation.maxClearUnsureRate !== 0.05
    || !Number.isFinite(timestamp(evaluation.barSetAt)) || !Number.isFinite(timestamp(evaluation.startedAt))
    || !Number.isFinite(timestamp(evaluation.completedAt)) || timestamp(evaluation.barSetAt) >= timestamp(evaluation.startedAt)
    || timestamp(evaluation.startedAt) > timestamp(evaluation.completedAt) || timestamp(evaluation.completedAt) > clock) blockers.push("evaluation-bar-or-order");
  if (!evaluation || timestamp(record(items?.["evaluation-bar"])?.recordedAt) !== timestamp(evaluation.barSetAt)
    || !(timestamp(record(items?.["evaluation-pass"])?.recordedAt) >= timestamp(evaluation.completedAt))) blockers.push("evaluation-proof-order");
  if (!evaluation || !count(evaluation.definite) || evaluation.definite === 0 || !count(evaluation.wrongDefinite)
    || evaluation.wrongDefinite > evaluation.definite || evaluation.wrongDefinite * 100 > evaluation.definite
    || evaluation.wrongAsRight !== 0 || !count(evaluation.clear) || evaluation.clear === 0 || !count(evaluation.clearUnsure)
    || evaluation.clearUnsure > evaluation.clear || evaluation.clearUnsure * 20 > evaluation.clear
    || evaluation.plainUnsureReasons !== true) blockers.push("evaluation-result");
  const limits = record(e?.limits);
  if (!limits || limits.sharedUtcMonthUsd !== 50 || limits.keyTotalUsd !== 50 || limits.keyReset !== "never"
    || limits.comparisonProjectionStopUsd !== 15) blockers.push("spending-limits");
  return { ready: blockers.length === 0, blockers };
}
