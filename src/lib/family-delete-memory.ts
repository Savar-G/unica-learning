import type { AttemptClaim, FamilyDeleteStore, FamilyPlans } from "@/lib/family-delete";

// The self-serve delete's seams in memory, for tests. The store follows the database functions claim_family_delete_attempt
// and request_parent_family_deletion. `log` records the order of every change, so a test can read what happened first.

export interface MemoryFamily {
  /** Every running plan, by Stripe customer. A stopped plan leaves its list. */
  plans: Record<string, string[]>;
  holds: number;
  admin: boolean;
  gone: boolean;
  fenced: boolean;
  /** Stripe or the database fails here. `stop` lists plans whose stop fails; `stopLost` lists plans that stop with no answer. */
  fail: { customers?: boolean; read?: boolean; readAfterStop?: boolean; stop?: string[]; stopLost?: string[]; request?: boolean; check?: boolean };
  /** The family's card hold appears after the check and before the final request. */
  holdBeforeRequest: boolean;
  log: string[];
  attempts: { failed: number; lockedUntil: number | null };
}

export function memoryFamily(over: Partial<MemoryFamily> = {}): MemoryFamily {
  return { plans: {}, holds: 0, admin: false, gone: false, fenced: false, fail: {}, holdBeforeRequest: false, log: [], attempts: { failed: 0, lockedUntil: null }, ...over };
}

export function memoryDeleteStore(f: MemoryFamily): FamilyDeleteStore {
  const verdict = () => (f.admin ? "protected" as const : f.gone ? "missing" as const : f.holds > 0 ? "busy" as const : null);
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
      return verdict() ?? "ready";
    },
    async request() {
      if (f.holdBeforeRequest) { f.holds += 1; f.holdBeforeRequest = false; }
      if (f.fail.request) throw new Error("Database down");
      const refused = verdict();
      if (refused) return refused;
      f.fenced = true;
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
