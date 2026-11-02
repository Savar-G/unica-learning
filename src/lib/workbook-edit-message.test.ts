import { describe, expect, it } from "vitest";
import { workbookEditMessage } from "@/lib/workbook-edit-message";
import type { ReviewComment, WorkbookEdit } from "@/lib/workbook-edit";
const batch = { id: "latest", status: "done" } as WorkbookEdit;
const comment = (status: ReviewComment["status"], batchId = "latest", error: string | null = null) => ({ status, batchId, error }) as ReviewComment;
describe("workbook edit result message", () => {
  it("reports a partial failure without saying the workbook is unchanged", () => {
    expect(workbookEditMessage(batch, [comment("failed"), comment("done"), comment("failed", "old")])).toBe("1 comment couldn't be applied. The rest are done.");
    expect(workbookEditMessage(batch, [comment("pending", "latest", "limit reached"), comment("done")])).toBe("1 comment couldn't be applied. The rest are done.");
  });
  it("reports no changes once when all comments failed", () => {
    expect(workbookEditMessage({ ...batch, status: "failed", error: "old repeated text" }, [comment("failed")])).toBe("No comments could be applied. The workbook is unchanged.");
  });
  it("uses plural counts and hides the failure message during work or full success", () => {
    expect(workbookEditMessage(batch, [comment("failed"), comment("failed"), comment("done")])).toBe("2 comments couldn't be applied. The rest are done.");
    expect(workbookEditMessage(batch, [comment("done")])).toBeNull();
    expect(workbookEditMessage({ ...batch, status: "running" }, [comment("sent")])).toBeNull();
  });
});
