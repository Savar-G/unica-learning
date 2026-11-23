import { computeExprAnswer } from "./compute";
import {
  normalizeAnswerForCompare,
  type LayoutInfo,
  type ParsedQuestion,
} from "./parse-legacy-helpers";
import {
  NOT_STATED,
  type ItemForm,
  type ItemResponse,
  type LinkedExpr,
  type PageItem,
  type ReaderValue,
  type ResponsePosition,
  type Scaffold,
  type SimpleExpr,
} from "./types";
import type { AnswerDiff } from "./parse-legacy";

export interface RawRow {
  sectionIndex: number;
  n: number;
  rawId: string;
  question: string;
  answer: string;
}

export interface ParsedRowEntry {
  row: RawRow;
  parsed: ParsedQuestion;
}

export interface SectionBuildContext {
  sourceRef: string;
  sectionIndex: number;
  layoutInfo: LayoutInfo;
  parsedScaffolds: Scaffold[] | typeof NOT_STATED;
  extraScaffolds: Scaffold[];
  answerDiffs: AnswerDiff[];
}

export interface SectionBuildCounts {
  computedItems: number;
  uncheckedItems: number;
}

function scaffoldAppliesToItem(
  scaffolds: Scaffold[] | typeof NOT_STATED,
  kind: Scaffold["kind"],
  n: number,
): boolean {
  if (!Array.isArray(scaffolds)) return false;
  return scaffolds.some(
    (sc) =>
      sc.kind === kind &&
      (sc.applies_to === "all" || (Array.isArray(sc.applies_to) && sc.applies_to.includes(n))),
  );
}

function computedAnswersMatch(
  a: ReturnType<typeof computeExprAnswer>,
  b: ReturnType<typeof computeExprAnswer>,
): boolean {
  if (!a || !b) return false;
  if (a.kind === "single" && b.kind === "single") {
    return a.value === b.value;
  }
  if (a.kind === "multi" && b.kind === "multi") {
    return (
      a.values.length > 0 &&
      a.values.length === b.values.length &&
      a.values.every((val, idx) => val !== null && val === b.values[idx])
    );
  }
  return false;
}

function exprBlankCount(expr: SimpleExpr): number {
  if (expr.kind === "chain") {
    return Math.max(1, expr.terms.filter((t) => t === null).length);
  }
  return 1;
}

function splitPartFileAnswers(expr: SimpleExpr, rawAnswer: string): string[] {
  if (expr.kind === "chain") {
    return rawAnswer
      .split(/[;,]/)
      .map((s) => normalizeAnswerForCompare(s))
      .filter(Boolean);
  }
  const norm = normalizeAnswerForCompare(rawAnswer);
  return norm ? [norm] : [];
}

function splitLinkedRowAnswer(rawAnswer: string, leftExpr: SimpleExpr): [string, string] {
  const semiIdx = rawAnswer.indexOf(";");
  if (semiIdx >= 0) {
    return [rawAnswer.slice(0, semiIdx).trim(), rawAnswer.slice(semiIdx + 1).trim()];
  }
  const commaParts = rawAnswer
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const leftSlots = exprBlankCount(leftExpr);
  return [commaParts.slice(0, leftSlots).join(", "), commaParts.slice(leftSlots).join(", ")];
}

