// Fingerprints and numbers from a seed. No state and no random source: the same text always gives the same result.
import { createHash } from "node:crypto";

export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

/** Text that JSON writes as it is. */
const PLAIN_TEXT = /^[ !#-[\]-~]*$/;
const textJson = (text: string): string => (PLAIN_TEXT.test(text) ? `"${text}"` : JSON.stringify(text));

/** True for own keys that JS objects iterate as array indices (0 to 2^32 - 2) before string keys. */
function isArrayIndex(key: string): boolean {
  if (key.length === 0 || (key[0] === "0" && key.length > 1) || key[0] < "0" || key[0] > "9") return false;
  const n = Number(key);
  return Number.isInteger(n) && n >= 0 && n <= 0xfffffffe && String(n) === key;
}

/** Own enumerable keys in the same order that JSON.stringify on Object.fromEntries(sorted) emits. */
function keysInOrder(value: object): string[] {
  const keys = Object.keys(value);
  if (keys.some((key) => key >= "0" && key < ":")) {
    return keys.sort((a, b) => {
      const [ai, bi] = [isArrayIndex(a), isArrayIndex(b)];
      if (ai && bi) return Number(a) - Number(b);
      if (ai !== bi) return ai ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }
  return keys.every((key, i) => i === 0 || keys[i - 1] < key) ? keys : keys.sort();
}

/**
 * Serializes any JSON-serializable value in one pass, reading each property at most once (including accessors).
 * Returns undefined for values JSON omits (undefined, functions, symbols).
 */
function encode(value: unknown, key: string): string | undefined {
  if (value !== null && typeof value === "object") {
    const toJson = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJson === "function") value = (toJson as (k: string) => unknown).call(value, key);
  }
  if (typeof value === "string") return textJson(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    let out = "";
    for (let i = 0; i < value.length; i++) {
      const text = encode(value[i], String(i)) ?? "null";
      out += i === 0 ? text : `,${text}`;
    }
    return `[${out}]`;
  }
  let out = "";
  for (const prop of keysInOrder(value)) {
    const text = encode((value as Record<string, unknown>)[prop], prop);
    if (text !== undefined) out += `${out === "" ? "" : ","}${textJson(prop)}:${text}`;
  }
  return `{${out}}`;
}

/**
 * JSON text with sorted keys, so that the order of keys in a file does not change a hash. Reads every property at most
 * one time so getters with side effects cannot run twice.
 */
export const canonicalJson = (value: unknown): string => encode(value, "") as string;

/** One seed from several parts. JSON keeps the parts apart: ("a", "b-c") and ("a-b", "c") give different seeds. */
export const seedFrom = (...parts: (string | number)[]): string => sha256(JSON.stringify(parts));

/** A whole number from 0 to size - 1. 48 bits of the hash make the bias too small to matter. */
export function pick(seed: string, size: number): number {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error(`pick needs a size of 1 or more, not ${size}`);
  return Number.parseInt(sha256(seed).slice(0, 12), 16) % size;
}
