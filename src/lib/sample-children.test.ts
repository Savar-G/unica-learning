import { describe, expect, it } from "vitest";
import { sampleReportView } from "@/lib/sample-children";
import { strengthsView, strugglesView, workbookPreview } from "@/lib/report-view";

// The public sample report (D-096) runs a sample child through the real session, the learner profile and the report
// model, so it shows what a parent's report shows (#198, spec #181 stories 5-9).
describe("the sample report", () => {
  it("shows the new sections: strengths, struggles with the sample child's answer and the likely cause, and the workbook 1 preview", () => {
    const view = sampleReportView();
    expect(strengthsView(view)?.length).toBeGreaterThan(0);
    const struggles = strugglesView(view)!;
    expect(struggles.length).toBeGreaterThan(0);
    // Each struggle shows one of the sample child's own wrong answers, and the first ones a likely cause.
    for (const s of struggles) expect(s.answer).not.toBe(s.rightAnswer);
    expect(struggles[0].cause).not.toBeNull();
    expect(workbookPreview(view)).toMatch(/^Workbook 1 focuses on .+\. We will challenge Leah on .+\.$/);
  });
});
