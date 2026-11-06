// Supported scanned regions come only from the frozen package and printed boxes.
// This module does not change the print or infer an answer from page text.
import { checkQuestionPackage, packageItem, type QuestionPackage } from "@/lib/question-package";
import type { Box, PrintedRegion } from "@/lib/workbook-print-contract";
import { MAX_READ_TEXT, needsMethodReview } from "@/lib/scan-observation";

export interface RegionQuestion {
  package: QuestionPackage | null;
  regions: readonly PrintedRegion[] | null;
}
export type MarkingRegion = { id: string; box: Box } & (
  | { kind: "number"; answer: number; wholeOnly: boolean }
  | { kind: "text"; answer: string }
  | { kind: "choice"; answer: string; choices: string[]; mark: "tick" | "circle" }
);
const usableBox = (box: Box | null): box is Box => box !== null &&
  [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0;

/** Review includes both methods. These regions never enter recognition. */
export function reviewRegions(q: RegionQuestion): { id: string; box: Box }[] {
  if (!needsMethodReview(q.package)) return markingRegions(q);
  if (!q.regions || !checkQuestionPackage(q.package).ok) return [];
  const regions: { id: string; box: Box }[] = [];
  for (const r of packageItem(q.package!).regions) {
    if (r.kind !== "work" && r.kind !== "box") continue;
    const printed = q.regions.filter(p => p.id === r.id);
    if (printed.length !== 1 || printed[0].kind !== r.kind || !usableBox(printed[0].box)) return [];
    regions.push({ id: r.id, box: printed[0].box });
  }
  return regions;
}

/** Empty means unsupported or unmeasured. Never dispatch only part of an item. */
export function markingRegions(q: RegionQuestion): MarkingRegion[] {
  if (!q.package || !q.regions || (!q.package.item && !q.package.answer)) return [];
  const item = packageItem(q.package);
  if (!item.scorable || item.parentChecked) return [];
  const legacy = item.format === "write-number" && item.regions.length === 1;
  if (!legacy && (!["tick-and-number", "circle", "show-work", "spot-the-error", "write-words"].includes(item.format) || !checkQuestionPackage(q.package).ok)) return [];
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
      if (item.format === "write-words") {
        if (r.answer?.type !== "text" || !r.answer.value.trim() || r.answer.value.length > MAX_READ_TEXT) return [];
        out.push({ ...base, kind: "text", answer: r.answer.value });
        continue;
      }
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
