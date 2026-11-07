// The credit check before a paid OpenRouter practice run. The first-ship run (D-298, PR #698) started with about USD 5.45
// left (total_credits 15, total_usage 9.55) against a need of USD 12.74 (estimate 12.48 plus calls in flight): OpenRouter
// answered 402 part way, Maya fell back to code's lines, and most of the 26 runs told nothing about her. This check runs
// before any model call and refuses such a run.
//
// It reads OpenRouter's GET /api/v1/credits with the run's own key (verified 2026-11-07: an ordinary inference key gets
// 200 with total_credits and total_usage). What is left is total_credits minus total_usage, never total_credits alone. A
// failed read refuses the run too. It prints amounts and an HTTP status, never a key.
import { MARGIN } from "./cost";

export const CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const TIME_LIMIT_MS = 15_000;

/** Runs at the same time on paid OpenRouter calls, unless --concurrency says otherwise. */
export const OPENROUTER_CONCURRENCY = 2;
/** Runs at the same time on every other provider (the Claude API, the subscription, the fakes). */
export const DEFAULT_CONCURRENCY = 3;

/**
 * The default for a run. Two on OpenRouter: each run in flight may be mid-call when the money runs out, so fewer runs keep
 * that overrun and this check's reserve small (USD 0.26 on the 26-case suite, against 0.39 at three), and two still runs
 * twice as fast as one. See docs/maya-practice.md, "Cost".
 */
export const practiceConcurrency = (provider: "openrouter" | "anthropic" | "subscription", fake: boolean) =>
  provider === "openrouter" && !fake ? OPENROUTER_CONCURRENCY : DEFAULT_CONCURRENCY;

/** What the runs in flight can still cost once the money is gone: one largest request for each. */
export const inFlightNeed = (concurrency: number, largestRequestUsd: number) => concurrency * largestRequestUsd;

export interface CreditCheck {
  ok: boolean;
  estimateUsd: number;
  inFlightUsd: number;
  /** Null when the credits could not be read. */
  remainingUsd: number | null;
  message: string;
}

const usd = (x: number) => `USD ${x.toFixed(2)}`;

/** The credits left, or why they could not be read. The reason holds a status or a kind of failure, never a key or a body. */
async function readRemaining(fetch: typeof globalThis.fetch, key: string): Promise<{ remaining: number } | { why: string }> {
  let res: Response;
  try {
    res = await fetch(CREDITS_URL, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIME_LIMIT_MS) });
  } catch {
    return { why: "no answer from OpenRouter" };
  }
  if (!res.ok) return { why: `OpenRouter answered ${res.status}` };
  let data: { data?: { total_credits?: unknown; total_usage?: unknown } };
  try {
    data = await res.json() as typeof data;
  } catch {
    return { why: "OpenRouter's answer was not JSON" };
  }
  const total = data?.data?.total_credits;
  const used = data?.data?.total_usage;
  if (typeof total !== "number" || typeof used !== "number" || !Number.isFinite(total) || !Number.isFinite(used)) return { why: "OpenRouter's answer had no credit amounts" };
  return { remaining: total - used };
}

/** Whether the account can pay for the run: the estimate (with its margin) and the calls in flight. */
export async function checkCredits(input: { fetch: typeof globalThis.fetch; key: string; estimateUsd: number; inFlightUsd: number }): Promise<CreditCheck> {
  const { estimateUsd, inFlightUsd } = input;
  const amounts = `estimate ${usd(estimateUsd)} (with its ${MARGIN} margin), in-flight need ${usd(inFlightUsd)}`;
  const read = await readRemaining(input.fetch, input.key);
  if ("why" in read) {
    return { ok: false, estimateUsd, inFlightUsd, remainingUsd: null, message: `The run is refused: the credits could not be read (${read.why}). ${amounts}, remaining unknown.` };
  }
  const line = `${amounts}, remaining ${usd(read.remaining)}`;
  if (read.remaining < estimateUsd + inFlightUsd) {
    return { ok: false, estimateUsd, inFlightUsd, remainingUsd: read.remaining, message: `The run is refused: too little credit. ${line}. Add credit, or run fewer cases.` };
  }
  return { ok: true, estimateUsd, inFlightUsd, remainingUsd: read.remaining, message: `credit check passed: ${line}.` };
}
