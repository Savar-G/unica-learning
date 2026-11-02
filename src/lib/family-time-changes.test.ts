import { describe, expect, it, vi } from "vitest";
import * as time from "@/lib/family-time";
import { createMinutesLedger } from "@/lib/maya-minutes";
import { memoryMinutesStore } from "@/lib/maya-minutes-memory";
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
  it.each(changes)("%s: usage follows grant instants and displays follow the new zone", async (_, before, after) => {
    const now = Date.parse("2026-11-09T06:30:00Z");
    const store = memoryMinutesStore({ clock: () => now });
    const ledger = createMinutesLedger({ store, clock: () => now });
    const base = { parentId: "p", childId: "c" };
    for (let i = 0; i < 3; i++) {
      const id = `spent-${i}`;
      expect((await ledger.grantChild({ ...base, callId: id, timeZone: time.familyZone(before) })).ok).toBe(true);
      store.callEnded(id, 600);
    }
    expect((await ledger.grantDemo({ parentId: "p", callId: "demo", timeZone: time.familyZone(before) })).ok).toBe(true);
    store.callEnded("demo", 120);
    const zone = time.familyZone(after);
    expect(await ledger.usage({ ...base, timeZone: zone })).toMatchObject({ usedSeconds: 1800, leftSeconds: 0 });
    expect(await ledger.grantChild({ ...base, callId: "extra", timeZone: zone })).toMatchObject({ ok: false });
    expect(await ledger.grantDemo({ parentId: "p", callId: "extra-demo", timeZone: zone })).toMatchObject({ ok: false });
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
      await run("2026-11-15T20:00:00Z");
      apply(reverse ? before : after);
      await run("2026-11-22T20:00:00Z");
      const covered = store.rows().filter((r) => r.status === "sent").flatMap((r) => r.callIds ?? []);
      expect(covered.filter((id) => id === "boundary")).toHaveLength(1);
      expect(new Set(covered).size).toBe(covered.length);
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
  it.each([
    ["America/Havana", "2027-03-13T20:00:00Z"], ["America/Santiago", "2027-09-04T20:00:00Z"],
    ["America/Toronto", "2027-03-13T20:00:00Z"], ["America/Havana", "2027-11-06T20:00:00Z"],
    ["America/Santiago", "2027-04-03T20:00:00Z"], ["America/Toronto", "2027-11-06T20:00:00Z"],
  ])("grants a demo across %s at %s", async (zone, iso) => {
    const clock = () => Date.parse(iso);
    const ledger = createMinutesLedger({ store: memoryMinutesStore({ clock }), clock });
    expect(await ledger.grantDemo({ parentId: "p", callId: "demo", timeZone: zone })).toMatchObject({ ok: true, seconds: 120 });
  });
});
