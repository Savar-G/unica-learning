import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SHOW_VOICE_DEMO as SHOW_HOME_VOICE_DEMO } from "@/components/guidance-demo";
import Home from "@/app/(site)/page";

vi.mock("@/components/card-return", () => ({ CardReturn: () => null }));

// Voice launch: public pages may now say Maya takes calls, so the "no voice claims" scan is gone.
describe("public Maya copy", () => {
  it("renders the workbook spread on the home page", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("/whats-included/wb/leah-02-plan.jpg");
    expect(html).toContain("/whats-included/wb/leah-03-d1p1.jpg");
  });

  it("renders the Maya demo on the home page", () => {
    const html = renderToStaticMarkup(createElement(Home));
    expect(html).toContain("/video/guidance-demo.mp4");
    expect(html).toContain("/video/guidance-demo-board.mp4");
    expect(html).toContain("What Maya does");
  });

  it("shows the home demo", () => {
    expect(SHOW_HOME_VOICE_DEMO).toBe(true);
  });

  it("does not render unrelated hidden images on the home page", () => {
    // Savar 2026-11-09: What's included stays exactly as before #778
    for (const page of [Home]) {
      const html = renderToStaticMarkup(createElement(page));
      expect(html).not.toMatch(/app-marked\.png|dash-main\.jpg|dash-side\.png|dash\.jpg|app-callnotes\.png|Companion calls|call notes|Numbers on this page are made up|Every scan updates your dashboard/i);
    }
  });
});
