import { packageItem, type QuestionPackage } from "@/lib/question-package";
import type { PageContent } from "@/lib/workbook-page";
import { questionWorkSpace } from "@/lib/workbook-work-space";

export interface InstructionQuestion { number: number; package: QuestionPackage | null; place?: string | null }
interface InstructionPage { content?: PageContent; questions: readonly InstructionQuestion[] }

/** Name the response targets that actually print, without calling boxed answers circled answers. */
export function answerInstruction(questions: readonly Pick<InstructionQuestion, "package">[]): string {
  const regions = questions.flatMap(q => q.package ? packageItem(q.package).regions : []);
  const box = regions.some(r => r.kind === "box"), lines = regions.some(r => r.kind === "lines");
  const circle = regions.some(r => r.kind === "choice" && r.mark === "circle");
  const tick = regions.some(r => r.kind === "choice" && r.mark === "tick");
  return [box ? lines ? "Write in the answer spaces." : "Write in boxes." : lines ? "Write on the lines." : null,
    circle && tick ? "Circle or tick one choice." : circle ? "Circle one choice." : tick ? "Tick one choice." : null]
    .filter(Boolean).join(" ") || "Read each question.";
}

/** Only questions with an allocated calculation or method region require written work. */
export function workQuestionNumbers(page: InstructionPage): number[] {
  const c = page.content;
  if (c?.kind !== "day") return [];
  return [...new Set(page.questions.filter(q => {
    if (!q.package) return false;
    const slot = c.blocks.find(b => b.items.includes(q.number))?.slot ?? q.place;
    return packageItem(q.package).regions.some(r => r.kind === "work") || questionWorkSpace(q.package, slot) > 0;
  }).map(q => q.number))].sort((a, b) => a - b);
}

function numberedList(numbers: readonly number[]): string {
  const parts: string[] = [];
  for (let at = 0; at < numbers.length; at++) {
    const start = numbers[at];
    let end = at;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
    if (end - at >= 2) { parts.push(`${start}-${numbers[end]}`); at = end; }
    else parts.push(String(start));
  }
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** This correction is limited to the first-delivery U16 template. Stored questions and content stay unchanged. */
export function workbookPageInstruction(page: InstructionPage): string | null {
  if (page.content?.kind !== "day" || page.content.level !== 16 || !page.content.consistentLayout) return null;
  const numbers = workQuestionNumbers(page);
  return [answerInstruction(page.questions), page.content.blocks.some(b => b.slot === "warm-up")
    ? "Beat your own count from last time." : null, numbers.length
    ? `Show your work for question${numbers.length === 1 ? "" : "s"} ${numberedList(numbers)}.` : null].filter(Boolean).join(" ");
}
