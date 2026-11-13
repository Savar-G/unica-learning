import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import type { DayContent } from "@/lib/workbook-page";
import { renderWorkbook, type DraftPage, type MeasuredElement, type PrintOutput } from "@/lib/workbook-render";
import { sampleBook } from "@/lib/workbook-sample-book";
import { fullnessProblem, workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { STRETCHED_BOOK, STRETCHED_PAGES } from "@/lib/workbook-layout-stretch-fixture";
import practiceSectionGap from "./workbook-practice-section-gap.fixture.json";

// The layout checks (src/lib/workbook-layout-check.ts) on pages printed by real Chromium: Codex's physical controls on
// PR #516 at bfdae35. One practice page at its maximum, printed as the template lays it out, passes the render and the
// fullness check; the same page with each fault put in by CSS fails one of them. And the content lane's two U4 pages
// whose rows grew unevenly at their maximum now print with even rows. Runs where a Chromium is found.

const chromium = await findChromium();
const draft = sampleBook({ level: "U12", workbookId: "55555555-5555-4555-8555-000000000021", childId: "22222222-2222-4222-8222-222222222222", child: "Mateo", number: 1 }).draft;
const source = draft.pages.find((p) => p.content?.kind === "day" && p.questions.length >= 4)!;
const base = source.questions.find((q) => !q.package.answer?.unit && q.package.answer?.value.type !== "quantity")!.package;

/** A practice page of 6 questions (1 and 2 Getting started, the rest On your own), at its maximum. */
function page(number: number, subtitle = "Write the answer in the box."): DraftPage {
  const c = source.content as DayContent;
  const content: DayContent = {
    ...c, consistentLayout: true, fillingComplete: true, atMaximum: true, subtitle, grownUp: null,
    blocks: [{ slot: "finish-these", items: [1, 2] }, { slot: "on-your-own", items: [3, 4, 5, 6] }],
  };
  return { ...source, number, type: "practice", content, questions: [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, package: base })) };
}

const CASES: [name: string, css: string, subtitle?: string][] = [
  ["good", ""],
  ["answers inset 8 px", ".rgs{position:relative;left:-8px}"],
  ["a box 41 px under its text", `[data-measure="question-3-answer"]{transform:translateY(41px)}`],
  ["a box 9 px under its line", `[data-measure="question-3-answer"]{transform:translateY(9px)}`],
  ["a row partner 8 px down", `[data-measure="question-2"]{transform:translateY(8px)}`],
  ["a label 6 px up", `[data-measure="heading-1"]{transform:translateY(-6px)}`],
  ["a number in another weight", `[data-measure="number-3"]{font-weight:400!important}`],
  ["clipped text", `[data-measure="question-3-content"]{clip-path:inset(0 0 8px 0)}`],
  ["room at the foot", ".blk{flex:0 0 auto!important}"],
  ["an instruction twice in one line", "", "Write the answer in the box. Write the answer in the box."],
];

describe.skipIf(!chromium)("the layout checks in Chromium", () => {
  it("keeps a row gap before Spot the error on Practice 2 without two ways (#908)", async () => {
    // An anonymized test-family page: a 15px row gap but only 10px before its section label.
    const page = practiceSectionGap as unknown as DraftPage;
    const result = await renderWorkbook({ draft: { ...STRETCHED_BOOK,
      id: "55555555-5555-4555-8555-000000000908", pages: [page] },
      parentId: "11111111-1111-4111-8111-111111111111",
      template: workbookTemplate(await fixedTemplateFonts()), engine: chromiumPrintEngine() });
    const problems = result.status === "failed" ? result.problems.map(p => p.reason) : [];
    expect(problems).toEqual([]);
  }, 120_000);

  it("pass the page as laid out, and fail each of Codex's faults", async () => {
    const template = workbookTemplate(await fixedTemplateFonts());
    // Each fault on its own sheet only.
    const css = CASES.map(([, rule], i) => rule.replace(/(^|})([^}]+)\{/g, (_, end: string, sel: string) =>
      end + sel.split(",").map((x) => `[data-sheet="${i}"] .pg ${x.trim()}`).join(",") + "{")).join("\n");
    const pages = CASES.map(([, , subtitle], i) => page(101 + i, subtitle));
    let printed: PrintOutput | undefined;
    const engine = chromiumPrintEngine();
    const result = await renderWorkbook({
      draft: { ...draft, pages }, parentId: "11111111-1111-4111-8111-111111111111", template: { ...template, css: template.css + css },
      engine: { print: async (job) => (printed = await engine.print(job)) },
    });
    const verdicts = CASES.map(([name], i) => {
      const measured = new Map<string, MeasuredElement>(printed!.measured.filter((m) => m.sheet === i).map((m) => [m.name, m]));
      const problems = result.status === "failed" ? result.problems.filter((p) => p.page === 101 + i).map((p) => p.reason) : [];
      const fullness = fullnessProblem(pages[i], measured);
      return { name, fails: problems.length > 0 || fullness !== null, problems, fullness };
    });
    expect(verdicts.map((v) => [v.name, v.fails]), JSON.stringify(verdicts, null, 1)).toEqual(CASES.map(([name]) => [name, name !== "good"]));
  }, 120_000);

  it.each(Object.keys(STRETCHED_PAGES))("reject the empty cells in the recorded U4 Practice 2 page of seed %s", async (seed) => {
    const template = workbookTemplate(await fixedTemplateFonts());
    const page = STRETCHED_PAGES[seed];
    const result = await renderWorkbook({ draft: { ...STRETCHED_BOOK, pages: [page] }, parentId: "11111111-1111-4111-8111-111111111111", template, engine: chromiumPrintEngine() });
    expect(result.status).toBe("failed");
    const problems = result.status === "failed" ? result.problems.map(p => p.reason) : [];
    expect(problems.some(reason => /empty cell/.test(reason))).toBe(true);
    expect(problems.filter(reason => !/empty cell/.test(reason))).toEqual([]);
  }, 120_000);
});
