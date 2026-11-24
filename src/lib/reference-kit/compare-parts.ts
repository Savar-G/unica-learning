import {
  NOT_STATED,
  UNCLEAR,
  type Expr,
  type ItemResponse,
  type ReaderSentinel,
  type Scaffold,
  type ScoreBand,
  type ScoreBands,
} from "@/lib/reference-record";
import { decimalPlacePower } from "./answers";
import { normalizeNotationText, normalizeProseText } from "./normalize";

// empty_answer: an answer place of the final record holds no answer and no "unclear" marker.
// wording: the readers chose different words to describe something (not printed text); does not block.
export type DiffKind =
  | "value"
  | "order"
  | "once_read"
  | "both_unclear"
  | "one_unclear"
  | "empty_answer"
  | "wording";

export interface RecordDifference {
  path: string;
  a: unknown;
  b: unknown;
  kind: DiffKind;
  // once_read only: the reader that has the entry, and the JSON path of the entry in the final
  // record. A path that ends in "[]" means: add the entry at the end of that list.
  reader?: "a" | "b";
  final_path?: string;
}

export type FieldCompareMode = "exact" | "prose" | "notation";

function isEmptyField(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * Handles UNCLEAR and NOT_STATED sentinels consistently.
 * Returns true if the comparison was settled (either equal or diff pushed).
 */
export function checkSentinels(
  path: string,
  a: unknown,
  b: unknown,
  diffs: RecordDifference[],
): boolean {
  if (a === UNCLEAR && b === UNCLEAR) {
    diffs.push({ path, a, b, kind: "both_unclear" });
    return true;
  }
  if (a === UNCLEAR || b === UNCLEAR) {
    diffs.push({ path, a: a ?? null, b: b ?? null, kind: "one_unclear" });
    return true;
  }
  if (a === NOT_STATED && b === NOT_STATED) {
    return true;
  }
  if (a === NOT_STATED || b === NOT_STATED) {
    diffs.push({ path, a: a ?? null, b: b ?? null, kind: "value" });
    return true;
  }
  return false;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => deepEqual(item, b[idx]));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    for (const key of keys) {
      if (!deepEqual(aObj[key], bObj[key])) return false;
    }
    return true;
  }
  return false;
}

export function compareField(
  path: string,
  a: unknown,
  b: unknown,
  opts: { teaching?: boolean; mode?: FieldCompareMode; wording?: boolean },
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aEmpty = isEmptyField(a);
  const bEmpty = isEmptyField(b);
  if (aEmpty && bEmpty) return;
  if (aEmpty !== bEmpty) {
    diffs.push({
      path,
      a: a ?? null,
      b: b ?? null,
      kind: opts.teaching ? "once_read" : "value",
    });
    return;
  }

  const diffKind: DiffKind = opts.wording ? "wording" : "value";

  if (typeof a === "string" && typeof b === "string") {
    const mode = opts.mode ?? "exact";
    const normA =
      mode === "prose"
        ? normalizeProseText(a)
        : mode === "notation"
          ? normalizeNotationText(a)
          : a.trim();
    const normB =
      mode === "prose"
        ? normalizeProseText(b)
        : mode === "notation"
          ? normalizeNotationText(b)
          : b.trim();
    if (normA !== normB) {
      diffs.push({ path, a, b, kind: diffKind });
    }
    return;
  }

  if (!deepEqual(a, b)) {
    diffs.push({ path, a, b, kind: diffKind });
  }
}

function compareListField(
  path: string,
  a: unknown,
  b: unknown,
  opts: { teaching?: boolean; mode?: FieldCompareMode; itemWording?: (av: unknown, bv: unknown) => boolean },
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aEmpty = isEmptyField(a);
  const bEmpty = isEmptyField(b);
  if (aEmpty && bEmpty) return;
  if (aEmpty !== bEmpty) {
    diffs.push({
      path,
      a: a ?? null,
      b: b ?? null,
      kind: opts.teaching ? "once_read" : "value",
    });
    return;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    compareField(path, a, b, opts, diffs);
    return;
  }
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (i >= a.length || i >= b.length) {
      const av = i < a.length ? a[i] : null;
      const bv = i < b.length ? b[i] : null;
      const kind: DiffKind = av === UNCLEAR || bv === UNCLEAR ? "one_unclear" : "value";
      diffs.push({ path: `${path}[${i}]`, a: av, b: bv, kind });
      continue;
    }
    const wording = opts.itemWording ? opts.itemWording(a[i], b[i]) : false;
    compareField(`${path}[${i}]`, a[i], b[i], { mode: opts.mode, wording }, diffs);
  }
}

