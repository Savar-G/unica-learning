// Fingerprints and numbers from a seed. No state and no random source: the same text always gives the same result.
import { createHash } from "node:crypto";

export const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

const inOrder = (_key: string, v: unknown): unknown =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v;

/** Text that JSON writes as it is. */
const PLAIN_TEXT = /^[ !#-[\]-~]*$/;
const textJson = (text: string): string => (PLAIN_TEXT.test(text) ? `"${text}"` : JSON.stringify(text));

/** The own keys in order, or null when JSON can write them in another order: it puts keys that are numbers first. */
function keysInOrder(value: object): string[] | null {
  const keys = Object.keys(value);
  if (keys.some((key) => key >= "0" && key < ":")) return null;
  return keys.every((key, i) => i === 0 || keys[i - 1] < key) ? keys : keys.sort();
}

/** The text of plain data, or null when another kind of value is in it. */
function plainJson(value: unknown): string | null {
  if (typeof value === "string") return textJson(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value !== "object" || "toJSON" in value) return null;
  return Array.isArray(value) ? listJson(value) : objectJson(value);
}

function listJson(list: readonly unknown[]): string | null {
  let out = "";
  for (let i = 0; i < list.length; i++) {
    const text = plainJson(list[i]);
    if (text === null) return null;
    out += i === 0 ? text : `,${text}`;
  }
  return `[${out}]`;
}

function objectJson(value: object): string | null {
  const keys = Object.getPrototypeOf(value) === Object.prototype ? keysInOrder(value) : null;
  if (!keys) return null;
  let out = "";
  for (const key of keys) {
    const text = plainJson((value as Record<string, unknown>)[key]);
    if (text === null) return null;
    out += `${out === "" ? "" : ","}${textJson(key)}:${text}`;
  }
  return `{${out}}`;
}

/**
 * JSON text with sorted keys, so that the order of keys in a file does not change a hash. Plain data has a short way to
 * the same text, because each question of a book is compared by it.
 */
export const canonicalJson = (value: unknown): string => plainJson(value) ?? JSON.stringify(value, inOrder);

/** One seed from several parts. JSON keeps the parts apart: ("a", "b-c") and ("a-b", "c") give different seeds. */
export const seedFrom = (...parts: (string | number)[]): string => sha256(JSON.stringify(parts));

/** A whole number from 0 to size - 1. 48 bits of the hash make the bias too small to matter. */
export function pick(seed: string, size: number): number {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error(`pick needs a size of 1 or more, not ${size}`);
  return Number.parseInt(sha256(seed).slice(0, 12), 16) % size;
}
