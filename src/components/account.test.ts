import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StartState } from "@/lib/assessment";
import { startWhen, zoneFor } from "@/lib/family-time";
import { StartTest } from "@/components/account";

// The account page's button for a child's test (#225, spec #181), through the component's public interface.
const page = (state: StartState, postal: string | null = null, report?: string) =>
  renderToStaticMarkup(createElement(StartTest, { childId: "c1", name: "Asha", state, report, when: startWhen(state, zoneFor(postal)) })).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&#x27;|&apos;/g, "'");

describe("the card of a test with every answer in", () => {
  it("says the answers are in, and the test was not sent", () => {
    const text = page({ kind: "finish", attemptId: "a1" });
    expect(text).toContain("Finish test");
    expect(text).toContain("All of Asha's answers are in, but the test was not sent.");
    expect(text).not.toContain("extra questions");
  });
});

const opensAt = Date.parse("2026-11-18T04:29:00Z");
const wait: StartState = { kind: "wait", completedAt: opensAt - 30 * 86400000, opensAt };

describe("family times in the server-rendered account and start button", () => {
  it.each([
    ["V3S 1A1", "9:29 p.m. on Tuesday, November 17"],
    [" m5v 2t6 ", "11:29 p.m. on Tuesday, November 17"],
    [null, "9:29 p.m. on Tuesday, November 17"],
    ["unknown", "9:29 p.m. on Tuesday, November 17"],
  ])("uses the postal code %s before JavaScript runs", (postal, expected) => {
    for (const report of [undefined, "/account/report/r1"]) {
      const text = page(wait, postal, report);
      expect(text).toContain(`The next test opens at ${expected}`);
      expect(text).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
    }
    expect(page({ kind: "resume", attemptId: "a1", resumeUntil: opensAt }, postal)).toContain(`can continue until ${expected}`);
  });

  it.each([
    ["V3S 1A1", "2026-11-01T08:30:00Z", "1:30 a.m. on Sunday, November 1"],
    ["V3S 1A1", "2026-11-01T09:30:00Z", "2:30 a.m. on Sunday, November 1"],
    ["M5V 2T6", "2026-11-01T05:30:00Z", "1:30 a.m. on Sunday, November 1"],
    ["M5V 2T6", "2026-11-01T06:30:00Z", "1:30 a.m. on Sunday, November 1"],
    ["V3S 1A1", "2026-03-08T09:30:00Z", "1:30 a.m. on Sunday, March 8"],
    ["V3S 1A1", "2026-03-08T10:30:00Z", "3:30 a.m. on Sunday, March 8"],
  ])("uses the offset at %s, %s", (postal, iso, expected) => {
    expect(page({ ...wait, opensAt: Date.parse(iso) }, postal)).toContain(expected);
  });
});