export function compareExpr(
  path: string,
  a: Expr | ReaderSentinel | null | undefined,
  b: Expr | ReaderSentinel | null | undefined,
  diffs: RecordDifference[],
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  if (isEmptyField(a) && isEmptyField(b)) return;
  if (
    isEmptyField(a) ||
    isEmptyField(b) ||
    !a ||
    !b ||
    typeof a === "string" ||
    typeof b === "string"
  ) {
    diffs.push({ path, a: a ?? null, b: b ?? null, kind: "value" });
    return;
  }

  if (a.kind !== b.kind) {
    diffs.push({ path: `${path}.kind`, a: a.kind, b: b.kind, kind: "value" });
    return;
  }

  switch (a.kind) {
    case "arith": {
      const bArith = b as typeof a;
      compareField(`${path}.op`, a.op, bArith.op, {}, diffs);
      compareListField(`${path}.operands`, a.operands, bArith.operands, {}, diffs);
      return;
    }
    case "chain": {
      const bChain = b as typeof a;
      compareListField(`${path}.terms`, a.terms, bChain.terms, {}, diffs);
      compareField(`${path}.step`, a.step, bChain.step, {}, diffs);
      return;
    }
    case "missing": {
      const bMissing = b as typeof a;
      compareField(`${path}.op`, a.op, bMissing.op, {}, diffs);
      compareListField(`${path}.operands`, a.operands, bMissing.operands, {}, diffs);
      compareField(`${path}.result`, a.result, bMissing.result, {}, diffs);
      return;
    }
    case "linked": {
      const bLinked = b as typeof a;
      compareExpr(`${path}.pair[0]`, a.pair[0], bLinked.pair[0], diffs);
      compareExpr(`${path}.pair[1]`, a.pair[1], bLinked.pair[1], diffs);
      compareField(
        `${path}.connector`,
        a.connector,
        bLinked.connector,
        { teaching: true, mode: "prose" },
        diffs,
      );
      return;
    }
    case "word": {
      const bWord = b as typeof a;
      compareField(`${path}.text`, a.text, bWord.text, { mode: "prose" }, diffs);
      compareField(`${path}.unit`, a.unit, bWord.unit, { teaching: true, mode: "prose" }, diffs);
      const aInner = a.expr;
      const bInner = bWord.expr;
      if (
        typeof aInner === "object" &&
        aInner !== null &&
        typeof bInner === "object" &&
        bInner !== null
      ) {
        compareExpr(`${path}.expr`, aInner, bInner, diffs);
      } else {
        compareField(`${path}.expr`, aInner, bInner, {}, diffs);
      }
      return;
    }
    case "notation": {
      const bNot = b as typeof a;
      compareField(`${path}.latex`, a.latex, bNot.latex, { mode: "notation" }, diffs);
      compareField(
        `${path}.figure`,
        a.figure,
        bNot.figure,
        { teaching: true, mode: "prose", wording: true },
        diffs,
      );
      return;
    }
  }
}

export function compareResponses(
  path: string,
  aList: readonly ItemResponse[],
  bList: readonly ItemResponse[],
  diffs: RecordDifference[],
): void {
  const maxLen = Math.max(aList.length, bList.length);
  for (let i = 0; i < maxLen; i += 1) {
    const rPath = `${path}[${i}]`;
    const ra = aList[i];
    const rb = bList[i];
    if (!ra || !rb) {
      diffs.push({ path: rPath, a: ra ?? null, b: rb ?? null, kind: "value" });
      continue;
    }
    compareField(`${rPath}.position`, ra.position, rb.position, {}, diffs);
    compareField(`${rPath}.cue`, ra.cue, rb.cue, { teaching: true, mode: "prose" }, diffs);
    compareField(`${rPath}.unit`, ra.unit, rb.unit, { teaching: true, mode: "prose" }, diffs);
    compareField(`${rPath}.place`, ra.place, rb.place, { teaching: true, mode: "prose" }, diffs);
    compareField(`${rPath}.answer`, ra.answer, rb.answer, {}, diffs);
    // "reader" against "unchecked" or "computed" is no difference; an answer that one reader
    // reads as printed on the page and the other does not is one.
    if ((ra.answer_source === "printed") !== (rb.answer_source === "printed")) {
      diffs.push({
        path: `${rPath}.answer_source`,
        a: ra.answer_source,
        b: rb.answer_source,
        kind: "value",
      });
    }
  }
}

