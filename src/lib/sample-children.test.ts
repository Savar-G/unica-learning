import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sampleReportView } from "@/lib/sample-children";
import { sampleReportWithBook } from "@/lib/sample-book-one";
import { bookOneView, gapsView, nextView, strengthsView, whereView } from "@/lib/report-view";

// The public sample report (D-096) runs a sample child through the real session, the learner profile and the report
// model, so it shows what a parent's report shows (#198, spec #181 stories 5-9; D-305).
describe("the sample report", () => {
  it("shows strengths, gaps and next topics, each gap with the sample child's answer and the likely cause", () => {
    const view = sampleReportView();
    expect(strengthsView(view)?.length ?? 0).toBeGreaterThan(0);
    const gaps = gapsView(view)!;
    expect(gaps.length).toBeGreaterThan(0);
    // Each gap shows one of the sample child's own wrong answers, and the first ones a likely cause.
    for (const s of gaps) expect(s.answer).not.toBe(s.rightAnswer);
    expect(gaps[0].cause).not.toBeNull();
    expect(nextView(view)?.length ?? 0).toBeGreaterThan(0);
    expect(whereView(view)).not.toBeNull();
  });

  it("shows workbook 1 from the real planner, and the first gap is its main work", () => {
    const view = sampleReportWithBook();
    const book = bookOneView(view)!;
    expect(book.main.title).toBe("Adding and subtracting");
    expect(gapsView(view)![0].cover).toBe("In workbook 1");
    // The browser's copy (the admin preview) has no plan: the curriculum stays on the server.
    expect(sampleReportView().bookOne).toBeUndefined();
  });
});
