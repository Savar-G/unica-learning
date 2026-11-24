// CI probe, not for merge.
// Fingerprints and numbers from a seed. No state and no random source: the same text always gives the same result.
import { createHash } from "node:crypto";

export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** JSON text with sorted keys, so that the order of keys in a file does not change a hash. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v);
}

/** One seed from several parts. JSON keeps the parts apart: ("a", "b-c") and ("a-b", "c") give different seeds. */
export const seedFrom = (...parts: (string | number)[]): string => sha256(JSON.stringify(parts));

/** A whole number from 0 to size - 1. 48 bits of the hash make the bias too small to matter. */
export function pick(seed: string, size: number): number {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error(`pick needs a size of 1 or more, not ${size}`);
  return Number.parseInt(sha256(seed).slice(0, 12), 16) % size;
}
