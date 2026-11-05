import { likelihoodWord } from "@/lib/workbook-likelihood";
import type { WatchOutPair } from "./types";

/** Same printable text limits as the teaching panel in workbook-book.ts, plus D-230. */
export function watchOutProblems(pair: WatchOutPair): string[] {
  const problems: string[] = [];
  for (const field of ["wrong", "fix"] as const) {
    const text = pair[field];
    if (!text.trim() || text.length > 160 || /\(picture:|\b(?:shade|shaded|colou?r|draw|trace|dots?|counters?|ten-frame|picture|chart|graph|bars?)\b/i.test(text) || likelihoodWord(text)) {
      problems.push(`${field} is not printable`);
    }
    const numbers = text.match(/(?<![\w.])\d[\d,]*(?:[ \u00a0\u202f]\d{3})*(?:\.\d+)?/g) ?? [];
    if (numbers.some(number => {
      const whole = number.split(".")[0];
      return Number(whole.replace(/[, \u00a0\u202f]/g, "")) >= 1000 && !/^\d{1,3}(?:,\d{3})+$/.test(whole);
    })) problems.push(`${field} needs commas for thousands`);
  }
  if (`${pair.wrong} ${pair.fix}`.length > 150) problems.push("pair exceeds 150 characters");
  return problems;
}
