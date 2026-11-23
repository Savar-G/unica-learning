import {
  buildPageOrderingPattern,
  resolveChainStep,
  type PageOrderingPattern,
  type SectionOrderingKind,
  type SectionOrderingPattern,
} from "./compute-ordering";
import {
  NOT_STATED,
  UNCLEAR,
  type ArithExpr,
  type ArithOp,
  type ChainExpr,
  type Expr,
  type MissingExpr,
  type PageItem,
  type PageRecord,
  type SimpleExpr,
} from "./types";

export type { PageOrderingPattern, SectionOrderingKind, SectionOrderingPattern };

export interface ComputedSingleAnswer {
  kind: "single";
  value: string;
  quotient?: number;
  remainder?: number;
}

export interface ComputedMultiAnswer {
  kind: "multi";
  values: Array<string | null>;
}

export type ComputedAnswer = ComputedSingleAnswer | ComputedMultiAnswer;

export type CarryKind =
  | "ones_to_tens"
  | "tens_to_hundreds"
  | "hundreds_to_thousands"
  | "higher_place_carry";

export type BorrowKind =
  | "tens_to_ones"
  | "hundreds_to_tens"
  | "thousands_to_hundreds"
  | "higher_place_borrow"
  | "borrow_across_zero";

export interface ArithFeatures {
  op: ArithOp;
  operand_count: number;
  operand_digits: number[];
  carries: CarryKind[];
  borrows: BorrowKind[];
  has_carry: boolean;
  has_borrow: boolean;
  has_remainder: boolean;
  has_zero_operand: boolean;
  has_one_operand: boolean;
  repeated_operands: boolean;
}

export interface ChainFeatures {
  length: number;
  blank_count: number;
  step: number | null;
}

export interface ItemFeatures {
  expr_kind: Expr["kind"] | null;
  arith?: ArithFeatures;
  linked_parts?: [ItemFeatures, ItemFeatures];
  chain?: ChainFeatures;
}

function isConcreteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isConcreteOp(v: unknown): v is ArithOp {
  return v === "add" || v === "sub" || v === "mul" || v === "div";
}

function computeArith(expr: ArithExpr): ComputedSingleAnswer | null {
  if (!isConcreteOp(expr.op)) return null;
  if (expr.operands.length < 2) return null;
  const nums: number[] = [];
  for (const opVal of expr.operands) {
    if (!isConcreteNumber(opVal)) return null;
    nums.push(opVal);
  }
  // Only whole numbers are computed. A decimal operand would give an inexact binary result,
  // so the answer stays a reader value.
  if (nums.some((n) => !Number.isSafeInteger(n))) return null;
  switch (expr.op) {
    case "add":
      return { kind: "single", value: String(nums.reduce((a, b) => a + b, 0)) };
    case "sub":
      return { kind: "single", value: String(nums.slice(1).reduce((a, b) => a - b, nums[0])) };
    case "mul":
      return { kind: "single", value: String(nums.reduce((a, b) => a * b, 1)) };
    case "div": {
      if (nums.length !== 2) return null;
      const [dividend, divisor] = nums;
      if (divisor === 0) return null;
      if (!Number.isInteger(dividend) || !Number.isInteger(divisor)) return null;
      if (dividend < 0 || divisor < 0) return null;
      const quotient = Math.floor(dividend / divisor);
      const remainder = dividend - quotient * divisor;
      return {
        kind: "single",
        value: remainder === 0 ? String(quotient) : `${quotient} R${remainder}`,
        quotient,
        remainder,
      };
    }
  }
}

function computeChain(expr: ChainExpr): ComputedMultiAnswer | null {
  const resolved = resolveChainStep(expr);
  if (!resolved) return null;
  const values: string[] = [];
  for (let i = 0; i < expr.terms.length; i += 1) {
    if (expr.terms[i] === null) {
      values.push(String(resolved.anchorVal + (i - resolved.anchorIdx) * resolved.step));
    }
  }
  return values.length > 0 ? { kind: "multi", values } : null;
}

