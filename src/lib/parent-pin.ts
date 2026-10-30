import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// The parent PIN (#300, spec #295). A parent sets a 4-digit PIN on the account page. The child's desk (P4) calls `check`
// to leave desk mode. The PIN is stored only as a salted scrypt hash, and the server checks it. A wrong PIN costs an
// attempt: after `maxAttempts` attempts without a right one, every check is refused until `lockMs` has passed.
// The module has no Next.js, React or database import. The store is the seam: src/lib/parent-pin-store.ts (Supabase)
// and src/lib/parent-pin-memory.ts (tests).

/** Five attempts, then 15 minutes. A child at the desk can try 5 PINs in 15 minutes, not 10 000. */
export const PIN_POLICY = { maxAttempts: 5, lockMs: 15 * 60_000 } as const;
export interface PinPolicy { maxAttempts: number; lockMs: number }

const PIN = /^[0-9]{4}$/;
/** True when `pin` is exactly 4 ASCII digits. */
export const validPin = (pin: unknown): pin is string => typeof pin === "string" && PIN.test(pin);

/**
 * What a claim on a parent's PIN gives (`PinStore.claim`). `none`: no PIN is set. `locked`: refused until `until`.
 * `open`: the caller may check this attempt, which the store has already counted; `attemptsLeft` is what is left after
 * it, and `lockedUntil` is set when this attempt is the last one (a wrong answer then starts the lock).
 */
export type PinClaim =
  | { kind: "none" }
  | { kind: "locked"; until: number }
  | { kind: "open"; hash: string; attemptsLeft: number; lockedUntil: number | null };

/**
 * The PIN rows, one per parent. `claim` counts the attempt before the hash is checked, in one atomic step, so guesses
 * sent together cannot all pass the limit (a check then a write would let them). `clear` resets the count after a right
 * PIN, only while the stored hash is still the one that was checked (so a stale check never clears a newer PIN's lock).
 * `create` stores the first hash only when the parent has none (false when a PIN exists). `replace` stores a new
 * hash and resets the count only while the stored hash is still `oldHash`, the one the caller verified (false when it
 * changed meanwhile), so two requests at the same time cannot replace a PIN without its current value. `reset` stores
 * a hash whether or not one is set, with a fresh count: for a forgotten PIN, once the caller has proved the password.
 */
export interface PinStore {
  has(parentId: string): Promise<boolean>;
  create(parentId: string, hash: string): Promise<boolean>;
  replace(parentId: string, oldHash: string, newHash: string): Promise<boolean>;
  claim(parentId: string, now: number, policy: PinPolicy): Promise<PinClaim>;
  clear(parentId: string, hash: string): Promise<void>;
  reset(parentId: string, hash: string): Promise<void>;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "not_set" }
  | { ok: false; error: "wrong"; attemptsLeft: number }
  | { ok: false; error: "locked"; retryAt: number };

export type SetResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "current_required" }
  | { ok: false; error: "wrong"; attemptsLeft: number }
  | { ok: false; error: "locked"; retryAt: number };

export interface ParentPins {
  isSet(parentId: string): Promise<boolean>;
  /** Set the first PIN, or change it: when a PIN is set, `current` must be right (and counts against the limit). */
  set(parentId: string, pin: string, current?: string): Promise<SetResult>;
  /** Check a PIN. The desk calls this to leave desk mode. */
  check(parentId: string, pin: string): Promise<CheckResult>;
  /**
   * Forgot PIN (#301): store a new PIN without the current one, and end any lock. Only after the caller has proved
   * the parent's account password; this module cannot check that.
   */
  reset(parentId: string, pin: string): Promise<{ ok: true } | { ok: false; error: "invalid" }>;
}

const KEY_LENGTH = 32;
const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const derive = (pin: string, salt: Buffer, length: number, params: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pin, salt, length, params, (error, key) => (error ? reject(error) : resolve(key))));

/** `scrypt$N$r$p$salt$hash`, with the salt and the hash in base64. A new random salt for every hash. */
async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pin, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

async function matches(pin: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(pin, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The PIN module over a store. `now` is the clock (milliseconds), passed in so tests move it. */
export function parentPins(store: PinStore, { now = Date.now, policy = PIN_POLICY }: { now?: () => number; policy?: PinPolicy } = {}): ParentPins {
  /** A check that also gives the verified hash, so a change can replace exactly that hash. */
  async function verify(parentId: string, pin: string, clearOnSuccess: boolean): Promise<CheckResult & { hash?: string }> {
    // A malformed PIN cannot be right, so it is not a guess and costs no attempt.
    if (!validPin(pin)) return { ok: false, error: "invalid" };
    const claim = await store.claim(parentId, now(), policy);
    if (claim.kind === "none") return { ok: false, error: "not_set" };
    if (claim.kind === "locked") return { ok: false, error: "locked", retryAt: claim.until };
    if (await matches(pin, claim.hash)) {
      // A change does not clear here: its conditional replace resets the count, and a stale one must change nothing.
      if (clearOnSuccess) await store.clear(parentId, claim.hash);
      return { ok: true, hash: claim.hash };
    }
    if (claim.attemptsLeft <= 0 && claim.lockedUntil !== null) return { ok: false, error: "locked", retryAt: claim.lockedUntil };
    return { ok: false, error: "wrong", attemptsLeft: claim.attemptsLeft };
  }

  return {
    isSet: (parentId) => store.has(parentId),
    async check(parentId, pin) {
      const result = await verify(parentId, pin, true);
      return result.ok ? { ok: true } : result;
    },
    async set(parentId, pin, current) {
      if (!validPin(pin)) return { ok: false, error: "invalid" };
      const hash = await hashPin(pin);
      // The first PIN: stored only if none exists. When another request set one at the same time, this becomes a change.
      if (!(await store.has(parentId)) && (await store.create(parentId, hash))) return { ok: true };
      if (current === undefined) return { ok: false, error: "current_required" };
      const proof = await verify(parentId, current, false);
      if (!proof.ok) {
        if (proof.error === "wrong" || proof.error === "locked") return proof;
        return { ok: false, error: "current_required" };
      }
      // Replace only the hash that was verified: a PIN changed meanwhile needs its own current value.
      if (await store.replace(parentId, proof.hash!, hash)) return { ok: true };
      return { ok: false, error: "current_required" };
    },
    async reset(parentId, pin) {
      if (!validPin(pin)) return { ok: false, error: "invalid" };
      await store.reset(parentId, await hashPin(pin));
      return { ok: true };
    },
  };
}
