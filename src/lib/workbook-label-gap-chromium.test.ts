import { describe, expect, it } from "vitest";
import { chromiumPrintEngine, findChromium } from "@/lib/print-engine-chromium";
import type { DayContent } from "@/lib/workbook-page";
import { renderWorkbook } from "@/lib/workbook-render";
import { workbookTemplate } from "@/lib/workbook-template";
import { fixedTemplateFonts } from "@/lib/workbook-template-fonts";
import { LABEL_GAP_BOOK, LABEL_GAP_PAGE } from "@/lib/workbook-label-gap-fixture";

// Issue #745: a page's gaps grow to fill it (`extraGap`), and the room above a section label must grow with its rows'
// gap. Practice 2 with Solve it two ways kept a fixed 6 px between its blocks, so at 8 px more its rows were 12 px apart
// and the label "SPOT THE ERROR" sat 6 px under question 7, which the layout check (rightly) refuses. Real Chromium,
// where one is found.

const chromium = await findChromium();
const GAPS = [0, 4, 8, 12];

describe.skipIf(!chromium)("the room above a section label in Chromium", () => {
  it("grows with the rows' gap on Practice 2 with Solve it two ways", async () => {
    const template = workbookTemplate(await fixedTemplateFonts());
    const pages = GAPS.map((extraGap, i) => ({ ...LABEL_GAP_PAGE, number: 101 + i, content: { ...(LABEL_GAP_PAGE.content as DayContent), extraGap } }));
    const result = await renderWorkbook({ draft: { ...LABEL_GAP_BOOK, pages }, parentId: "11111111-1111-4111-8111-111111111111", template, engine: chromiumPrintEngine() });
    const problems = result.status === "failed" ? result.problems.map((p) => ({ page: p.page, reason: p.reason })) : [];
    // No gap puts a label closer than a row gap. The new work line makes this fixed page exceed its space at 8 px;
    // the generator checks fit and takes gaps back. Keep the overflow check separate from the label-spacing check.
    expect(problems.filter((p) => /above the label|between rows|above its questions/.test(p.reason))).toEqual([]);
    expect(problems.filter((p) => p.page <= 102)).toEqual([]);
    expect(problems.some((p) => p.page === 103 && /past the bottom/.test(p.reason))).toBe(true);
  }, 120_000);
});
