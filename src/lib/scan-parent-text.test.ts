// #715 (D-266): the AI marks every answer; a parent only corrects a finished mark. No text a parent can see on a scan
// screen asks the parent to check or judge an answer. Two checks: every string in the parent-facing label sources, and
// every label the page view and page history can produce.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { markingPageView, type EffectiveMark } from "@/lib/scan-marking";
import { HISTORY_LABELS } from "@/lib/scan-history";
import { expectedItems, firstObservation, READING_ISSUES, readingIssueText, type Observation } from "@/lib/scan-observation";

/** Words that ask a parent to judge an answer. "Change this mark" (a correction of a finished mark) is allowed. */
export const ASKS_PARENT_TO_JUDGE = /please check|check (this|the|your|each|every|both) (answer|answers|method|methods|work|mark|marks)\b|check both|answers? to check|parent check|continue checking|needs? (a|your) check|waiting for (a|your) check|is (it|this) right\?|(judge|grade|review) (this|the|each) answer|please mark/i;

const ROOT = join(__dirname, "..", "..");
/** Every source of text on the parent's scan screens and the admin preview of them. */
const SOURCES = [
  "src/lib/scan-marking.ts", "src/lib/scan-observation.ts", "src/lib/scan-history.ts", "src/lib/scan-marking-words.ts", "src/lib/scan-stack.ts",
  "src/lib/admin-parent-dashboard.ts",
  "src/components/scan-mark-change.tsx", "src/components/scan-marking-results.tsx", "src/components/scan-history.tsx", "src/components/scan-pages.tsx",
  "src/components/scan-preview.tsx", "src/components/scan-post-choice.tsx", "src/components/scan-problem-explanation.tsx", "src/components/scan-email-link.tsx",
  "src/components/admin-parent-preview.tsx",
  "src/app/(product)/account/(dashboard)/scan/page.tsx", "src/app/(product)/account/(dashboard)/scan/results/[id]/page.tsx",
];
/** String literals, template text and JSX text: everything that can reach a screen. Comments are left out. */
function texts(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const strings = [...code.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(m => m[1] ?? m[2] ?? m[3]);
  const jsx = [...code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(m => m[1]);
  return [...strings, ...jsx];
}

describe("no parent-facing scan text asks a parent to judge an answer (#715)", () => {
  it("the pattern catches the old wording and allows a correction of a finished mark", () => {
    for (const old of ["Please check this answer", "Check this answer", "Please check both methods and the answer.", "Please check", "Waiting for a check",
      "Answers to check", "1 needs a parent check.", "Continue checking", "Is it right?"]) expect(old).toMatch(ASKS_PARENT_TO_JUDGE);
    for (const ok of ["Change this mark", "Our team is checking this answer.", "Not marked yet", "We check each photo, then you send the pages for marking.",
      "To check it, take another photo with the page upright."]) expect(ok).not.toMatch(ASKS_PARENT_TO_JUDGE);
  });
  it.each(SOURCES)("%s holds no text that asks a parent to judge an answer", (path) => {
    const found = texts(readFileSync(join(ROOT, path), "utf8")).filter(t => ASKS_PARENT_TO_JUDGE.test(t));
    expect(found).toEqual([]);
  });
  it("no reading reason, page label or history label asks a parent to judge, on any state or reason", () => {
    const labels = [...Object.values(HISTORY_LABELS), ...READING_ISSUES.map(readingIssueText)];
    const page = { workbookId: "w", printedRevision: "r", pageId: "p", questions: [{ number: 1, package: null, teaching: null }] };
    const e = { ...expectedItems(page)[0], method: "code" as const };
    const base = firstObservation(e, "photo");
    const states: Observation[] = [base, { ...base, state: "parent-pending", method: "parent" }, { ...base, state: "unscored", method: "unscored" },
      ...READING_ISSUES.map(issue => ({ ...base, certainty: "uncertain" as const, issue })),
      ...(["right", "wrong", "blank"] as const).flatMap(result => [{ ...base, state: "parent-checked" as const, method: "parent" as const, actor: "admin" as const, result }])];
    for (const o of states) for (const model of [null, "model"]) {
      const mark: EffectiveMark = { expected: e, observation: o, originalEvent: null, eventId: null, at: "2026-11-07T00:00:00Z", model, prompt: null };
      labels.push(markingPageView([mark]).items[0].label);
    }
    expect(labels.filter(l => ASKS_PARENT_TO_JUDGE.test(l))).toEqual([]);
    expect(labels).toContain("Not marked yet");
    expect(labels).toContain("Our team is checking this answer.");
  });
});
