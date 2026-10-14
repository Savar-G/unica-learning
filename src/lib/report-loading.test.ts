import { describe, expect, it, vi } from "vitest";
import { reportModel, type ShownWork } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { loadReportView } from "@/lib/report-loading";
import { memoryReportReaders, type MemoryReportTables } from "@/lib/report-loading-memory";

// The report-loading module (spec #145, #161), through its public interface: the report view for one report id and
// one reader. The readers are the in-memory adapter, which keeps the database's access rules: a parent reads only their
// own rows, an admin reads every row, and a parent signs only the drawings in their own folder.
vi.mock("server-only", () => ({}));

// Asha, grade 4 in BC, child of parent-1, works at grade 4. Four answers with work, in test order: three drawn and one
// typed. The report shows the first three (REPORT_WORK_MAX), so the fourth drawing is in the bucket but not on the report.
const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4));
const drawing = (parent: string, n: number) => `${parent}/test-1/${asked[n].id}-x.png`;
const work = (n: number, image: string | null, text: string | null = null): ShownWork =>
  ({ questionId: asked[n].id, prompt: asked[n].prompt, correct: true, required: true, image, text });
const shownWork = [work(0, drawing("parent-1", 0)), work(1, null, "47+38"), work(2, drawing("parent-1", 2)), work(3, drawing("parent-1", 3))];
const model = reportModel(placement, { workReviews: [], shownWork });

/** One stored report for Asha, with its test, its child and the drawings bucket. `drop` leaves a row out. */
function tables({ drop }: { drop?: "child" | "assessment" } = {}): MemoryReportTables {
  return {
    reports: [{ id: "report-1", assessmentId: "test-1", parentId: "parent-1", childId: "child-1", model, questions: 36, minutes: 34 }],
    assessments: drop === "assessment" ? [] : [{ id: "test-1", parentId: "parent-1", completedAt: "2026-10-10T19:30:00Z", province: "BC" }],
    children: drop === "child" ? [] : [{ id: "child-1", parentId: "parent-1", firstName: "Asha" }],
    drawings: [drawing("parent-1", 0), drawing("parent-1", 2), drawing("parent-1", 3)],
  };
}

describe("the report view (#161)", () => {
  it("is the same through the parent reader and the admin reader, except for the signed drawings", async () => {
    const readers = memoryReportReaders(tables());
    const asParent = await loadReportView(readers.parent("parent-1"), "report-1");
    const asAdmin = await loadReportView(readers.admin(), "report-1");

    const expected = {
      childId: "child-1",
      assessmentId: "test-1",
      view: { id: "report-1", childName: "Asha", province: "BC", completedAt: "2026-10-10T19:30:00Z", questions: 36, minutes: 34, model },
    };
    for (const loaded of [asParent, asAdmin]) {
      const { workImages, ...view } = loaded!.view;
      expect({ ...loaded, view }).toEqual(expected);
      expect(Object.keys(workImages ?? {}).sort()).toEqual([drawing("parent-1", 0), drawing("parent-1", 2)].sort());
    }
    // Each reader signs the drawings for itself.
    expect(asParent!.view.workImages![drawing("parent-1", 0)]).not.toBe(asAdmin!.view.workImages![drawing("parent-1", 0)]);
  });

  it("is not found through another parent's reader, and nothing is signed for them", async () => {
    const readers = memoryReportReaders(tables());
    expect(await loadReportView(readers.parent("parent-2"), "report-1")).toBeNull();
    expect(readers.signed).toEqual([]);
    // The report is still there for its own parent and for the admin.
    expect(await loadReportView(readers.parent("parent-1"), "report-1")).not.toBeNull();
    expect(await loadReportView(readers.admin(), "report-1")).not.toBeNull();
  });

  it("is not found when the child or the test is missing, or there is no such report, for every reader", async () => {
    for (const drop of ["child", "assessment"] as const) {
      const readers = memoryReportReaders(tables({ drop }));
      expect(await loadReportView(readers.parent("parent-1"), "report-1"), `no ${drop}, parent`).toBeNull();
      expect(await loadReportView(readers.admin(), "report-1"), `no ${drop}, admin`).toBeNull();
      expect(readers.signed).toEqual([]);
    }
    const readers = memoryReportReaders(tables());
    expect(await loadReportView(readers.parent("parent-1"), "report-2")).toBeNull();
    expect(await loadReportView(readers.admin(), "report-2")).toBeNull();
  });

  it("signs only the drawings of the report's work: not typed work, and not a drawing the report leaves out", async () => {
    const readers = memoryReportReaders(tables());
    await loadReportView(readers.parent("parent-1"), "report-1");
    await loadReportView(readers.admin(), "report-1");
    const onReport = [drawing("parent-1", 0), drawing("parent-1", 2)];
    expect(readers.signed).toEqual([{ reader: "parent-1", paths: onReport }, { reader: "admin", paths: onReport }]);
  });
});
