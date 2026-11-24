import {
  computeExprAnswer,
  computeExprFeatures,
  ITEM_FORMS,
  type Expr,
  type ItemForm,
} from "@/lib/reference-record";
import { holdsSentinel } from "./trusted";
import type { StepFeatures } from "./types";

// The step of one expression, or null when code cannot tell it. The features come from the compute
// helpers, which count digits, carries and borrows for whole numbers only. Any other number gives null.
export function stepOf(expr: unknown, form: unknown): StepFeatures | null {
  if (!(ITEM_FORMS as readonly unknown[]).includes(form)) return null;
  if (typeof expr !== "object" || expr === null || holdsSentinel(expr)) return null;
  return stepOfKnown(expr as Expr, form as ItemForm);
}

function stepOfKnown(expr: Expr, form: ItemForm): StepFeatures | null {
  switch (expr.kind) {
    case "notation":
      return null;
    case "word": {
      if (typeof expr.expr !== "object" || expr.expr === null) return null;
      const inner = stepOfKnown(expr.expr, form);
      return inner && { ...inner, expr_kind: "word" };
    }
    case "linked": {
      const [left, right] = expr.pair.map((part) => stepOfKnown(part, form));
      return left && right ? { expr_kind: "linked", form, parts: [left, right] } : null;
    }
    case "chain": {
      const step = computeExprFeatures(expr).chain?.step;
      return typeof step === "number" ? { expr_kind: "chain", form, chain_step: step } : null;
    }
    case "arith":
    case "missing":
      return arithStep(expr, form);
  }
}

function arithStep(expr: Extract<Expr, { kind: "arith" | "missing" }>, form: ItemForm): StepFeatures | null {
  const printed = [...expr.operands, ...(expr.kind === "missing" ? [expr.result] : [])];
  if (!printed.every((v) => v === null || isCountable(v))) return null;
  const answer = computeExprAnswer(expr);
  if (answer?.kind !== "single") return null;
  if (answer.remainder === undefined && !isCountable(Number(answer.value))) return null;
  const features = computeExprFeatures(expr).arith;
  if (!features) return null;
  return {
    expr_kind: expr.kind,
    form,
    operation: features.op,
    operand_digits: features.operand_digits,
    ...(features.op === "add" || features.op === "mul" ? { carries: [...features.carries].sort() } : {}),
    ...(features.op === "sub" ? { borrows: [...features.borrows].sort() } : {}),
    ...(features.op === "div" ? { remainder: features.has_remainder } : {}),
  };
}

function isCountable(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function stepId(step: StepFeatures): string {
  if (step.parts) return `linked ${step.form} [${step.parts.map(stepId).join(" | ")}]`;
  if (step.chain_step !== undefined) return `${step.expr_kind} step ${step.chain_step} ${step.form}`;
  const tags = [
    step.carries?.length ? ` carries=${step.carries.join("+")}` : "",
    step.borrows?.length ? ` borrows=${step.borrows.join("+")}` : "",
    step.remainder === undefined ? "" : ` remainder=${step.remainder ? "yes" : "no"}`,
  ];
  return `${step.expr_kind} ${step.operation} ${step.operand_digits?.join("x")} ${step.form}${tags.join("")}`;
}

// The step of the questions of one page that code cannot tell. It is never shared between pages.
export function unknownStepId(pageRef: string): string {
  return `page ${pageRef}`;
}