function canonicalAppliesToKey(appliesTo: Scaffold["applies_to"]): string {
  if (Array.isArray(appliesTo)) {
    return [...appliesTo].sort((x, y) => x - y).join(",");
  }
  return String(appliesTo);
}

function scaffoldPrimaryKey(sc: Scaffold): string {
  const base = `${sc.kind}:${canonicalAppliesToKey(sc.applies_to)}`;
  if (
    sc.kind === "caption" &&
    typeof sc.target === "string" &&
    sc.target !== UNCLEAR &&
    sc.target !== NOT_STATED
  ) {
    return `${base}:${normalizeProseText(sc.target)}`;
  }
  return base;
}

function compareSingleScaffold(
  path: string,
  a: Scaffold,
  b: Scaffold,
  diffs: RecordDifference[],
): void {
  if (a.kind !== b.kind) {
    diffs.push({ path: `${path}.kind`, a: a.kind, b: b.kind, kind: "value" });
    return;
  }
  const aApplies = Array.isArray(a.applies_to)
    ? [...a.applies_to].sort((x, y) => x - y)
    : a.applies_to;
  const bApplies = Array.isArray(b.applies_to)
    ? [...b.applies_to].sort((x, y) => x - y)
    : b.applies_to;
  compareField(`${path}.applies_to`, aApplies, bApplies, {}, diffs);

  switch (a.kind) {
    case "answer_boxes": {
      const bb = b as typeof a;
      compareField(`${path}.box_count`, a.box_count, bb.box_count, { teaching: true }, diffs);
      compareListField(
        `${path}.places`,
        a.places,
        bb.places,
        {
          teaching: true,
          mode: "prose",
          itemWording: (av, bv) => decimalPlacePower(av) === null && decimalPlacePower(bv) === null,
        },
        diffs,
      );
      return;
    }
    case "number_strip": {
      const bb = b as typeof a;
      compareListField(`${path}.values`, a.values, bb.values, {}, diffs);
      compareListField(`${path}.highlighted`, a.highlighted, bb.highlighted, { teaching: true }, diffs);
      return;
    }
    case "table_read_aloud": {
      const bb = b as typeof a;
      compareField(`${path}.has_checkbox`, a.has_checkbox, bb.has_checkbox, { teaching: true }, diffs);
      compareField(
        `${path}.caption_style`,
        a.caption_style,
        bb.caption_style,
        { teaching: true, mode: "prose", wording: true },
        diffs,
      );
      return;
    }
    case "equation_frame": {
      const bb = b as typeof a;
      compareField(
        `${path}.template`,
        a.template,
        bb.template,
        { teaching: true, mode: "notation" },
        diffs,
      );
      return;
    }
    case "arrow": {
      const bb = b as typeof a;
      compareField(`${path}.from`, a.from, bb.from, { teaching: true, mode: "prose", wording: true }, diffs);
      compareField(`${path}.to`, a.to, bb.to, { teaching: true, mode: "prose", wording: true }, diffs);
      compareField(`${path}.label`, a.label, bb.label, { teaching: true, mode: "prose" }, diffs);
      return;
    }
    case "caption": {
      const bb = b as typeof a;
      compareField(`${path}.text`, a.text, bb.text, { teaching: true, mode: "prose" }, diffs);
      compareField(`${path}.target`, a.target, bb.target, { teaching: true, mode: "prose", wording: true }, diffs);
      return;
    }
    case "helper_digit":
    case "partial_working":
    case "worked_item":
    case "other": {
      const bb = b as typeof a;
      compareField(
        `${path}.description`,
        a.description,
        bb.description,
        { teaching: true, mode: "prose", wording: true },
        diffs,
      );
      return;
    }
  }
}

// A list that names every item of the section says the same as "all". Other lists are sorted.
function withAllItems(sc: Scaffold, itemNs: readonly number[] | undefined): Scaffold {
  if (!Array.isArray(sc.applies_to)) return sc;
  const listed = new Set(sc.applies_to);
  if (
    itemNs &&
    itemNs.length > 0 &&
    listed.size === new Set(itemNs).size &&
    itemNs.every((n) => listed.has(n))
  ) {
    return { ...sc, applies_to: "all" };
  }
  return { ...sc, applies_to: [...sc.applies_to].sort((x, y) => x - y) };
}

