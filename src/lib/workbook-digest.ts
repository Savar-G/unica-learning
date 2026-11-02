// A short fingerprint of JSON data (#312, R379-8-2): a workbook run stores the fingerprints of what it was planned from
// (the curriculum, the book's page plan), and a resumed job call that finds one changed refuses to go on. It tells
// whether data changed; it is not for security. Two 53-bit hashes (cyrb53) of the JSON text with different seeds.
// Pure TypeScript.

function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** The fingerprint of a JSON value: 28 hex characters. The same value (with its keys in the same order) gives the same. */
export function digestOf(value: unknown): string {
  const text = JSON.stringify(value) ?? "undefined";
  return [cyrb53(text, 0), cyrb53(text, 1)].map((h) => h.toString(16).padStart(14, "0")).join("");
}
