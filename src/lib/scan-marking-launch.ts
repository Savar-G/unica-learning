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
  model: "anthropic/claude-sonnet-5.5", prompt: "whole-page-scalar-readings-v7",
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
      proof: "D-267 thresholds and unclear-reading refusal were committed at 73460cfe before inference. See docs/scan-marking-v7-acceptance-20261107.md. No threshold, truth or denominator rule changed." },
    "evaluation-pass": { owner: "Root comparison owner", status: "approved", recordedAt: "2026-11-07T07:20:37.047Z", candidate: sonnetTestCandidate,
      proof: "Accepted offline replay of saved v7 Sonnet responses, not new inference: 40 digital photos, 292 automatic and 4 parent items; 0/218 wrong definite, 0 wrong marked right, 1/219 clear unsure (answer-form); all 73 unclear rows remain unsure. Reader e4bf41ee and independent review passed. Real handwriting remains unproved. See docs/scan-marking-v7-acceptance-20261107.md." },
    "provider-policy": { ...pending("Savar", "deferred by Savar (D-293). Real child photos remain blocked until Savar sees a passing host policy and chooses."), status: "deferred" },
    "dedicated-key-limit": { owner: "Root platform owner", status: "approved", recordedAt: "2026-11-07T07:20:37.047Z", candidate: sonnetTestCandidate,
      proof: "Dedicated key GET returned USD 50 total and limit_reset:null. Source uses only SCAN_MARKING_OPENROUTER_API_KEY; no shared-key fallback. Shared USD 50 UTC-month ledger and aggregate USD 15 comparison stop remain. Deployed key loading and production prices need separate test-only proof. See docs/scan-marking-v7-acceptance-20261107.md." },
    "physical-iphone": pending("Savar and root acceptance owner", "Robin synthetic booklet PDF is ready; no filled saddle-stitched booklet or iPhone Safari pass."),
    "physical-android": pending("Savar and root acceptance owner", "No filled saddle-stitched booklet or Android Chrome pass."),
    "privacy-text": { ...pending("Savar and root release owner", "deferred by Savar (D-293). No privacy text approval recorded."), status: "deferred" },
    "release-flags": pending("Savar and root release owner", "Family switches and production prices remain unchanged. Test-only access is not family approval. Inherited r454/r455 hosted records prove physical-object Storage/route boundaries, expiry, revoked-session refusal and worker deletion; S5 separately proves corrections and deletion without Storage objects. These are recorded results, not fresh hosted checks of this deployment. See docs/scan-pages.md."),
  },
  evaluation: {
    barSetAt: "2026-11-06T21:39:19.000Z", startedAt: "2026-11-07T04:37:20.105Z", completedAt: "2026-11-07T05:10:56.632Z",
    maxWrongDefiniteRate: 0.01, maxWrongAsRight: 0, maxClearUnsureRate: 0.05,
    definite: 218, wrongDefinite: 0, wrongAsRight: 0, clear: 219, clearUnsure: 1, plainUnsureReasons: true,
  },
  limits: { sharedUtcMonthUsd: 50, keyTotalUsd: 50, keyReset: "never", comparisonProjectionStopUsd: 15 },
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
    const savarApproval = id === "sample-approval" || id === "screen-approval" || id === "provider-policy";
    if (!proof || proof.status !== "approved" || !text(proof.owner) || !text(proof.proof)
      || (savarApproval && proof.owner !== "Savar")
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
