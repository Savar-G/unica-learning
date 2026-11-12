import { describe, expect, it, vi } from "vitest";
import * as time from "@/lib/family-time";
import { memoryWeeklyStore } from "@/lib/maya-weekly-email-memory";
import { runWeeklyEmails } from "@/lib/maya-weekly-email";
import { memoryTransport } from "@/lib/email-delivery-memory";
import { newToken } from "@/lib/sign-in-link";
vi.mock("server-only", () => ({}));

const changes: [string, time.FamilyLocation, time.FamilyLocation][] = [
  ["none to browser", {}, { timeZone: "America/Toronto" }],
  ["postal to browser", { postal: "M5V 2T6" }, { postal: "M5V 2T6", timeZone: "America/Vancouver" }],
  ["browser to browser", { timeZone: "America/Toronto" }, { timeZone: "America/Vancouver" }],
  ["province fallback child changes", { province: "ON" }, { province: "BC" }],
];

describe("R425M zone source matrix", () => {
  it.each(changes)("%s: displays follow the new zone", (_, _before, after) => {
    const now = Date.parse("2026-11-09T06:30:00Z");
    const zone = time.familyZone(after);
    expect(time.familyWhen(now, zone)).toBe(after.timeZone === "America/Toronto" ? "1:30 a.m. on Monday, November 9" : "11:30 p.m. on Sunday, November 8");
  });

  it.each(changes)("%s: each recap covers a call ID only once and recovers an uncovered boundary call", async (_, before, after) => {
    for (const reverse of [false, true]) {
      const parent = { id: "p", name: "Parent", email: "parent@family.ca", postal: before.postal ?? null, timeZone: before.timeZone ?? null };
      const children = [{ id: "c", parentId: "p", firstName: "Child", created_at: "2020-01-01", province: before.province ?? null }];
      const calls = [
        { callId: "regular", parentId: "p", childId: "c", endedAt: "2026-11-04T20:00:00Z", notePending: false, kind: "family" },
        { callId: "boundary", parentId: "p", childId: "c", endedAt: "2026-11-09T06:30:00Z", notePending: false, kind: "family" },
      ];
      // No notes: the final Sunday still covers the calls and records their IDs.
      const store = memoryWeeklyStore({ parents: [parent], children, calls, notes: [] });
      const mail = memoryTransport();
      const run = (iso: string) => runWeeklyEmails(store, Date.parse(iso), { origin: "https://unicalearning.com", newToken, transport: mail.transport });
      const apply = (location: time.FamilyLocation) => {
        parent.timeZone = location.timeZone ?? null;
        parent.postal = location.postal ?? null;
        children[0].province = location.province ?? null;
      };
      if (reverse) apply(after);
      expect(await run("2026-11-15T20:00:00Z")).toEqual({ due: 1, sent: 1, failed: 0, busy: 0, unknown: 0 });
      apply(reverse ? before : after);
      // Toronto puts the boundary call in the following week. The other zones cover both on the first run.
      const secondSend = time.familyZone(reverse ? after : before) === "America/Toronto" ? 1 : 0;
      expect(await run("2026-11-22T20:00:00Z")).toEqual({ due: secondSend, sent: secondSend, failed: 0, busy: 0, unknown: 0 });
      const covered = store.rows().filter((r) => r.status === "sent").flatMap((r) => r.callIds ?? []);
      expect(covered.sort()).toEqual(["boundary", "regular"]);
    }
  });
});

describe("R425M-4 local time resolution", () => {
  it.each([
    ["America/Havana", "2027-03-14", 0, "2027-03-14T05:00:00Z"],
    ["America/Havana", "2027-11-07", 0, "2027-11-07T04:00:00Z"],
    ["America/Santiago", "2027-09-05", 0, "2027-09-05T04:00:00Z"],
    ["America/Santiago", "2027-04-03", 23, "2027-04-04T02:00:00Z"],
    ["America/Toronto", "2027-03-14", 2, "2027-03-14T07:00:00Z"],
    ["America/Toronto", "2027-11-07", 1, "2027-11-07T05:00:00Z"],
  ])("resolves %s %s hour %s to the first valid instant", (zone, day, hour, expected) => {
    expect(time.localDateTime(day, zone, hour)).toBe(Date.parse(expected));
  });
});
