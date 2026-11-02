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
    ["V0B 1S0", "America/Creston", "2026-11-17", "9:29 p.m."],
    ["G0G 1J0", "America/Toronto", "2026-11-17", "11:29 p.m."],
  ])("maps split region %s without changing its date", (postal, zone, day, clock) => {
    expect(zoneFor(postal)).toBe(zone);
    expect(localDay(at, zoneFor(postal))).toBe(day);
    expect(familyTime(at, zoneFor(postal))).toBe(clock);
  });

  // Each split-region row checks both winter before the 2026 changes and November after them.
  // Expected clocks are literal local readings at 12:00 UTC, not output from the mapping under test.
  it.each([
    ["A0K 1V0", "Cartwright", "8:00 a.m.", "8:00 a.m."],
    ["A0K 1N0", "Black Tickle", "8:00 a.m.", "8:00 a.m."],
    ["A0K 4E0", "Port Hope Simpson", "8:30 a.m.", "8:30 a.m."],
    ["A0K 3P0", "Mary's Harbour", "8:30 a.m.", "8:30 a.m."],
    ["A0P 1E0", "Goose Bay", "8:00 a.m.", "8:00 a.m."],
    ["A0R 1B0", "Churchill Falls", "8:00 a.m.", "8:00 a.m."],
    ["A1A 1A1", "St John's", "8:30 a.m.", "8:30 a.m."],
    ["B3J 1A1", "Nova Scotia", "8:00 a.m.", "8:00 a.m."],
    ["C1A 1A1", "Prince Edward Island", "8:00 a.m.", "8:00 a.m."],
    ["E1A 1A1", "New Brunswick", "8:00 a.m.", "8:00 a.m."],
    ["G0G 0C8", "Saint-Augustin FlexDelivery", "8:00 a.m.", "8:00 a.m."],
    ["G0G 2R0", "Saint-Augustin", "8:00 a.m.", "8:00 a.m."],
    ["G0G 1W0", "Blanc-Sablon", "8:00 a.m.", "8:00 a.m."],
    ["G0G 1G0", "Chevery", "8:00 a.m.", "8:00 a.m."],
    ["G0G 1J0", "Fermont west of 63 W", "7:00 a.m.", "7:00 a.m."],
    ["G0G 1P0", "Havre-Saint-Pierre", "7:00 a.m.", "7:00 a.m."],
    ["G0C 2R0", "Listuguj", "8:00 a.m.", "8:00 a.m."],
    ["G0C 2B0", "New Richmond", "7:00 a.m.", "7:00 a.m."],
    ["G4T 1A1", "Magdalen Islands", "8:00 a.m.", "8:00 a.m."],
    ["H2X 1A1", "Montreal", "7:00 a.m.", "7:00 a.m."],
    ["J0M 1C0", "Kuujjuaq", "7:00 a.m.", "7:00 a.m."],
    ["M5V 2T6", "Toronto", "7:00 a.m.", "7:00 a.m."],
    ["P0V 2V0", "Vermilion Bay", "6:00 a.m.", "7:00 a.m."],
    ["P0V 3A0", "Pickle Lake", "7:00 a.m.", "7:00 a.m."],
    ["P0V 2H0", "Mishkeegogamang", "7:00 a.m.", "7:00 a.m."],
    ["P0V 1G0", "Big Trout Lake east of 90 W", "6:00 a.m.", "6:00 a.m."],
    ["P0V 1B0", "Angling Lake east of 90 W", "6:00 a.m.", "6:00 a.m."],
    ["P0V 0C2", "Angling Lake FlexDelivery", "6:00 a.m.", "6:00 a.m."],
    ["P0V 1Y0", "Kasabonika east of 90 W", "6:00 a.m.", "6:00 a.m."],
    ["P0V 0A1", "Kasabonika FlexDelivery", "6:00 a.m.", "6:00 a.m."],
    ["P0V 1Z0", "Kingfisher Lake east of 90 W", "6:00 a.m.", "6:00 a.m."],
    ["P0V 2Z0", "Wunnummin Lake east of 90 W", "6:00 a.m.", "6:00 a.m."],
    ["P0V 0C4", "Wunnummin Lake FlexDelivery", "6:00 a.m.", "6:00 a.m."],
    ["P0V 1W0", "Fort Severn", "7:00 a.m.", "7:00 a.m."],
    ["P0V 0B8", "Fort Severn FlexDelivery", "7:00 a.m.", "7:00 a.m."],
    ["P0T 1C0", "Atikokan", "7:00 a.m.", "7:00 a.m."],
    ["P0T 1T0", "Ignace", "6:00 a.m.", "7:00 a.m."],
    ["P0T 2Y0", "Upsala", "7:00 a.m.", "7:00 a.m."],
    ["P0T 3A0", "Webequie east of 90 W", "7:00 a.m.", "7:00 a.m."],
    ["P9N 1A1", "Kenora", "6:00 a.m.", "7:00 a.m."],
    ["P8N 1A1", "Dryden", "6:00 a.m.", "7:00 a.m."],
    ["P8T 1A1", "Sioux Lookout", "6:00 a.m.", "7:00 a.m."],
    ["P9A 1A1", "Fort Frances", "6:00 a.m.", "7:00 a.m."],
    ["P0W 1A0", "Barwick", "6:00 a.m.", "7:00 a.m."],
    ["P0X 1C0", "Keewatin", "6:00 a.m.", "7:00 a.m."],
    ["P0Y 1A0", "Whiteshell", "6:00 a.m.", "7:00 a.m."],
    ["R3C 0V8", "Manitoba", "6:00 a.m.", "7:00 a.m."],
    ["S4P 3Y2", "Regina", "6:00 a.m.", "6:00 a.m."],
    ["S9H 1A1", "Swift Current", "6:00 a.m.", "6:00 a.m."],
    ["S9V 1A1", "Lloydminster Saskatchewan", "5:00 a.m.", "6:00 a.m."],
    ["T9V 1A1", "Lloydminster Alberta", "5:00 a.m.", "6:00 a.m."],
    ["S0P 0A0", "Creighton", "6:00 a.m.", "7:00 a.m."],
    ["S0P 0B0", "Denare Beach", "6:00 a.m.", "7:00 a.m."],
    ["S0P 0E0", "Pelican Narrows", "6:00 a.m.", "6:00 a.m."],
    ["S0M 1H0", "Lashburn", "5:00 a.m.", "6:00 a.m."],
    ["S0M 1M0", "Maidstone", "5:00 a.m.", "6:00 a.m."],
    ["S0M 1R0", "Marshall", "5:00 a.m.", "6:00 a.m."],
    ["S0M 1P0", "Marsden", "5:00 a.m.", "6:00 a.m."],
    ["S0M 2C0", "Neilburg", "5:00 a.m.", "6:00 a.m."],
    ["S0M 0E0", "Battleford", "6:00 a.m.", "6:00 a.m."],
    ["T2P 1J9", "Alberta", "5:00 a.m.", "6:00 a.m."],
    ["V3S 1A1", "Pacific BC", "4:00 a.m.", "5:00 a.m."],
    ["V1A 1A1", "Kimberley", "5:00 a.m.", "6:00 a.m."],
    ["V1C 3H8", "Cranbrook", "5:00 a.m.", "6:00 a.m."],
    ["V0B 1M0", "Fernie", "5:00 a.m.", "6:00 a.m."],
    ["V0A 1H0", "Golden", "5:00 a.m.", "6:00 a.m."],
    ["V0A 1K0", "Invermere", "5:00 a.m.", "6:00 a.m."],
    ["V0B 1G0", "Creston", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1K0", "Erickson", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1S0", "Gray Creek", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1E0", "Crawford Bay", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1A1", "Boswell", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1C1", "Canyon", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1V0", "Kingsgate", "5:00 a.m.", "5:00 a.m."],
    ["V0B 1W1", "Kitchener", "5:00 a.m.", "5:00 a.m."],
    ["V0B 2N1", "Wynndel", "5:00 a.m.", "5:00 a.m."],
    ["V1G 1A1", "Dawson Creek", "5:00 a.m.", "5:00 a.m."],
    ["V1J 1A1", "Fort St John", "5:00 a.m.", "5:00 a.m."],
    ["V0C 1L0", "Dease Lake", "4:00 a.m.", "5:00 a.m."],
    ["V0C 1X0", "Moberly Lake", "5:00 a.m.", "5:00 a.m."],
    ["V0C 1R0", "Fort Nelson", "5:00 a.m.", "5:00 a.m."],
    ["V0C 1J0", "Chetwynd", "5:00 a.m.", "5:00 a.m."],
    ["X0A 0H0", "Iqaluit", "7:00 a.m.", "7:00 a.m."],
    ["X0B 0C0", "Cambridge Bay", "5:00 a.m.", "5:00 a.m."],
    ["X0B 0E0", "Kugluktuk", "5:00 a.m.", "5:00 a.m."],
    ["X0C 0G0", "Rankin Inlet", "6:00 a.m.", "6:00 a.m."],
    ["X0A 0V0", "Resolute", "6:00 a.m.", "6:00 a.m."],
    ["X0A 0G0", "Eureka", "6:00 a.m.", "6:00 a.m."],
    ["X0C 0C0", "Coral Harbour", "7:00 a.m.", "7:00 a.m."],
    ["X0C 0A2", "Coral Harbour FlexDelivery", "7:00 a.m.", "7:00 a.m."],
    ["X1A 2N2", "Yellowknife", "5:00 a.m.", "6:00 a.m."],
    ["X0E 0T0", "Inuvik", "5:00 a.m.", "6:00 a.m."],
    ["X0G 0A0", "Fort Liard", "5:00 a.m.", "6:00 a.m."],
    ["Y1A 1A1", "Whitehorse", "5:00 a.m.", "5:00 a.m."],
    ["Y0B 1N0", "Old Crow", "5:00 a.m.", "5:00 a.m."],
  ])("keeps January and November time in %s (%s)", (postal, _place, january, november) => {
    expect(familyTime(Date.parse("2026-01-15T12:00:00Z"), zoneFor(postal))).toBe(january);
    expect(familyTime(Date.parse("2026-11-18T12:00:00Z"), zoneFor(postal))).toBe(november);
    expect(familyTime(Date.parse("2027-01-15T12:00:00Z"), zoneFor(postal))).toBe(november);
  });

  it("distinguishes permanent and seasonal rules in summer", () => {
    const summer = Date.parse("2026-07-15T12:00:00Z");
    expect(familyTime(summer, zoneFor("G0G 0C8"))).toBe("8:00 a.m.");
    expect(familyTime(summer, zoneFor("G0C 2R0"))).toBe("9:00 a.m.");
    expect(familyTime(summer, zoneFor("X0A 0G0"))).toBe("6:00 a.m.");
    expect(familyTime(summer, zoneFor("X0A 0V0"))).toBe("7:00 a.m.");
    expect(familyTime(summer, zoneFor("P0V 3A0"))).toBe("7:00 a.m.");
  });

  it("keeps eastern Ontario seasonal Central on both old and updated runtimes", () => {
    const native = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locale, options) {
      return new native(locale, { ...options, timeZone: options?.timeZone === "America/Winnipeg" ? "Etc/GMT+5" : options?.timeZone });
    });
    expect(zoneFor("P0V 1G0")).toEqual({ zone: "America/Chicago", override: false });
    expect(familyTime(at, zoneFor("P0V 1G0"))).toBe("10:29 p.m.");
    expect(familyTime(at, zoneFor("P0V 2V0"))).toBe("11:29 p.m.");
    expect(localDay("2026-11-18T05:30:00Z", zoneFor("P0V 1G0"))).toBe("2026-11-17");
    expect(localWeekStart(Date.parse("2026-11-02T06:30:00Z"), zoneFor("P0V 1G0"))).toBe(Date.parse("2026-11-02T06:00:00Z"));
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
