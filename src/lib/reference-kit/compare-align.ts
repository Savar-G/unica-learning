import type { Example, ExamplePart, PageItem, PageRecord, PageSection } from "@/lib/reference-record";
import { isConcreteAnswer } from "./answer-text";
import { normalizeNotationText, normalizeProseText } from "./normalize";

// Pairs two lists in order, so that the pairs never cross. A pair with the same name counts for more
// than all pairs without one; a score of 0 is never paired. Equal choices take the earliest pair.
function alignInOrder<T>(
  a: readonly T[],
  b: readonly T[],
  score: (x: T, y: T, sameName: number) => number,
): Array<[number, number]> {
  const sameName = Math.min(a.length, b.length) + 1;
  const best = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  const paired = (i: number, j: number): number => {
    const s = score(a[i], b[j], sameName);
    return s > 0 ? s + best[i + 1][j + 1] : -1;
  };
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], paired(i, j));
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (best[i][j] === paired(i, j)) pairs.push([i++, j++]);
    else if (best[i][j] === best[i + 1][j]) i += 1;
    else j += 1;
  }
  return pairs;
}

function nameKey(name: unknown): string | null {
  return isConcreteAnswer(name) ? normalizeNotationText(normalizeProseText(name)) : null;
}

// Two names: equal (also after the normalisers), different, or at least one is not given.
function compareNames(a: unknown, b: unknown): "same" | "different" | "open" {
  const keyA = nameKey(a);
  const keyB = nameKey(b);
  if (keyA === null || keyB === null) return "open";
  return keyA === keyB ? "same" : "different";
}

function scoreByName(a: unknown, b: unknown, sameName: number): number {
  return { same: sameName, different: 0, open: 1 }[compareNames(a, b)];
}

export function pairSections(a: readonly PageSection[], b: readonly PageSection[]): Array<[number, number]> {
  return alignInOrder(a, b, (x, y, sameName) => scoreByName(x.instruction, y.instruction, sameName));
}

export function pairExampleParts(a: readonly ExamplePart[], b: readonly ExamplePart[]): Array<[number, number]> {
  return alignInOrder(a, b, (x, y, sameName) => scoreByName(x.caption, y.caption, sameName));
}

// "top" and "foot" are never one place. Readers also give "inline" for an example that another
// reader calls "top" or "foot", so that difference alone does not say that there are two examples.
export function atDifferentEnds(a: Example, b: Example): boolean {
  return a.position !== b.position && [a, b].every((ex) => ex.position === "top" || ex.position === "foot");
}

// The last resort for examples that nothing else pairs: in order, never two with different labels,
// and with another place only when no value of them differs.
export function pairRemainingExamples(
  a: readonly Example[],
  b: readonly Example[],
  sameButPlace: (x: Example, y: Example) => boolean,
): Array<[number, number]> {
  return alignInOrder(a, b, (x, y) => {
    if (compareNames(x.label, y.label) === "different" || atDifferentEnds(x, y)) return 0;
    const placesAgree = compareNames(x.position, y.position) !== "different";
    return placesAgree || sameButPlace(x, y) ? 1 : 0;
  });
}

export function pairedSection(from: PageRecord, to: PageRecord, index: number): number | null {
  return pairSections(from.sections, to.sections).find(([i]) => i === index)?.[1] ?? null;
}

// The item of `to` that is item n of a section of `from`: in the paired section, or anywhere when
// each page has one item with that number. Undefined when it cannot be known.
export function pairedItem(from: PageRecord, to: PageRecord, section: number, n: number): PageItem | undefined {
  const idx = pairedSection(from, to, section);
  const own = idx === null ? undefined : to.sections[idx].items.find((item) => item.n === n);
  if (own) return own;
  const numbered = (page: PageRecord): PageItem[] =>
    page.sections.flatMap((sec) => sec.items.filter((item) => item.n === n));
  const found = numbered(to);
  return numbered(from).length === 1 && found.length === 1 ? found[0] : undefined;
}

// Where an entry that only reader B has belongs in reader A's list. It is sure only right after
// reader A's last entry, when every entry of reader A is the same as the one at that place in reader
// B's list. In all other cases the entry gets its neighbours in reader B's own list (numbered from 1).
export function readerBPlace(
  j: number,
  lengthA: number,
  lengthB: number,
  pairs: ReadonlyMap<number, number>,
  equalA: ReadonlySet<number>,
): { reader_b_after: number | null; reader_b_before: number | null } | Record<string, never> {
  const afterAll =
    j === lengthA && Array.from({ length: lengthA }, (_, i) => pairs.get(i) === i && equalA.has(i)).every(Boolean);
  if (afterAll) return {};
  return { reader_b_after: j > 0 ? j : null, reader_b_before: j + 1 < lengthB ? j + 2 : null };
}