function buildLinkedPartResponses(
  partExpr: SimpleExpr,
  rawAnswer: string,
  pos: ReaderValue<ResponsePosition>,
  diffMeta: {
    sourceRef: string;
    itemRef: string;
    printed: string;
    answerDiffs: AnswerDiff[];
  },
): { responses: ItemResponse[]; computed: boolean } {
  const partComputed = computeExprAnswer(partExpr);
  const fileSlots = splitPartFileAnswers(partExpr, rawAnswer);
  const responses: ItemResponse[] = [];

  if (partComputed && partComputed.kind === "single") {
    const fileNorm = fileSlots[0] ?? "";
    if (fileNorm !== partComputed.value) {
      diffMeta.answerDiffs.push({
        sourceRef: diffMeta.sourceRef,
        itemRef: diffMeta.itemRef,
        printed: diffMeta.printed,
        fileAnswer: rawAnswer.trim(),
        computedAnswer: partComputed.value,
      });
    }
    responses.push({
      position: pos,
      cue: NOT_STATED,
      answer: partComputed.value,
      answer_source: "computed",
    });
    return { responses, computed: true };
  }

  if (partComputed && partComputed.kind === "multi") {
    const anyComputed = partComputed.values.some((v) => v !== null);
    const hasMismatch = partComputed.values.some(
      (val, idx) => val !== null && fileSlots[idx] !== val,
    );
    const allKnown = partComputed.values.every((v) => v !== null);
    if (anyComputed && (hasMismatch || (allKnown && fileSlots.length !== partComputed.values.length))) {
      diffMeta.answerDiffs.push({
        sourceRef: diffMeta.sourceRef,
        itemRef: diffMeta.itemRef,
        printed: diffMeta.printed,
        fileAnswer: rawAnswer.trim(),
        computedAnswer: partComputed.values.map((v) => v ?? "?").join(", "),
      });
    }
    partComputed.values.forEach((val, idx) => {
      if (val !== null) {
        responses.push({
          position: pos,
          cue: NOT_STATED,
          answer: val,
          answer_source: "computed",
        });
      } else {
        responses.push({
          position: pos,
          cue: NOT_STATED,
          answer: fileSlots[idx] ?? null,
          answer_source: "unchecked",
        });
      }
    });
    return { responses, computed: anyComputed };
  }

  const slotCount = exprBlankCount(partExpr);
  for (let i = 0; i < slotCount; i += 1) {
    responses.push({
      position: pos,
      cue: NOT_STATED,
      answer: fileSlots[i] ?? null,
      answer_source: "unchecked",
    });
  }
  return { responses, computed: false };
}

export function canPairRowsInSection(rows: ParsedRowEntry[], layoutInfo: LayoutInfo): boolean {
  if (!layoutInfo.hasPairedBlocks) return false;
  if (rows.length < 2 || rows.length % 2 !== 0) return false;
  if (!rows.every((entry) => entry.parsed.expr !== null && entry.parsed.expr.kind !== "linked")) {
    return false;
  }
  for (let i = 0; i < rows.length; i += 2) {
    const leftAns = computeExprAnswer(rows[i].parsed.expr);
    const rightAns = computeExprAnswer(rows[i + 1].parsed.expr);
    if (!computedAnswersMatch(leftAns, rightAns)) {
      return false;
    }
  }
  return true;
}

export function buildPairedSectionItems(
  parsedRows: ParsedRowEntry[],
  ctx: SectionBuildContext,
): { items: PageItem[]; rawToFinalN: Map<number, number>; counts: SectionBuildCounts } {
  const items: PageItem[] = [];
  const rawToFinalN = new Map<number, number>();
  let computedItems = 0;
  let uncheckedItems = 0;

  for (let pairIdx = 0; pairIdx < parsedRows.length; pairIdx += 2) {
    const first = parsedRows[pairIdx];
    const second = parsedRows[pairIdx + 1];
    const itemN = pairIdx / 2 + 1;
    rawToFinalN.set(first.row.n, itemN);
    rawToFinalN.set(second.row.n, itemN);

    const formA = ctx.layoutInfo.itemForms.get(first.row.n) ?? ctx.layoutInfo.defaultForm;
    const formB = ctx.layoutInfo.itemForms.get(second.row.n) ?? ctx.layoutInfo.defaultForm;
    const form: ReaderValue<ItemForm> = formA === formB ? formA : NOT_STATED;
    const posA = ctx.layoutInfo.itemPositions.get(first.row.n) ?? ctx.layoutInfo.defaultPosition;
    const posB = ctx.layoutInfo.itemPositions.get(second.row.n) ?? ctx.layoutInfo.defaultPosition;

    const hasArrow =
      scaffoldAppliesToItem(ctx.parsedScaffolds, "arrow", first.row.n) ||
      scaffoldAppliesToItem(ctx.parsedScaffolds, "arrow", second.row.n);
    const linkedExpr: LinkedExpr = {
      kind: "linked",
      pair: [first.parsed.expr as SimpleExpr, second.parsed.expr as SimpleExpr],
      connector: hasArrow ? "arrow" : NOT_STATED,
    };
    const printed = hasArrow
      ? `${first.parsed.printed} → ${second.parsed.printed}`
      : `${first.parsed.printed} / ${second.parsed.printed}`;

    const diffMeta = {
      sourceRef: ctx.sourceRef,
      itemRef: `${ctx.sectionIndex + 1}.${itemN}`,
      printed,
      answerDiffs: ctx.answerDiffs,
    };
    const leftRes = buildLinkedPartResponses(linkedExpr.pair[0], first.row.answer, posA, diffMeta);
    const rightRes = buildLinkedPartResponses(
      linkedExpr.pair[1],
      second.row.answer,
      posB,
      diffMeta,
    );
    const responses = [...leftRes.responses, ...rightRes.responses];
    if (leftRes.computed || rightRes.computed) {
      computedItems += 1;
    } else {
      uncheckedItems += 1;
    }

    items.push({ n: itemN, printed, form, expr: linkedExpr, responses });
  }

  return { items, rawToFinalN, counts: { computedItems, uncheckedItems } };
}

