import { afterEach, describe, expect, it, vi } from "vitest";
import {
  effectiveZone, familyTime, familyWhen, formatCalendarDate, localDay, localWeekStart,
  PACIFIC_ZONE, warnIfTimeZoneDataIsOld, zoneFor,
} from "@/lib/family-time";

afterEach(() => vi.restoreAllMocks());
const at = Date.parse("2026-11-18T04:29:00Z");

describe("Canadian family clocks", () => {
  it.each([
    ["V3S 1A1", "9:29 p.m."], ["T2P 1J9", "10:29 p.m."],
    ["X1A 2N2", "10:29 p.m."], ["X0E 0T0", "10:29 p.m."],
    ["Y1A 1A1", "9:29 p.m."], ["S4P 3Y2", "10:29 p.m."],
    [null, "9:29 p.m."], ["unknown", "9:29 p.m."],
  ])("uses the confirmed November rule for %s", (postal, clock) => {
    expect(familyTime(at, zoneFor(postal))).toBe(clock);
  });

  it.each([
    [" x0a 0h0 ", "America/Iqaluit", "2026-11-17", "11:29 p.m."],
    ["X0C 0G0", "America/Rankin_Inlet", "2026-11-17", "10:29 p.m."],
    ["X0B 0C0", "America/Cambridge_Bay", "2026-11-17", "9:29 p.m."],
    ["X0A 0V0", "America/Resolute", "2026-11-17", "10:29 p.m."],
    ["X0C 0C0", "America/Atikokan", "2026-11-17", "11:29 p.m."],
    ["A0P 1E0", "America/Goose_Bay", "2026-11-18", "12:29 a.m."],
    ["A2V 2Y3", "America/Goose_Bay", "2026-11-18", "12:29 a.m."],
    ["A0K 1N0", "America/Goose_Bay", "2026-11-18", "12:29 a.m."],
    ["A0K 4H0", "America/St_Johns", "2026-11-18", "12:59 a.m."],
    ["P9N 1A1", "America/Winnipeg", "2026-11-17", "11:29 p.m."],
    ["P0T 1C0", "America/Atikokan", "2026-11-17", "11:29 p.m."],
    ["V1C 3H8", "America/Edmonton", "2026-11-17", "10:29 p.m."],
    ["V0B 1M0", "America/Edmonton", "2026-11-17", "10:29 p.m."],
    ["V0A 1H0", "America/Edmonton", "2026-11-17", "10:29 p.m."],
    ["V0B 1G0", "America/Creston", "2026-11-17", "9:29 p.m."],
    ["G0G 1W0", "America/Blanc-Sablon", "2026-11-18", "12:29 a.m."],
    ["G0G 2W0", "America/Blanc-Sablon", "2026-11-18", "12:29 a.m."],
    ["G0G 1P0", "America/Toronto", "2026-11-17", "11:29 p.m."],
    ["G0G 2B0", "America/Toronto", "2026-11-17", "11:29 p.m."],
    ["V0B 1G9", "America/Creston", "2026-11-17", "9:29 p.m."],
    ["V0B 1S0", "America/Vancouver", "2026-11-17", "9:29 p.m."],
    ["G0G 1J0", "America/Toronto", "2026-11-17", "11:29 p.m."],
  ])("maps split region %s without changing its date", (postal, zone, day, clock) => {
    expect(zoneFor(postal)).toBe(zone);
    expect(localDay(at, zoneFor(postal))).toBe(day);
    expect(familyTime(at, zoneFor(postal))).toBe(clock);
  });

  it.each([
    ["V3S 1A1", "2026-03-08T09:59:59Z", "1:59 a.m."],
    ["V3S 1A1", "2026-03-08T10:00:00Z", "3:00 a.m."],
    ["V3S 1A1", "2026-11-01T08:59:59Z", "1:59 a.m."],
    ["V3S 1A1", "2026-11-01T09:00:00Z", "2:00 a.m."],
    ["T2P 1J9", "2026-11-01T07:59:59Z", "1:59 a.m."],
    ["T2P 1J9", "2026-11-01T08:00:00Z", "2:00 a.m."],
    ["X1A 2N2", "2026-11-01T07:59:59Z", "1:59 a.m."],
    ["X1A 2N2", "2026-11-01T08:00:00Z", "2:00 a.m."],
    ["X0E 0T0", "2026-11-01T07:59:59Z", "1:59 a.m."],
    ["X0E 0T0", "2026-11-01T08:00:00Z", "2:00 a.m."],
    ["V1C 3H8", "2026-11-01T07:59:59Z", "1:59 a.m."],
    ["V1C 3H8", "2026-11-01T08:00:00Z", "2:00 a.m."],
    ["R3C 0V8", "2026-11-01T06:59:59Z", "1:59 a.m."],
    ["R3C 0V8", "2026-11-01T07:00:00Z", "2:00 a.m."],
    ["X0B 0C0", "2026-11-01T07:59:59Z", "1:59 a.m."],
    ["X0B 0C0", "2026-11-01T08:00:00Z", "1:00 a.m."],
    ["V3S 1A1", "2025-11-02T08:59:59Z", "1:59 a.m."],
    ["V3S 1A1", "2025-11-02T09:00:00Z", "1:00 a.m."],
    ["T2P 1J9", "2026-01-01T12:00:00Z", "5:00 a.m."],
    ["X1A 2N2", "2026-01-01T12:00:00Z", "5:00 a.m."],
  ])("keeps the correct clock across %s at %s", (postal, iso, clock) => {
    expect(familyTime(Date.parse(iso), zoneFor(postal))).toBe(clock);
  });

  it("uses the same new day for display, day keys, and Monday resets", () => {
    const monday = Date.parse("2026-11-02T07:30:00Z");
    expect(localDay(monday, PACIFIC_ZONE)).toBe("2026-11-02");
    expect(familyWhen(monday, PACIFIC_ZONE)).toBe("12:30 a.m. on Monday, November 2");
    expect(localWeekStart(monday, PACIFIC_ZONE)).toBe(Date.parse("2026-11-02T07:00:00Z"));
    expect(localWeekStart(Date.parse("2026-11-02T06:59:59Z"), PACIFIC_ZONE)).toBe(Date.parse("2026-10-26T07:00:00Z"));
    expect(localDay("2026-11-02T06:30:00Z", zoneFor("T2P 1J9"))).toBe("2026-11-02");
    expect(localDay("2026-11-02T05:30:00Z", zoneFor("P9N 1A1"))).toBe("2026-11-02");
  });

  it.each([
    ["V3S 1A1", "2026-11-02T14:00:00Z", "2026-10-26T14:00:00Z"],
    ["T2P 1J9", "2026-11-02T13:00:00Z", "2026-10-26T13:00:00Z"],
    ["X1A 2N2", "2026-11-02T13:00:00Z", "2026-10-26T13:00:00Z"],
    ["M5V 2T6", "2026-11-02T12:00:00Z", "2026-10-26T11:00:00Z"],
  ])("changes the weekly email period exactly at Monday 7 a.m. in %s", (postal, boundary, previous) => {
    const ms = Date.parse(boundary);
    expect(localWeekStart(ms - 1, zoneFor(postal), 7)).toBe(Date.parse(previous));
    expect(localWeekStart(ms, zoneFor(postal), 7)).toBe(ms);
    expect(localWeekStart(ms + 1, zoneFor(postal), 7)).toBe(ms);
  });

  it("keeps date-only values on their calendar date", () => {
    expect(formatCalendarDate("2026-11-02", { dateStyle: "long" })).toBe("November 2, 2026");
  });

  it("does not apply the broad FSA rule to eastern Fort Severn or the Creston Valley", () => {
    const summer = Date.parse("2026-07-01T12:00:00Z");
    expect(familyTime(summer, zoneFor("P0V 1W0"))).toBe("8:00 a.m.");
    expect(familyTime(summer, zoneFor("P0V 1G0"))).toBe("7:00 a.m.");
    expect(familyTime(summer, zoneFor("V0B 1K0"))).toBe("5:00 a.m.");
    expect(familyTime(summer, zoneFor("V0B 1M0"))).toBe("6:00 a.m.");
  });
});

