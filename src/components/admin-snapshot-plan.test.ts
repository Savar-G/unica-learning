import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AdminSnapshotPlan } from "./admin-snapshot-plan";
import type { SnapshotPlanView } from "@/lib/next-book-plan-view";

// #473: the admin section renders a synthetic frozen plan (no admin sign-in in tests).
const ready: SnapshotPlanView = {
  state: "ready", revision: 2, reason: "Day 7 was scanned", frozenAt: Date.parse("2026-11-10T18:20:00Z"), matchesSaved: true,
  days: { used: [1, 2, 3, 4, 5, 6, 7], later: [8, 9, 10] }, used: 14, pending: 2,
  skills: [{ skill: "3.1-place-value-1000", name: "Hundreds, tens and ones", decision: "Move on to step 2", newSteps: [{ step: 2, day: 1 }],
    fixItLater: true, reviewsDue: [{ step: 1, every: "1 week", when: "Day 3" }], reviewsMissed: [{ step: 1, every: "2 days" }],
    fixIt: [{ question: "Book page 14, question 2", result: "Wrong", mistake: "O3" }], held: [{ step: 1, reason: "Had help with the math" }] }],
  otherHeld: [{ reason: "On a later day, kept for a later book", count: 3 }],
};
const html = (view: SnapshotPlanView) => renderToStaticMarkup(createElement(AdminSnapshotPlan, { view }));

it("shows each skill's next steps, reviews, Fix it items and held marks", () => {
  const out = html(ready);
  for (const text of ["Hundreds, tens and ones", "Move on to step 2", "Step 2, Day 1", "Step 1, Day 3 (every 1 week)", "Step 1 (every 2 days)",
    "Book page 14, question 2: Wrong, mistake O3", "No room in this book", "Step 1: Had help with the math",
    "On a later day, kept for a later book", "Days 1 to 7. Days 8 to 10 kept for a later book.", "2026-11-10 11:20"]) expect(out).toContain(text);
  expect(out).not.toContain("planner has changed");
});

it("warns when the saved steps cannot be shown, and names an empty chain", () => {
  expect(html({ ...ready, matchesSaved: false })).toContain("The planner has changed since this snapshot");
  expect(html({ state: "none" })).toContain("No snapshot yet");
  expect(html({ state: "waiting", revision: 1 })).toContain("waiting for the last marks");
});
