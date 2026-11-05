import type { ProvePassword } from "@/lib/parent-pin";

// A parent deletes the whole family from the Account tab (#556, spec #544, D-247). The order of the steps is the point:
//
// 1. The form, then the password: each try is counted before the password is checked, 5 tries, then 15 minutes locked.
// 2. A check that changes nothing: an admin account, a family with a card hold, or a family already gone stops here.
// 3. Every Stripe customer and every plan is read before any plan stops. A failed read leaves the family untouched.
// 4. Each plan stops at once, with no refund. After a failed stop, later plans are left alone.
// 5. Every customer is read again. Only "no plan can charge" goes on, so a lost answer from step 4 is settled here, and
//    a plan that started during step 4 stops this request.
// 6. The request is written, which fences the family. The deletion worker never reads plans for a request, so a live plan
//    would survive the family: step 5 must come first. The fence and the plan start's card hold keep a new plan out.
//
// Every failure up to step 5 leaves the family's data as it was and no request. A retry is safe from any point: a stopped
// plan no longer reads as running, and the request is written once. The module has no Next.js, Stripe or database import.
// Seams: src/lib/family-delete-server.ts (the live site), src/lib/family-delete-memory.ts (tests).

/** The word a parent types, as well as the password, so that no single slip deletes a family. */
export const DELETE_WORD = "DELETE";

/** The plain confirmation, outside the account pages: the session has ended when the parent lands on it. */
export const FAMILY_DELETED_PATH = "/family-deleted";

/** As the PIN reset: five tries, then 15 minutes. */
export const DELETE_POLICY = { maxAttempts: 5, lockMs: 15 * 60_000 } as const;
export interface DeletePolicy { maxAttempts: number; lockMs: number }

export type AttemptClaim =
  | { kind: "locked"; until: number }
  | { kind: "open"; attemptsLeft: number; lockedUntil: number | null };

export interface FamilyDeleteStore {
  /** Counts one try, in one atomic step, before the password is checked. */
  claimAttempt(parent: string, now: number, policy: DeletePolicy): Promise<AttemptClaim>;
  clearAttempts(parent: string): Promise<void>;
  /** Changes nothing. */
  check(parent: string): Promise<"ready" | "busy" | "protected" | "missing">;
  /** Fences the family and queues its deletion, once. The same refusals as `check`, decided again under the row lock. */
  request(parent: string): Promise<"requested" | "busy" | "protected" | "missing">;
}

export interface FamilyPlans {
  /** Every Stripe customer of the family. Throws when one cannot be found, such as an old booking with no match. */
  customers(parent: string): Promise<string[]>;
  /** Every plan of the customer that can still charge. Throws unless it read the whole list. */
  running(customer: string): Promise<string[]>;
  /** Ends the plan now. A throw says nothing about whether it ended: the next read decides. */
  stop(plan: string): Promise<void>;
}

export type FamilyDeleteResult =
  | { ok: true; plansStopped: number }
  | { ok: false; error: "invalid" | "unavailable" | "busy" | "protected" | "not_found" }
  | { ok: false; error: "wrong_password"; attemptsLeft: number }
  | { ok: false; error: "locked"; retryAt: number }
  /** Stopping or queueing failed. No request exists, the family's data is all there, and `plansStopped` plans ended. */
  | { ok: false; error: "not_finished"; plansStopped: number };

export interface FamilyDeleteSeams {
  store: FamilyDeleteStore;
  plans: FamilyPlans;
  now?: () => number;
  policy?: DeletePolicy;
}

export async function requestFamilyDelete(parent: string, input: unknown, prove: ProvePassword, { store, plans, now = Date.now, policy = DELETE_POLICY }: FamilyDeleteSeams): Promise<FamilyDeleteResult> {
  const { password, confirm } = (input ?? {}) as { password?: unknown; confirm?: unknown };
  // A malformed form cannot be right, so it costs no try.
  if (confirm !== DELETE_WORD || typeof password !== "string" || password === "" || password.length > 1000) return { ok: false, error: "invalid" };

  const claim = await store.claimAttempt(parent, now(), policy);
  if (claim.kind === "locked") return { ok: false, error: "locked", retryAt: claim.until };
  const proof = await prove(password);
  if (proof === "unavailable") return { ok: false, error: "unavailable" };
  if (proof === "wrong") {
    if (claim.attemptsLeft <= 0 && claim.lockedUntil !== null) return { ok: false, error: "locked", retryAt: claim.lockedUntil };
    return { ok: false, error: "wrong_password", attemptsLeft: claim.attemptsLeft };
  }
  await store.clearAttempts(parent);

  const ready = await store.check(parent);
  if (ready === "missing") return { ok: false, error: "not_found" };
  if (ready !== "ready") return { ok: false, error: ready };

  const everyPlan = async () => (await Promise.all((await plans.customers(parent)).map((c) => plans.running(c)))).flat();
  let running: string[];
  try {
    running = await everyPlan();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  let known = 0;
  try {
    for (const plan of running) {
      await plans.stop(plan);
      known++;
    }
  } catch { /* The read below decides. */ }

  let left: string[];
  try {
    left = await everyPlan();
  } catch {
    return { ok: false, error: "not_finished", plansStopped: known };
  }
  const plansStopped = running.filter((plan) => !left.includes(plan)).length;
  if (left.length > 0) return { ok: false, error: "not_finished", plansStopped };

  try {
    if (await store.request(parent) !== "requested") return { ok: false, error: "not_finished", plansStopped };
  } catch {
    return { ok: false, error: "not_finished", plansStopped };
  }
  return { ok: true, plansStopped };
}