describe("runtime time-zone data", () => {
  const Native = Intl.DateTimeFormat;
  const oldZones: Record<string, string> = {
    "America/Vancouver": "America/Los_Angeles", "America/Edmonton": "America/Denver",
    "America/Yellowknife": "America/Denver", "America/Inuvik": "America/Denver", "America/Winnipeg": "America/Chicago",
  };
  it.each([false, true])("formats identically when the runtime knows the new rules: %s", (updated) => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locale, options) {
      const zone = options?.timeZone ?? "UTC";
      return new Native(locale, { ...options, timeZone: updated ? effectiveZone(at, zone) : oldZones[zone] ?? zone });
    });
    expect(familyTime(at, PACIFIC_ZONE)).toBe("9:29 p.m.");
    expect(familyTime(at, zoneFor("T2P 1J9"))).toBe("10:29 p.m.");
    expect(familyTime(at, zoneFor("X1A 2N2"))).toBe("10:29 p.m.");
    const warnings = vi.fn();
    warnIfTimeZoneDataIsOld(warnings);
    if (updated) expect(warnings).not.toHaveBeenCalled();
    else {
      expect(warnings).toHaveBeenCalledTimes(5);
      expect(warnings).toHaveBeenCalledWith(expect.stringContaining("Runtime time-zone data is older than 2026b for America/Vancouver"));
    }
  });

  it("reports stale time-zone data in this test runtime", () => {
    warnIfTimeZoneDataIsOld();
  });
});
