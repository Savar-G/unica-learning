import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { familyProvince, familyTime, familyZone, normalizeTimeZone, validTimeZone } from "@/lib/family-time";
import { SUPPORTED_TIME_ZONES } from "@/lib/supported-time-zones";

afterEach(() => vi.restoreAllMocks());

describe("the supported family zone contract", () => {
  it.each([
    ["Canada/East-Saskatchewan", "America/Regina"],
    ["Canada/Saskatchewan", "America/Regina"],
    ["Canada/Pacific", "America/Vancouver"],
    ["America/Rainy_River", "America/Winnipeg"],
    ["America/Thunder_Bay", "America/Toronto"],
    ["America/Nipigon", "America/Toronto"],
    ["America/Montreal", "America/Toronto"],
    ["US/Pacific-New", "America/Los_Angeles"],
    ["SystemV/EST5EDT", "SystemV/EST5EDT"],
    ["SystemV/EST5", "Etc/GMT+5"],
  ])("supports the saved legacy ID %s", (name, canonical) => {
    expect(normalizeTimeZone(name)).toBe(canonical);
    expect(familyZone({ timeZone: name, province: "BC" })).toBe(canonical);
  });

  it("uses the same canonical value for every listed ID and its case variants", () => {
    for (const [id, canonical] of Object.entries(SUPPORTED_TIME_ZONES)) {
      expect(normalizeTimeZone(id)).toBe(canonical);
      expect(normalizeTimeZone(id.toUpperCase())).toBe(canonical);
      expect(normalizeTimeZone(canonical)).toBe(canonical);
      expect(validTimeZone(id)).toBe(true);
    }
  });

  it("ignores a new runtime-accepted ID until the list explicitly supports it", () => {
    const Native = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) {
      return new Native(locales, { ...options, timeZone: options?.timeZone === "Future/Accepted" ? "America/Regina" : options?.timeZone });
    });
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "Future/Accepted" }).resolvedOptions().timeZone).toBe("America/Regina");
    expect(validTimeZone("Future/Accepted")).toBe(false);
    expect(familyZone({ timeZone: "Future/Accepted", postal: "P9N 1A1", province: "BC" })).toBe("America/Winnipeg");
    const province = familyProvince([{ id: "b", created_at: "2020-01-01", province: "BC" }, { id: "a", created_at: "2020-01-01", province: "ON" }]);
    expect(familyZone({ timeZone: "Future/Accepted", province })).toBe("America/Toronto");
    expect(familyZone({ timeZone: "Future/Accepted" })).toBe("America/Vancouver");
    const at = Date.parse("2026-11-09T12:00:00Z");
    expect(familyTime(at, "Future/Accepted")).toBe("5:00 a.m.");
    expect(familyTime(at, { zone: "Future/Accepted", override: false })).toBe("5:00 a.m.");
  });

  it.each([null, undefined, 1, {}, "", "constructor", "__proto__", "toString", " America/Regina", "America/Regina ", "İtc/UTC"])("treats unsupported input %s as missing", value => {
    expect(normalizeTimeZone(value)).toBeNull();
    expect(validTimeZone(value)).toBe(false);
  });

  it("has the exact TypeScript allow-list in the generated SQL", () => {
    const sql = readFileSync("supabase/migrations/20261102172026_supported_family_zones.sql", "utf8");
    const json = sql.match(/'(\{\n[\s\S]*?\})'::jsonb ->> lower/);
    expect(json).not.toBeNull();
    expect(JSON.parse(json![1])).toEqual(SUPPORTED_TIME_ZONES);
    expect(() => execFileSync(process.execPath, ["scripts/generate-family-zones.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
