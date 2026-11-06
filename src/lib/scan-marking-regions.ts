// Supported scanned regions come only from the frozen package and printed boxes.
// This module does not change the print or infer an answer from page text.
import { checkQuestionPackage, packageItem, type QuestionPackage } from "@/lib/question-package";
import type { Box, PrintedRegion } from "@/lib/workbook-print-contract";

export interface RegionQuestion {
  package: QuestionPackage | null;
  regions: readonly PrintedRegion[] | null;
}
export type MarkingRegion = { id: string; box: Box } & (
  | { kind: "number"; answer: number; wholeOnly: boolean }
  | { kind: "choice"; answer: string; choices: string[]; mark: "tick" | "circle" }
);
const usableBox = (box: Box | null): box is Box => box !== null &&
  [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0;

/** Empty means unsupported or unmeasured. Never dispatch only part of an item. */
export function markingRegions(q: RegionQuestion): MarkingRegion[] {
  if (!q.package || !q.regions || (!q.package.item && !q.package.answer)) return [];
  const item = packageItem(q.package);
  if (!item.scorable || item.parentChecked) return [];
  const legacy = item.format === "write-number" && item.regions.length === 1;
  if (!legacy && (!["tick-and-number", "circle", "show-work", "spot-the-error"].includes(item.format) || !checkQuestionPackage(q.package).ok)) return [];
  // Equation regions can accept many linked combinations. Independent key
  // comparison cannot judge them; they stay pending for their own checker.
  if (!legacy && item.checks.some(c => c.kind === "equations")) return [];
  const scored = item.regions.filter(r => r.kind === "box" || r.kind === "choice");
  const out: MarkingRegion[] = [];
  for (const r of scored) {
    const printed = q.regions.filter(p => p.id === r.id);
    if (printed.length !== 1 || printed[0].kind !== r.kind || !usableBox(printed[0].box)) return [];
    const base = { id: r.id, box: printed[0].box };
    if (r.kind === "box") {
      if (r.answer?.type !== "number" || !Number.isFinite(r.answer.value) || Math.abs(r.answer.value) > Number.MAX_SAFE_INTEGER ||
          (legacy && (!Number.isSafeInteger(r.answer.value) || r.answer.value < 0))) return [];
      out.push({ ...base, kind: "number", answer: r.answer.value, wholeOnly: legacy });
    } else {
      if (r.answer === null || !r.choices.includes(r.answer)) return [];
      out.push({ ...base, kind: "choice", answer: r.answer, choices: [...r.choices], mark: r.mark });
    }
  }
  return out;
}