export function compareScaffolds(
  path: string,
  a: Scaffold[] | typeof UNCLEAR | typeof NOT_STATED,
  b: Scaffold[] | typeof UNCLEAR | typeof NOT_STATED,
  diffs: RecordDifference[],
  itemNs?: { a: readonly number[]; b: readonly number[] },
): void {
  if (checkSentinels(path, a, b, diffs)) return;
  const aOrig = Array.isArray(a) ? a : [];
  const bOrig = Array.isArray(b) ? b : [];
  const aList = aOrig.map((sc) => withAllItems(sc, itemNs?.a));
  const bList = bOrig.map((sc) => withAllItems(sc, itemNs?.b));
  if (aList.length === 0 && bList.length === 0) return;

  const matchedBForA = new Map<number, number>();
  const usedB = new Set<number>();

  // Pass 0: match scaffolds with equal content (after the applies_to normalisation), by the same
  // field rules as the comparison itself (prose fields with the prose normalisation)
  const probeDiffs = (x: Scaffold, y: Scaffold): RecordDifference[] => {
    const probe: RecordDifference[] = [];
    compareSingleScaffold("probe", x, y, probe);
    return probe;
  };
  aList.forEach((scA, idxA) => {
    const matchIdx = bList.findIndex((scB, j) => !usedB.has(j) && probeDiffs(scA, scB).length === 0);
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 0b: match scaffolds that agree on every non-wording field
  aList.forEach((scA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex((scB, j) => {
      if (usedB.has(j)) return false;
      const probe = probeDiffs(scA, scB);
      return probe.length > 0 && probe.every((d) => d.kind === "wording");
    });
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 1: match by kind + applies_to (+ target for caption)
  aList.forEach((scA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const keyA = scaffoldPrimaryKey(scA);
    const matchIdx = bList.findIndex((scB, j) => !usedB.has(j) && scaffoldPrimaryKey(scB) === keyA);
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 2: match remaining by kind + applies_to
  aList.forEach((scA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const keyA = `${scA.kind}:${canonicalAppliesToKey(scA.applies_to)}`;
    const matchIdx = bList.findIndex(
      (scB, j) => !usedB.has(j) && `${scB.kind}:${canonicalAppliesToKey(scB.applies_to)}` === keyA,
    );
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  // Pass 3: match remaining by kind in positional order
  aList.forEach((scA, idxA) => {
    if (matchedBForA.has(idxA)) return;
    const matchIdx = bList.findIndex((scB, j) => !usedB.has(j) && scB.kind === scA.kind);
    if (matchIdx !== -1) {
      matchedBForA.set(idxA, matchIdx);
      usedB.add(matchIdx);
    }
  });

  aList.forEach((scA, idxA) => {
    const matchIdx = matchedBForA.get(idxA);
    if (matchIdx === undefined) {
      diffs.push({ path: `${path}[${idxA}]`, a: aOrig[idxA], b: null, kind: "once_read" });
    } else {
      compareSingleScaffold(`${path}[${idxA}]`, scA, bList[matchIdx], diffs);
    }
  });

  bOrig.forEach((scB, idxB) => {
    if (!usedB.has(idxB)) {
      diffs.push({ path: `${path}[b:${idxB}]`, a: null, b: scB, kind: "once_read" });
    }
  });
}

export function compareScoreBands(
  path: string,
  a: ScoreBands | typeof UNCLEAR | typeof NOT_STATED,
  b: ScoreBands | typeof UNCLEAR | typeof NOT_STATED,
  diffs: RecordDifference[],
): void {
  if (a === UNCLEAR && b === UNCLEAR) {
    diffs.push({ path, a, b, kind: "both_unclear" });
    return;
  }
  if (a === UNCLEAR || b === UNCLEAR) {
    diffs.push({ path, a, b, kind: "one_unclear" });
    return;
  }
  if (!Array.isArray(a) || !Array.isArray(b)) {
    compareField(path, a, b, {}, diffs);
    return;
  }
  for (let i = 0; i < 5; i += 1) {
    const bPath = `${path}[${i}]`;
    const ba: ScoreBand = a[i];
    const bb: ScoreBand = b[i];
    if (Array.isArray(ba) && Array.isArray(bb)) {
      compareField(`${bPath}[0]`, ba[0], bb[0], {}, diffs);
      compareField(`${bPath}[1]`, ba[1], bb[1], {}, diffs);
    } else {
      compareField(bPath, ba, bb, {}, diffs);
    }
  }
}
