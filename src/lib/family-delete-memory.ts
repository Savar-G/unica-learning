import type { AttemptClaim, FamilyDeleteStore, FamilyPlans } from "@/lib/family-delete";

// The self-serve delete's seams in memory, for tests. The store follows the database functions claim_family_delete_attempt,
// begin_family_delete_hold, end_family_delete_hold and request_parent_family_deletion_held. `memoryPlanStart` follows the admin's
// start route. `log` records the order of every change, so a test can read what happened first.

/** As `interval '5 minutes'` in begin_family_delete_hold. */
export const HOLD_LEASE_MS = 5 * 60_000;

export interface MemoryFamily {
  /** Every running plan, by Stripe customer. A stopped plan leaves its list. */
  plans: Record<string, string[]>;
  holds: number;
  admin: boolean;
  gone: boolean;
  fenced: boolean;
  /** The request's record that the plans stopped, as family_deletions.plans_stopped_at. */
  plansStopped: boolean;
  /** The delete hold, as a row of family_delete_holds. A lease that has ended stays until it is replaced. */
  deleteHold: { token: string; until: number } | null;
  /** The database's clock, for the lease. */
  time: number;
  /** Stripe or the database fails here. `stop` lists plans whose stop fails; `stopLost` lists plans that stop with no answer. */
  fail: { customers?: boolean; read?: boolean; readAfterStop?: boolean; stop?: string[]; stopLost?: string[]; request?: boolean; check?: boolean; hold?: boolean; release?: boolean };
  /** The family's card hold appears after the check and before the final request. */
  holdBeforeRequest: boolean;
  log: string[];
  attempts: { failed: number; lockedUntil: number | null };
}

export function memoryFamily(over: Partial<MemoryFamily> = {}): MemoryFamily {
  return { plans: {}, holds: 0, admin: false, gone: false, fenced: false, plansStopped: false, deleteHold: null, time: 0, fail: {}, holdBeforeRequest: false, log: [], attempts: { failed: 0, lockedUntil: null }, ...over };
}

export function memoryDeleteStore(f: MemoryFamily): FamilyDeleteStore {
  const verdict = () => (f.admin ? "protected" as const : f.gone ? "missing" as const : f.holds > 0 ? "busy" as const : null);
  const live = () => (f.deleteHold && f.deleteHold.until > f.time ? f.deleteHold : null);
  return {
    async claimAttempt(_parent, now, policy): Promise<AttemptClaim> {
      const a = f.attempts;
      if (a.lockedUntil !== null && a.lockedUntil > now) return { kind: "locked", until: a.lockedUntil };
      if (a.lockedUntil !== null) { a.failed = 0; a.lockedUntil = null; }
      a.failed += 1;
      if (a.failed >= policy.maxAttempts) a.lockedUntil = now + policy.lockMs;
      f.log.push("claim");
      return { kind: "open", attemptsLeft: Math.max(0, policy.maxAttempts - a.failed), lockedUntil: a.lockedUntil };
    },
    async clearAttempts() {
      f.attempts = { failed: 0, lockedUntil: null };
    },
    async check() {
      if (f.fail.check) throw new Error("Database down");
      return verdict() ?? (live() ? "busy" : "ready");
    },
    async hold(_parent, token) {
      if (f.fail.hold) throw new Error("Database down");
      const refused = verdict();
      if (refused) return refused;
      const other = live();
      if (other && other.token !== token) return "busy";
      f.deleteHold = { token, until: f.time + HOLD_LEASE_MS };
      f.log.push("hold");
      return "held";
    },
    async release(_parent, token) {
      if (f.fail.release) throw new Error("Database down");
      if (f.deleteHold?.token === token) { f.deleteHold = null; f.log.push("release"); }
    },
    async request(_parent, token) {
      if (f.holdBeforeRequest) { f.holds += 1; f.holdBeforeRequest = false; }
      if (f.fail.request) throw new Error("Database down");
      const refused = verdict();
      if (refused) return refused;
      if (live()?.token !== token) return "busy";
      f.fenced = true;
      f.plansStopped = true;
      f.deleteHold = null;
      f.log.push("queued");
      return "requested";
    },
  };
}

export function memoryPlans(f: MemoryFamily): FamilyPlans {
  let stopping = false;
  return {
    async customers() {
      if (f.fail.customers) throw new Error("Booking customer unresolved");
      return Object.keys(f.plans);
    },
    async running(customer) {
      if (f.fail.read && !stopping) throw new Error("Stripe down");
      if (f.fail.readAfterStop && stopping) throw new Error("Stripe down");
      return [...(f.plans[customer] ?? [])];
    },
    async stop(plan) {
      stopping = true;
      if (f.fail.stop?.includes(plan)) throw new Error("Stripe down");
      for (const customer of Object.keys(f.plans)) f.plans[customer] = f.plans[customer].filter((id) => id !== plan);
      f.log.push(`stop ${plan}`);
      if (f.fail.stopLost?.includes(plan)) throw new Error("The answer was lost");
    },
  };
}

/**
 * The admin's start route, whole: its hold, its Stripe call, its release. A hold is refused under the fence and under a live
 * delete hold, as begin_family_card_operation is. Started, the plan is in Stripe and the hold has ended.
 */
export function memoryPlanStart(f: MemoryFamily) {
  return (customer: string, plan: string): "started" | "family_unavailable" => {
    if (f.fenced || (f.deleteHold && f.deleteHold.until > f.time)) return "family_unavailable";
    (f.plans[customer] ??= []).push(plan);
    f.log.push(`start ${plan}`);
    return "started";
  };
}
