import type { Example, ExamplePart, PageRecord, PageSection, ReferenceRecord } from "@/lib/reference-record";
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

// A path that names a section of one record, with the number that the paired section has in another
// record. Null when the other record has no such section.
export function sectionPathIn(path: string, from: ReferenceRecord | null, to: ReferenceRecord | null): string | null {
  const match = /^sections\[(\d+)\]/.exec(path);
  if (!match || from?.kind !== "page" || to?.kind !== "page") return path;
  const idx = pairedSection(from, to, Number(match[1]));
  return idx === null ? null : `sections[${idx}]${path.slice(match[0].length)}`;
}

export function pairedSection(from: PageRecord, to: PageRecord, index: number): number | null {
  return pairSections(from.sections, to.sections).find(([i]) => i === index)?.[1] ?? null;
}