export function buildSingleSectionItems(
  parsedRows: ParsedRowEntry[],
  ctx: SectionBuildContext,
): { items: PageItem[]; counts: SectionBuildCounts } {
  const items: PageItem[] = [];
  let computedItems = 0;
  let uncheckedItems = 0;

  for (const { row, parsed: parsedQ } of parsedRows) {
    let expr = parsedQ.expr;
    let printed = parsedQ.printed;
    if (expr?.kind === "linked") {
      const hasArrow = scaffoldAppliesToItem(ctx.parsedScaffolds, "arrow", row.n);
      expr = { ...expr, connector: hasArrow ? "arrow" : NOT_STATED };
      if (!hasArrow && parsedQ.linkedPartsPrinted) {
        printed = `${parsedQ.linkedPartsPrinted[0]} / ${parsedQ.linkedPartsPrinted[1]}`;
      }
    }

    const computed = expr?.kind === "linked" ? null : computeExprAnswer(expr);
    const form: ReaderValue<ItemForm> =
      ctx.layoutInfo.itemForms.get(row.n) ?? ctx.layoutInfo.defaultForm;
    const defaultPos: ReaderValue<ResponsePosition> =
      ctx.layoutInfo.itemPositions.get(row.n) ?? ctx.layoutInfo.defaultPosition;

    const responses: ItemResponse[] = [];
    let itemComputed = false;

    if (expr?.kind === "linked") {
      const [leftRaw, rightRaw] = splitLinkedRowAnswer(row.answer, expr.pair[0]);
      const diffMeta = {
        sourceRef: ctx.sourceRef,
        itemRef: `${ctx.sectionIndex + 1}.${row.n}`,
        printed,
        answerDiffs: ctx.answerDiffs,
      };
      const leftRes = buildLinkedPartResponses(expr.pair[0], leftRaw, defaultPos, diffMeta);
      const rightRes = buildLinkedPartResponses(expr.pair[1], rightRaw, defaultPos, diffMeta);
      responses.push(...leftRes.responses, ...rightRes.responses);
      itemComputed = leftRes.computed || rightRes.computed;
    } else if (expr?.kind === "word") {
      if (parsedQ.wordEquationFrame) {
        ctx.extraScaffolds.push({
          kind: "equation_frame",
          applies_to: [row.n],
          template: parsedQ.wordEquationFrame,
        });
        const framePos: ReaderValue<ResponsePosition> = parsedQ.hasBoxBlank ? "box" : defaultPos;
        responses.push({
          position: framePos,
          cue: NOT_STATED,
          answer: computed && computed.kind === "single" ? computed.value : null,
          answer_source: computed && computed.kind === "single" ? "computed" : "unchecked",
        });
      } else if (parsedQ.wordShowWorkCue || ctx.layoutInfo.hasWordWorkArea) {
        responses.push({
          position: "work_area",
          cue: parsedQ.wordShowWorkCue ?? NOT_STATED,
          answer: null,
          answer_source: "unchecked",
        });
      }

      const unit = parsedQ.wordUnit ?? expr.unit ?? NOT_STATED;
      const unitStr = typeof unit === "string" && unit !== NOT_STATED ? unit : undefined;
      const fileNorm = normalizeAnswerForCompare(row.answer, unitStr);
      const finalPos: ReaderValue<ResponsePosition> =
        ctx.layoutInfo.defaultPosition === "line_with_unit" || parsedQ.wordHasAnsLine
          ? "line_with_unit"
          : defaultPos;
      const unitField = finalPos === "line_with_unit" ? { unit } : {};

      if (computed && computed.kind === "single") {
        itemComputed = true;
        if (fileNorm !== computed.value) {
          ctx.answerDiffs.push({
            sourceRef: ctx.sourceRef,
            itemRef: `${ctx.sectionIndex + 1}.${row.n}`,
            printed: parsedQ.printed,
            fileAnswer: row.answer,
            computedAnswer: computed.value,
          });
        }
        responses.push({
          position: finalPos,
          cue: NOT_STATED,
          ...unitField,
          answer: computed.value,
          answer_source: "computed",
        });
      } else {
        responses.push({
          position: finalPos,
          cue: NOT_STATED,
          ...unitField,
          answer: fileNorm || row.answer,
          answer_source: "unchecked",
        });
      }
    } else if (computed && computed.kind === "multi") {
      const fileParts = row.answer
        .split(/[;,]/)
        .map((s) => normalizeAnswerForCompare(s))
        .filter(Boolean);
      const allKnown = computed.values.every((v): v is string => v !== null);
      if (allKnown) {
        itemComputed = true;
        if (fileParts.join(",") !== computed.values.join(",")) {
          ctx.answerDiffs.push({
            sourceRef: ctx.sourceRef,
            itemRef: `${ctx.sectionIndex + 1}.${row.n}`,
            printed: parsedQ.printed,
            fileAnswer: row.answer,
            computedAnswer: computed.values.join(" ; "),
          });
        }
      } else if (computed.values.some((v) => v !== null)) {
        itemComputed = true;
        if (fileParts.length === computed.values.length) {
          const mismatch = computed.values.some((v, idx) => v !== null && fileParts[idx] !== v);
          if (mismatch) {
            ctx.answerDiffs.push({
              sourceRef: ctx.sourceRef,
              itemRef: `${ctx.sectionIndex + 1}.${row.n}`,
              printed: parsedQ.printed,
              fileAnswer: row.answer,
              computedAnswer: computed.values.map((v) => v ?? "?").join(" ; "),
            });
          }
        }
      }
      computed.values.forEach((val, idx) => {
        if (val !== null) {
          responses.push({
            position: defaultPos,
            cue: NOT_STATED,
            answer: val,
            answer_source: "computed",
          });
        } else {
          responses.push({
            position: defaultPos,
            cue: NOT_STATED,
            answer: fileParts[idx] ?? null,
            answer_source: "unchecked",
          });
        }
      });
    } else if (computed && computed.kind === "single") {
      itemComputed = true;
      const fileNorm = normalizeAnswerForCompare(row.answer);
      if (fileNorm !== computed.value) {
        ctx.answerDiffs.push({
          sourceRef: ctx.sourceRef,
          itemRef: `${ctx.sectionIndex + 1}.${row.n}`,
          printed: parsedQ.printed,
          fileAnswer: row.answer,
          computedAnswer: computed.value,
        });
      }

      const boxCfg = ctx.layoutInfo.answerBoxes;
      if (
        boxCfg &&
        boxCfg.appliesTo.includes(row.n) &&
        /^\d+$/.test(computed.value) &&
        computed.value.length === boxCfg.boxCount
      ) {
        for (let d = 0; d < boxCfg.boxCount; d += 1) {
          responses.push({
            position: "box",
            ...(boxCfg.places[d] ? { place: boxCfg.places[d] } : {}),
            cue: NOT_STATED,
            answer: computed.value[d],
            answer_source: "computed",
          });
        }
      } else {
        responses.push({
          position: defaultPos,
          cue: NOT_STATED,
          answer: computed.value,
          answer_source: "computed",
        });
      }
    } else {
      responses.push({
        position: defaultPos,
        cue: NOT_STATED,
        answer: row.answer || null,
        answer_source: "unchecked",
      });
    }

    if (itemComputed) computedItems += 1;
    else uncheckedItems += 1;

    items.push({
      n: row.n,
      printed,
      form,
      expr,
      responses,
    });
  }

  return { items, counts: { computedItems, uncheckedItems } };
}
