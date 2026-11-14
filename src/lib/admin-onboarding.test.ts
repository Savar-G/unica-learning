import { describe, expect, it } from "vitest";
import { onboardingCheckIns, onboardingCheckInHref, type OnboardingStart } from "@/lib/admin-onboarding";

const start: OnboardingStart = { cardId: "card", parentId: "parent", childId: "child", parentName: "Priya & Sam", childName: "Leah", email: "parent+test@example.invalid", finishedAt: "2026-11-10T23:00:00Z", location: { timeZone: "America/Vancouver" } };
const rowsAt = (now: string, over: Partial<OnboardingStart> = {}) => onboardingCheckIns([{ ...start, ...over }], Date.parse(now));

describe("the personal Day 2 check-in", () => {
  it("shows two calendar days after start in the family zone, not before or on the next day", () => {
    expect(rowsAt("2026-11-12T06:59:59Z")).toEqual([]);
    expect(rowsAt("2026-11-12T07:00:00Z")).toHaveLength(1);
    expect(rowsAt("2026-11-13T06:59:59Z")).toHaveLength(1);
    expect(rowsAt("2026-11-13T07:00:00Z")).toEqual([]);
  });
  it("uses the stored zone before the postal code, and the postal code before province", () => {
    const now = "2026-11-12T05:00:00Z";
    expect(rowsAt(now, { location: { timeZone: "America/Toronto", postal: "V6B1A1", province: "BC" } })).toHaveLength(1);
    expect(rowsAt(now, { location: { timeZone: "bad", postal: "V6B1A1", province: "ON" } })).toHaveLength(0);
    expect(rowsAt("2026-11-12T05:00:00Z", { location: { province: "ON" } })).toHaveLength(1);
  });
  it("works over a seasonal clock change by local dates", () => {
    expect(rowsAt("2026-11-02T05:00:00Z", { finishedAt: "2026-10-31T16:00:00Z", location: { timeZone: "America/Toronto" } })).toHaveLength(1);
  });
  it("keeps one message per family even with multiple children, and excludes invalid starts", () => {
    expect(onboardingCheckIns([start, { ...start, cardId: "sibling" }], Date.parse("2026-11-12T20:00:00Z"))).toEqual([start]);
    expect(rowsAt("2026-11-12T20:00:00Z", { finishedAt: "bad" })).toEqual([]);
    expect(rowsAt("2026-11-12T20:00:00Z", { finishedAt: "2026-11-15T20:00:00Z" })).toEqual([]);
  });
  it("opens an encoded draft asking about the first day and scanning without sending it", () => {
    const href = onboardingCheckInHref(start);
    expect(href).toContain("mailto:parent%2Btest%40example.invalid?");
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("body")).toContain("Hi Priya & Sam,");
    expect(params.get("body")).toContain("How did the first day go? Did scanning work?");
  });
});
