// @vitest-environment happy-dom
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartTest } from "@/components/account";
import { FamilyTime } from "@/components/family-time";
import { familyTime, startWhen, zoneFor } from "@/lib/family-time";

const serverZone = process.env.TZ;
afterEach(() => {
  if (serverZone === undefined) delete process.env.TZ;
  else process.env.TZ = serverZone;
  vi.unstubAllGlobals();
});

describe("family time hydration", () => {
  it.each([
    ["V3S 1A1", "9:29 p.m. on Tuesday, November 17"],
    ["M5V 2T6", "11:29 p.m. on Tuesday, November 17"],
    [null, "9:29 p.m. on Tuesday, November 17"],
    ["unknown", "9:29 p.m. on Tuesday, November 17"],
  ])("keeps the server text when the device zone differs, postal %s", async (postal, expected) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const opensAt = Date.parse("2026-11-18T04:29:00Z");
    const element = createElement(StartTest, {
      childId: "c1", name: "Asha",
      when: startWhen({ kind: "wait", completedAt: opensAt - 30 * 86400000, opensAt }, zoneFor(postal)),
      state: { kind: "wait", completedAt: opensAt - 30 * 86400000, opensAt },
    });
    process.env.TZ = "UTC";
    const host = document.createElement("div");
    host.innerHTML = renderToString(element);
    document.body.append(host);
    const before = host.textContent;
    expect(before).toContain(expected);
    process.env.TZ = "Asia/Tokyo";
    // Different browser time-zone data must not trigger a second format during hydration.
    const format = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("Browser time-zone data must not be used"); });
    const errors = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(host, element, { onRecoverableError: errors }); });
      expect(host.textContent).toBe(before);
      expect(errors).not.toHaveBeenCalled();
      expect(host.querySelector("time")?.dateTime).toBe("2026-11-18T04:29:00.000Z");
    } finally {
      await act(async () => root?.unmount());
      host.remove();
      format.mockRestore();
    }
  });

  it("renders the desk's clock-only retry time on the server in the family zone", () => {
    const at = Date.parse("2026-11-18T04:29:00Z");
    const html = renderToString(createElement(FamilyTime, { at, text: familyTime(at, zoneFor("M5V 2T6")) }));
    expect(html).toContain('>11:29 p.m.</time>');
    expect(html).not.toMatch(/\b(?:UTC|EST|EDT|GMT)\b/);
  });
});