function solveMissing(
  expr: MissingExpr,
): { answer: ComputedSingleAnswer; filled: ArithExpr } | null {
  if (!isConcreteOp(expr.op)) return null;
  const opBlanks: number[] = [];
  for (let i = 0; i < expr.operands.length; i += 1) {
    const v = expr.operands[i];
    if (v === null) opBlanks.push(i);
    else if (!isConcreteNumber(v)) return null;
  }
  const resultBlank = expr.result === null;
  if (!resultBlank && !isConcreteNumber(expr.result)) return null;
  if (opBlanks.length + (resultBlank ? 1 : 0) !== 1) return null;

  if (resultBlank) {
    const concreteOps = expr.operands as number[];
    const ans = computeArith({ kind: "arith", op: expr.op, operands: concreteOps });
    if (!ans) return null;
    return { answer: ans, filled: { kind: "arith", op: expr.op, operands: concreteOps } };
  }

  const blankIdx = opBlanks[0];
  const target = expr.result as number;
  const others = expr.operands
    .map((v, i) => (i === blankIdx ? null : (v as number)))
    .filter((v): v is number => v !== null);

  let solved: number | null = null;
  switch (expr.op) {
    case "add":
      solved = target - others.reduce((a, b) => a + b, 0);
      break;
    case "sub":
      if (blankIdx === 0) {
        solved = target + others.reduce((a, b) => a + b, 0);
      } else {
        const first = expr.operands[0] as number;
        const otherSubtrahends = expr.operands
          .slice(1)
          .filter((v, idx): v is number => idx + 1 !== blankIdx && isConcreteNumber(v))
          .reduce((a, b) => a + b, 0);
        solved = first - otherSubtrahends - target;
      }
      break;
    case "mul": {
      const prod = others.reduce((a, b) => a * b, 1);
      if (prod === 0 || target % prod !== 0) return null;
      solved = target / prod;
      break;
    }
    case "div": {
      if (expr.operands.length !== 2) return null;
      if (blankIdx === 0) {
        const divisor = expr.operands[1] as number;
        if (divisor <= 0 || target < 0) return null;
        solved = target * divisor;
      } else {
        const dividend = expr.operands[0] as number;
        if (target <= 0 || dividend <= 0 || dividend % target !== 0) return null;
        solved = dividend / target;
      }
      break;
    }
  }
  if (solved === null || !Number.isFinite(solved)) return null;
  if (Object.is(solved, -0)) solved = 0;
  const filledOps = expr.operands.map((v, i) => (i === blankIdx ? solved : (v as number)));
  const filled: ArithExpr = { kind: "arith", op: expr.op, operands: filledOps };
  const verified = computeArith(filled);
  if (!verified || verified.value !== String(target)) return null;
  if (expr.op === "div" && (verified.remainder !== 0 || verified.quotient !== target)) return null;
  return {
    answer: { kind: "single", value: String(solved) },
    filled,
  };
}

function responseSlotCount(expr: SimpleExpr): number {
  if (expr.kind === "chain") {
    return Math.max(1, expr.terms.filter((t) => t === null).length);
  }
  return 1;
}

export function computeExprAnswer(expr: Expr | null): ComputedAnswer | null {
  if (expr === null) return null;
  switch (expr.kind) {
    case "arith":
      return computeArith(expr);
    case "chain":
      return computeChain(expr);
    case "missing":
      return solveMissing(expr)?.answer ?? null;
    case "linked": {
      const left = computeExprAnswer(expr.pair[0]);
      const right = computeExprAnswer(expr.pair[1]);
      if (!left && !right) return null;
      const leftValues: Array<string | null> = left
        ? left.kind === "single"
          ? [left.value]
          : left.values
        : Array<null>(responseSlotCount(expr.pair[0])).fill(null);
      const rightValues: Array<string | null> = right
        ? right.kind === "single"
          ? [right.value]
          : right.values
        : Array<null>(responseSlotCount(expr.pair[1])).fill(null);
      return { kind: "multi", values: [...leftValues, ...rightValues] };
    }
    case "word": {
      if (expr.expr === null || expr.expr === UNCLEAR || expr.expr === NOT_STATED) return null;
      const inner = computeExprAnswer(expr.expr);
      // A word problem with a division that is not exact may want "2.5" or "2 R1"; code cannot
      // know which, so the reader answer stays.
      if (inner?.kind === "single" && (inner.remainder ?? 0) > 0) return null;
      return inner;
    }
    case "notation":
      return null;
  }
}

function digitCount(n: number): number {
  return String(Math.abs(Math.trunc(n))).length;
}

function digitAt(n: number, place: number): number {
  return Math.floor(Math.abs(Math.trunc(n)) / 10 ** place) % 10;
}

function carryForPlace(place: number): CarryKind {
  if (place === 0) return "ones_to_tens";
  if (place === 1) return "tens_to_hundreds";
  if (place === 2) return "hundreds_to_thousands";
  return "higher_place_carry";
}

function borrowForPlace(place: number): BorrowKind {
  if (place === 0) return "tens_to_ones";
  if (place === 1) return "hundreds_to_tens";
  if (place === 2) return "thousands_to_hundreds";
  return "higher_place_borrow";
}

function computeAdditionCarries(operands: number[]): CarryKind[] {
  if (operands.some((n) => !Number.isInteger(n) || n < 0)) return [];
  const maxPlaces = Math.max(...operands.map(digitCount));
  const carries = new Set<CarryKind>();
  let carry = 0;
  for (let p = 0; p < maxPlaces; p += 1) {
    let col = carry;
    for (const n of operands) col += digitAt(n, p);
    carry = Math.floor(col / 10);
    if (carry > 0) carries.add(carryForPlace(p));
  }
  return [...carries];
}

function computeSubtractionBorrows(a: number, b: number): BorrowKind[] {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a < b) return [];
  const places = Math.max(digitCount(a), digitCount(b));
  const borrows = new Set<BorrowKind>();
  let borrowIn = 0;
  for (let p = 0; p < places; p += 1) {
    const da = digitAt(a, p) - borrowIn;
    const db = digitAt(b, p);
    if (da < db) {
      borrows.add(borrowForPlace(p));
      if (p + 1 < places && digitAt(a, p + 1) === 0) {
        borrows.add("borrow_across_zero");
      }
      borrowIn = 1;
    } else {
      borrowIn = 0;
    }
  }
  return [...borrows];
}

