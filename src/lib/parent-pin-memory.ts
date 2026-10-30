// The parent PIN store (src/lib/parent-pin.ts, #300) in memory, for tests. It keeps the database's rules, which the
// Supabase function claim_pin_attempt keeps in one statement under a row lock: a claim counts the attempt before the hash
// is checked; the attempt that reaches the limit starts the lock; a lock that has ended gives a fresh count; a claim in a
// lock changes nothing. Every operation yields first, so calls started together interleave as requests would, and the
// read and the write after it happen together with no yield between them, as in one statement.
import type { PinClaim, PinPolicy, PinStore } from "@/lib/parent-pin";

/** A row of public.parent_pins. */
export interface MemoryPinRow {
  parentId: string;
  hash: string;
  failedAttempts: number;
  lockedUntil: number | null;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A store over the rows given. `rows()` returns the stored rows, so a test can check what is held. */
export function memoryPinStore(initial: MemoryPinRow[] = []): PinStore & { rows(): MemoryPinRow[] } {
  const rows = initial.map((r) => ({ ...r }));
  const find = (parentId: string) => rows.find((r) => r.parentId === parentId);
  return {
    rows: () => rows.map((r) => ({ ...r })),
    async has(parentId) {
      await tick();
      return !!find(parentId);
    },
    async create(parentId, hash) {
      await tick();
      if (find(parentId)) return false;
      rows.push({ parentId, hash, failedAttempts: 0, lockedUntil: null });
      return true;
    },
    async replace(parentId, oldHash, newHash) {
      await tick();
      const row = find(parentId);
      if (!row || row.hash !== oldHash) return false;
      Object.assign(row, { hash: newHash, failedAttempts: 0, lockedUntil: null });
      return true;
    },
    async claim(parentId, now, policy: PinPolicy): Promise<PinClaim> {
      await tick();
      const row = find(parentId);
      if (!row) return { kind: "none" };
      if (row.lockedUntil !== null) {
        if (row.lockedUntil > now) return { kind: "locked", until: row.lockedUntil };
        // The lock has ended: a fresh set of attempts.
        row.failedAttempts = 0;
        row.lockedUntil = null;
      }
      row.failedAttempts += 1;
      if (row.failedAttempts >= policy.maxAttempts) row.lockedUntil = now + policy.lockMs;
      return { kind: "open", hash: row.hash, attemptsLeft: Math.max(0, policy.maxAttempts - row.failedAttempts), lockedUntil: row.lockedUntil };
    },
    async clear(parentId, hash) {
      await tick();
      const row = find(parentId);
      if (row && row.hash === hash) Object.assign(row, { failedAttempts: 0, lockedUntil: null });
    },
  };
}
