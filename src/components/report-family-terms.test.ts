import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { nextStep } from "@/lib/report-view";
import { sampleReportView } from "@/lib/sample-children";
import { ReportNextView } from "@/components/report-next";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}) }));

it.each(["open", "ended"] as const)("shows the real sibling price and %s shared window in both report views", window => {
  const step = nextStep({ ...sampleReportView(), planOffer: { monthly: 59.99, window } });
  expect(step.plans).toEqual([{ plan: "one", subject: "Math", price: 59.99, label: "CAD 59.99 a month." }]);
  expect(step.text).toContain("CAD 59.99 a month.");
  expect(step.text).toContain(window === "open" ? "A child who starts during that window is free until it ends." : "A child who starts after that window is charged when their plan starts.");
  for (const card of ["choose", "saved"] as const) {
    const html = renderToStaticMarkup(createElement(ReportNextView, { step, card, reportId: "report", childName: "Kai", province: "BC", src: "account", asked: false, start: { saved: card === "saved" ? "one" : null, joined: false, cancelled: false }, wait: "join", busy: null, announce: "", savedPlan: "one", choose: () => {}, join: () => {}, checkAgain: () => {} }));
    expect(html).toContain("CAD 59.99 a month.");
    expect(html).not.toContain("79.99");
    expect(html).not.toContain("Your first month is free");
    expect(html).toContain(window === "open" ? "A child who starts during that window is free until it ends." : "A child who starts after that window is charged when their plan starts.");
    if (window === "ended") expect(html).not.toContain("Your family gets one free month.");
  }
});

it("shows no price offer when the family terms cannot be read", () => {
  const step = nextStep({ ...sampleReportView(), planOffer: null });
  expect(step.plans).toEqual([]);
  expect(step.text).not.toContain("79.99");
});
