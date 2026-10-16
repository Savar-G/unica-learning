import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordReminderClick, recordReportEmailClick } from "@/lib/email-clicks";
import { reminderLinks } from "@/lib/reminder-store";

// Our own click tracking (D-105): the links name their email, and the recorder hands the click to the database.
vi.mock("server-only", () => ({}));

function fakeAdmin(error: string | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const admin = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push([fn, args]), { error: error ? { message: error } : null }) };
  return { calls, admin: admin as unknown as SupabaseClient };
}

describe("a reminder's link", () => {
  const due = (kind: "start" | "continue", assessmentId: string | null) => ({ kind, parentId: "p1", childId: "c1", assessmentId, dueAt: 0, retry: null });

  it("names the test of a continue reminder, so the click finds its one email", () => {
    expect(reminderLinks("https://unicalearning.com", due("continue", "a1"), "tok").url).toBe("https://unicalearning.com/account/start/c1?reminder=continue&a=a1");
  });
  it("names only the kind and child of a start reminder", () => {
    expect(reminderLinks("https://unicalearning.com", due("start", null), "tok").url).toBe("https://unicalearning.com/account/start/c1?reminder=start");
  });
});

describe("recording a click", () => {
  it("calls the database function with the parent, the child, the kind and the test", async () => {
    const { calls, admin } = fakeAdmin();
    await recordReminderClick(admin, "p1", "c1", "come_back", "a1");
    await recordReportEmailClick(admin, "p1", "r1");
    expect(calls).toEqual([
      ["record_reminder_click", { p_parent: "p1", p_child: "c1", p_kind: "come_back", p_assessment: "a1" }],
      ["record_report_email_click", { p_parent: "p1", p_report: "r1" }],
    ]);
  });

  it("never throws when the database fails: the page still shows", async () => {
    const { admin } = fakeAdmin("connection reset");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordReminderClick(admin, "p1", "c1", "start", null)).resolves.toBeUndefined();
    await expect(recordReportEmailClick(admin, "p1", "r1")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
