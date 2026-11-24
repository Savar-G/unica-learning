import {
  NOT_STATED,
  UNCLEAR,
  type Scaffold,
} from "@/lib/reference-record";
import { isKnownPlaceName } from "./answers";
import {
  checkSentinels,
  compareField,
  compareListField,
  recordDiff,
  type CompareCounts,
  type RecordDifference,
} from "./compare-parts";
import { normalizeProseText } from "./normalize";

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
  counts?: CompareCounts,
): void {
  if (a.kind !== b.kind) {
    recordDiff(diffs, { path: `${path}.kind`, a: a.kind, b: b.kind, kind: "value" }, counts);
    return;
  }
  const aApplies = Array.isArray(a.applies_to)
    ? [...a.applies_to].sort((x, y) => x - y)
    : a.applies_to;
  const bApplies = Array.isArray(b.applies_to)
    ? [...b.applies_to].sort((x, y) => x - y)
    : b.applies_to;
  compareField(`${path}.applies_to`, aApplies, bApplies, {}, diffs, counts);

  switch (a.kind) {
    case "answer_boxes": {
      const bb = b as typeof a;
      compareField(`${path}.box_count`, a.box_count, bb.box_count, { teaching: true }, diffs, counts);
      compareListField(
        `${path}.places`,
        a.places,
        bb.places,
        {
          teaching: true,
          mode: "prose",
          itemWording: (av, bv) => !isKnownPlaceName(av) && !isKnownPlaceName(bv),
        },
        diffs,
        counts,
      );
      return;
    }
    case "number_strip": {
      const bb = b as typeof a;
      compareListField(`${path}.values`, a.values, bb.values, {}, diffs, counts);
      compareListField(`${path}.highlighted`, a.highlighted, bb.highlighted, { teaching: true }, diffs, counts);
      return;
    }
    case "table_read_aloud": {
      const bb = b as typeof a;
      compareField(`${path}.has_checkbox`, a.has_checkbox, bb.has_checkbox, { teaching: true }, diffs, counts);
      compareField(
        `${path}.caption_style`,
        a.caption_style,
        bb.caption_style,
        { teaching: true, mode: "prose", wording: true },
        diffs,
        counts,
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
        counts,
      );
      return;
    }
    case "arrow": {
      const bb = b as typeof a;
      compareField(`${path}.from`, a.from, bb.from, { teaching: true, mode: "prose" }, diffs, counts);
      compareField(`${path}.to`, a.to, bb.to, { teaching: true, mode: "prose" }, diffs, counts);
      compareField(`${path}.label`, a.label, bb.label, { teaching: true, mode: "prose" }, diffs, counts);
      return;
    }
    case "caption": {
      const bb = b as typeof a;
      compareField(`${path}.text`, a.text, bb.text, { teaching: true, mode: "prose" }, diffs, counts);
      compareField(`${path}.target`, a.target, bb.target, { teaching: true, mode: "prose", wording: true }, diffs, counts);
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
        counts,
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
  counts?: CompareCounts,
): void {
  if (checkSentinels(path, a, b, diffs, counts)) return;
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
      recordDiff(diffs, { path: `${path}[${idxA}]`, a: aOrig[idxA], b: null, kind: "once_read" }, counts);
    } else {
      compareSingleScaffold(`${path}[${idxA}]`, scA, bList[matchIdx], diffs, counts);
    }
  });

  bOrig.forEach((scB, idxB) => {
    if (!usedB.has(idxB)) {
      recordDiff(diffs, { path: `${path}[b:${idxB}]`, a: null, b: scB, kind: "once_read" }, counts);
    }
  });
}
