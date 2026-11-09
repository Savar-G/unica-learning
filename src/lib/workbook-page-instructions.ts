import { packageItem, type QuestionPackage } from "@/lib/question-package";
import type { PageContent } from "@/lib/workbook-page";
import { questionWorkSpace, WORK_INSTRUCTION } from "@/lib/workbook-work-space";

/**
 * Every warm-up page's instruction (Savar, 2026-11-09): what the warm-up is and that every question is done. No timing
 * and no counting words ("Beat your own count", "Do as many as you can", "there is no timer").
 */
export const WARM_UP_INSTRUCTION = "A warm-up on things you learned before. Do every question.";

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

/**
 * Only questions with an allocated calculation or method region require written work: a work region of their own, or
 * the white space the consistent layout draws under a calculation (questionWorkSpace).
 */
export function workQuestionNumbers(page: InstructionPage): number[] {
  const c = page.content;
  if (c?.kind !== "day") return [];
  return [...new Set(page.questions.filter(q => {
    if (!q.package) return false;
    const slot = c.blocks.find(b => b.items.includes(q.number))?.slot ?? q.place;
    return packageItem(q.package).regions.some(r => r.kind === "work") || !!c.consistentLayout && questionWorkSpace(q.package, slot) > 0;
  }).map(q => q.number))].sort((a, b) => a - b);
}

/** "7", "7 and 8", "1, 2 and 3"; a run of 4 or more is "1 to 6" ("1 to 6, 8 and 9"). */
function numberedList(numbers: readonly number[]): string {
  const parts: string[] = [];
  for (let at = 0; at < numbers.length; at++) {
    const start = numbers[at];
    let end = at;
    while (end + 1 < numbers.length && numbers[end + 1] === numbers[end] + 1) end++;
    if (end - at >= 3) { parts.push(`${start} to ${numbers[end]}`); at = end; }
    else parts.push(String(start));
  }
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** The highlighted work line: "Show your work under questions 7 and 8.", or null with no question to work. */
export function workLine(numbers: readonly number[]): string | null {
  return numbers.length ? `Show your work under question${numbers.length === 1 ? "" : "s"} ${numberedList(numbers)}.` : null;
}

/**
 * The line a day page prints on its own, bold on the yellow highlight, under its instruction (Savar, 2026-11-09): the
 * real numbers of the questions with work space, on every day page at every level. The instruction never says it too.
 */
export function workbookWorkLine(page: InstructionPage): string | null {
  return workLine(workQuestionNumbers(page));
}

/** Words a stored instruction may still hold that the page now says elsewhere, or no longer says. */
const SAID_ELSEWHERE = [WORK_INSTRUCTION, /Show your work (?:for|under) questions? [^.]*\./g];
const RETIRED_WARM_UP = ["Beat your own count from last time.", "Do as many as you can.", "Take your time: there is no timer.", "Facts you know.", "Facts to 20."];
const warmUp = (page: InstructionPage) => page.content?.kind === "day" && page.content.blocks.some(b => b.slot === "warm-up");

/** The first-delivery U16 template's instruction, from the page's answer regions. Stored questions and content stay unchanged. */
export function workbookPageInstruction(page: InstructionPage): string | null {
  if (page.content?.kind !== "day" || page.content.level !== 16 || !page.content.consistentLayout) return null;
  return [warmUp(page) ? WARM_UP_INSTRUCTION : null, answerInstruction(page.questions)].filter(Boolean).join(" ");
}

/**
 * The instruction a day page prints, on stored books too (a layout redraw keeps their content): the U16 projection, or
 * the stored instruction without the work sentence (the work line says it) and, on a warm-up, with the warm-up
 * instruction in place of the retired timing and counting words. Null for a page that is not a day page.
 */
export function printedInstruction(page: InstructionPage): string | null {
  const c = page.content;
  if (c?.kind !== "day") return null;
  const scoped = workbookPageInstruction(page);
  if (scoped !== null) return scoped;
  let text = c.subtitle;
  for (const said of [...SAID_ELSEWHERE, ...(warmUp(page) ? RETIRED_WARM_UP : [])]) text = text.replaceAll(said, " ");
  text = text.replace(/\s+/g, " ").trim();
  if (warmUp(page) && !text.includes(WARM_UP_INSTRUCTION)) text = `${WARM_UP_INSTRUCTION} ${text}`.trim();
  return text || answerInstruction(page.questions);
}