// Borrows of a subtraction taken one step at a time from the left: 302 - 4 - 1 is 302 - 4, then 298 - 1.
function computeSubtractionChainBorrows(operands: number[]): BorrowKind[] {
  if (operands.length < 2) return [];
  const borrows = new Set<BorrowKind>();
  let acc = operands[0];
  for (let i = 1; i < operands.length; i += 1) {
    for (const b of computeSubtractionBorrows(acc, operands[i])) borrows.add(b);
    acc -= operands[i];
  }
  return [...borrows];
}

function computeBinaryMultiplicationCarries(rawA: number, rawB: number): CarryKind[] {
  if (!Number.isInteger(rawA) || !Number.isInteger(rawB) || rawA < 0 || rawB < 0) return [];
  const [multiplicand, multiplier] =
    rawB < 10 ? [rawA, rawB] : rawA < 10 ? [rawB, rawA] : [rawA, rawB];

  const carries = new Set<CarryKind>();
  const mDigits = digitCount(multiplier);
  const aDigits = digitCount(multiplicand);
  const partials: number[] = [];

  for (let mp = 0; mp < mDigits; mp += 1) {
    const md = digitAt(multiplier, mp);
    let carry = 0;
    for (let ap = 0; ap < aDigits; ap += 1) {
      const prod = digitAt(multiplicand, ap) * md + carry;
      carry = Math.floor(prod / 10);
      if (carry > 0) carries.add(carryForPlace(ap + mp));
    }
    partials.push(multiplicand * md * 10 ** mp);
  }
  if (partials.length > 1) {
    for (const c of computeAdditionCarries(partials)) carries.add(c);
  }
  return [...carries];
}

function computeMultiplicationCarries(operands: number[]): CarryKind[] {
  if (operands.length < 2) return [];
  if (operands.some((n) => !Number.isInteger(n) || n < 0)) return [];
  const carries = new Set<CarryKind>();
  let acc = operands[0];
  for (let i = 1; i < operands.length; i += 1) {
    const factor = operands[i];
    for (const c of computeBinaryMultiplicationCarries(acc, factor)) {
      carries.add(c);
    }
    acc *= factor;
  }
  return [...carries];
}

function computeArithFeatures(expr: ArithExpr): ArithFeatures | undefined {
  if (!isConcreteOp(expr.op)) return undefined;
  if (!expr.operands.every(isConcreteNumber)) return undefined;
  const nums = expr.operands as number[];
  const carries =
    expr.op === "add"
      ? computeAdditionCarries(nums)
      : expr.op === "mul"
        ? computeMultiplicationCarries(nums)
        : [];
  const borrows = expr.op === "sub" ? computeSubtractionChainBorrows(nums) : [];
  const has_remainder =
    expr.op === "div" && nums.length === 2 && nums[1] !== 0 && nums[0] % nums[1] !== 0;

  return {
    op: expr.op,
    operand_count: nums.length,
    operand_digits: nums.map(digitCount),
    carries,
    borrows,
    has_carry: carries.length > 0,
    has_borrow: borrows.length > 0,
    has_remainder,
    has_zero_operand: nums.some((n) => n === 0),
    has_one_operand: nums.some((n) => n === 1),
    repeated_operands: nums.length >= 2 && nums.every((n) => n === nums[0]),
  };
}

export function computeExprFeatures(expr: Expr | null): ItemFeatures {
  if (expr === null) return { expr_kind: null };
  switch (expr.kind) {
    case "arith":
      return { expr_kind: "arith", arith: computeArithFeatures(expr) };
    case "missing": {
      const solved = solveMissing(expr);
      return {
        expr_kind: "missing",
        arith: solved ? computeArithFeatures(solved.filled) : undefined,
      };
    }
    case "linked":
      return {
        expr_kind: "linked",
        linked_parts: [computeExprFeatures(expr.pair[0]), computeExprFeatures(expr.pair[1])],
      };
    case "word":
      if (expr.expr && expr.expr !== UNCLEAR && expr.expr !== NOT_STATED) {
        const inner = computeExprFeatures(expr.expr);
        return { expr_kind: "word", arith: inner.arith };
      }
      return { expr_kind: "word" };
    case "chain": {
      const resolved = resolveChainStep(expr);
      return {
        expr_kind: "chain",
        chain: {
          length: expr.terms.length,
          blank_count: expr.terms.filter((t) => t === null).length,
          step: resolved ? resolved.step : null,
        },
      };
    }
    case "notation":
      return { expr_kind: "notation" };
  }
}

export function computeItemFeatures(item: PageItem): ItemFeatures {
  return computeExprFeatures(item.expr);
}

export function computePageOrderingPattern(page: PageRecord): PageOrderingPattern {
  return buildPageOrderingPattern(page, (expr) => {
    const solved = solveMissing(expr);
    if (!solved) return null;
    const ops = solved.filled.operands;
    return ops.every(isConcreteNumber) ? (ops as number[]) : null;
  });
}
