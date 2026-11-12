import { describe, expect, it, vi } from "vitest";
import { at, dayKey, rangeDays } from "@/lib/admin-dashboard";
import { when, whenExact } from "@/lib/admin-view";
import { exportFileName } from "@/lib/admin-export";
import { reminderEmail } from "@/lib/reminder-email";
import { loadReportView } from "@/lib/report-loading";
import { memoryReportReaders } from "@/lib/report-loading-memory";
import { reportDate } from "@/lib/report-view";
import { reportModel } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";

vi.mock("server-only", () => ({}));

describe("time displays and calendar grouping share the confirmed BC rule", () => {
  const iso = "2026-11-02T07:30:01Z";
  it("groups admin events and exports on the displayed date", () => {
    expect(at(iso)).toBe("Nov 2, 12:30 a.m.");
    expect(when(iso)).toBe("2026-11-02 00:30");
    expect(whenExact(iso)).toBe("2026-11-02 00:30:01");
    expect(dayKey(iso)).toBe("2026-11-02");
    expect(rangeDays("today", new Date(iso), null)).toEqual(["2026-11-02"]);
    expect(exportFileName({ dataset: "answers", format: "csv", withTests: false }, new Date(iso))).toBe("unica-answers-2026-11-02.csv");
  });

  it.each([["V3S 1A1", "9:29 p.m."], ["T2P 1J9", "10:29 p.m."], ["X1A 2N2", "10:29 p.m."]])("sends the confirmed deadline for %s", (postal, clock) => {
    const email = reminderEmail({ kind: "continue", parentName: "Alex", childName: "Asha", url: "https://example.com/start", unsubscribeUrl: "https://example.com/unsubscribe", postal, answered: 2, resumeUntil: Date.parse("2026-11-18T04:29:00Z") });
    expect(email.text).toContain(`until ${clock} on Tuesday, November 17`);
    expect(email.html).toContain(`until ${clock} on Tuesday, November 17`);
  });

  it.each([["G0G 1W0", "November 18, 2026"], ["M5V 2T6", "November 17, 2026"], [null, "November 17, 2026"]])("loads the family zone for report dates from %s", async (postal, day) => {
    const { placement } = takeTest({ grade: 4, province: "BC" }, 1, knowsUpTo(4));
    const reader = memoryReportReaders({}).parent("parent-1");
    const loaded = await loadReportView({ ...reader, report: async () => ({
      id: "report-1", assessmentId: "assessment-1", childId: "child-1", model: reportModel(placement, { workReviews: [] }),
      questions: 36, minutes: 34, assessment: { completedAt: "2026-11-18T04:29:00Z", province: "BC" }, child: { firstName: "Asha" }, postal,
    }) }, "report-1");
    expect(loaded).not.toBeNull();
    expect(reportDate(loaded!.view)).toBe(day);
  });
});
