import type { ProvePassword } from "@/lib/parent-pin";

// A parent deletes the whole family from the Account tab (#556, spec #544, D-247). The order of the steps is the point:
//
// 1. The form, then the password: each try is counted before the password is checked, 5 tries, then 15 minutes locked.
// 2. A check that changes nothing: an admin account, a family with a card hold, a family with an open plan start record, or a family
//    already gone stops here. An open record means that Stripe may still make a plan no read can see yet, so only the team can end it
//    (#554). Steps 5 and 7 check it again, as a record can open in between.
// 3. Every Stripe customer and every plan is read before any plan stops. A failed read leaves the family untouched.
// 4. Each plan stops at once, with no refund. After a failed stop, later plans are left alone.
// 5. The family's delete hold is taken. From here no plan can start: the admin's start route is refused while it is live.
// 6. Every customer is read again. Only "no plan can charge" goes on, so a lost answer from step 4 is settled here, and a
//    plan that started before step 5 stops this request.
// 7. The request is written, under the hold, which fences the family and ends the hold. The deletion worker normally reads no
//    plans for a request (except a start resolved after the fence), so step 6 must come first, and steps 5 to 7 must exclude a
//    plan start. Any other live hold refuses the write. The hold has a lease, so a server that dies here strands nothing:
//    the lease ends, and a request that names a lease that has ended is refused, because a plan may have started since.
//
// Every failure up to step 7 leaves the family's data as it was and no request. A retry is safe from any point: a stopped
// plan no longer reads as running, and the request is written once. The module has no Next.js, Stripe or database import.
// Seams: src/lib/family-delete-server.ts (the live site), src/lib/family-delete-memory.ts (tests).

/** The word a parent types, as well as the password, so that no single slip deletes a family. */
export const DELETE_WORD = "DELETE";

/** The plain confirmation, outside the account pages: the session has ended when the parent lands on it. */
export const FAMILY_DELETED_PATH = "/family-deleted";

/**
 * Says that this browser's own delete stopped the plans, for the confirmation page after the session has ended. It holds no
 * family data. It is a cookie and not a link, so that no one can send the promise to another person.
 */
export const PLANS_STOPPED_COOKIE = "unica_plans_stopped";

/** A queued family's answer on the account APIs. Its pages go to FAMILY_DELETED_PATH instead. */
export const FAMILY_DELETED_STATUS = 410;

/** Which paths a family with a queued request may no longer use: "page", "api", or null for every other path. */
export function familyPath(pathname: string): "page" | "api" | null {
  const under = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (under("/api/account") || under("/api/desk")) return "api";
  if (under("/account") || under("/tutor")) return "page";
  return null;
}

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
  check(parent: string): Promise<"ready" | "busy" | "plan_start" | "protected" | "missing">;
  /** Takes the family's delete hold for `token`, with a lease. While it is live, a plan start is refused. Refused for any other live hold. */
  hold(parent: string, token: string): Promise<"held" | "busy" | "plan_start" | "protected" | "missing">;
  /** Ends this token's hold only. A hold already gone changes nothing. */
  release(parent: string, token: string): Promise<void>;
  /**
   * Fences the family, queues its deletion once, records that its plans stopped, and ends the hold. Refused unless `token`
   * still holds a live lease, and for any other hold, decided under the row lock.
   */
  request(parent: string, token: string): Promise<"requested" | "busy" | "plan_start" | "protected" | "missing">;
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
  | { ok: false; error: "not_finished"; plansStopped: number }
  /** The team must finish a plan start first. No request exists, the family's data is all there, and `plansStopped` plans ended. */
  | { ok: false; error: "plan_start"; plansStopped: number };

export interface FamilyDeleteSeams {
  store: FamilyDeleteStore;
  plans: FamilyPlans;
  now?: () => number;
  policy?: DeletePolicy;
  newToken?: () => string;
}

export async function requestFamilyDelete(parent: string, input: unknown, prove: ProvePassword, { store, plans, now = Date.now, policy = DELETE_POLICY, newToken = () => crypto.randomUUID() }: FamilyDeleteSeams): Promise<FamilyDeleteResult> {
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
  if (ready === "plan_start") return { ok: false, error: "plan_start", plansStopped: 0 };
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

  // The token is made here, so that a hold whose answer was lost can still be let go. Letting go is best effort: if it
  // fails, the lease ends the hold.
  const token = newToken();
  const letGo = async () => { await store.release(parent, token).catch(() => {}); };
  let hold: Awaited<ReturnType<FamilyDeleteStore["hold"]>>;
  try {
    hold = await store.hold(parent, token);
  } catch {
    await letGo();
    return { ok: false, error: "not_finished", plansStopped: known };
  }
  if (hold === "plan_start") return { ok: false, error: "plan_start", plansStopped: known };
  if (hold !== "held") return running.length === 0 && hold === "busy" ? { ok: false, error: "busy" } : { ok: false, error: "not_finished", plansStopped: known };

  let left: string[];
  try {
    left = await everyPlan();
  } catch {
    await letGo();
    return { ok: false, error: "not_finished", plansStopped: known };
  }
  const plansStopped = running.filter((plan) => !left.includes(plan)).length;
  if (left.length > 0) {
    await letGo();
    return { ok: false, error: "not_finished", plansStopped };
  }

  let requested: Awaited<ReturnType<FamilyDeleteStore["request"]>> | null = null;
  try {
    requested = await store.request(parent, token);
    if (requested === "requested") return { ok: true, plansStopped };
  } catch { /* A lost answer may have written it. A retry answers the same, and a hold already gone changes nothing. */ }
  await letGo();
  return { ok: false, error: requested === "plan_start" ? "plan_start" : "not_finished", plansStopped };
}
