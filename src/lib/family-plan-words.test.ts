import { expect, it, vi } from "vitest";
import { familyPlanWords as w } from "@/lib/family-plan-words";

it("pins all 22 texts approved by Savar on 2026-11-09, character for character", () => {
  expect([
    w.siblingStop, w.adminAction, w.adminConfirm("Kai"), w.existingWindow, w.immediateCharge,
    w.monthly(59.99), w.firstCharge("December 10, 2026"), w.emailUnconfirmed, w.reportButton,
    w.reportHeading("Kai"), w.arrivalHeading, w.whenReady, w.arrival, w.freeMonth,
    w.insideWindow, w.afterWindow, w.ceiling(79.99), w.siblingPrice, w.cancel,
    w.emailSubject("Kai"), w.planStarted("Kai"), w.emailPreview,
  ]).toEqual([
    "This child is a sibling. Their price (CAD 59.99) can start once the sibling update ships.",
    "Workbook delivered: start plan",
    "Has Kai's first workbook arrived at their home?",
    "The family's existing free window applies.",
    "If it has ended, Stripe charges the monthly price now.",
    "CAD 59.99 a month.",
    "First charge: December 10, 2026.",
    "We could not confirm the plan start email.",
    "Start plan",
    "Start Kai's plan",
    "The plan starts when it arrives",
    "Start the plan when you are ready.",
    "Your plan starts when the first workbook arrives at your home.",
    "Your family gets one free month. It starts when your first workbook arrives.",
    "A child who starts during that window is free until it ends.",
    "A child who starts after that window is charged when their plan starts.",
    "We charge no more than CAD 79.99 each month until you cancel.",
    "Each child after the first is CAD 59.99 a month.",
    "Cancel in your account before a child's first charge and you pay nothing for that child.",
    "Welcome to Unica Learning: Kai's plan",
    "Kai's plan has started.",
    "Your plan has started.",
  ]);
});

it("builds the approved sibling sentence from ADDITIONAL_CHILD_PRICE", async () => {
  vi.resetModules();
  vi.doMock("@/lib/site", async original => ({ ...await original<typeof import("@/lib/site")>(), ADDITIONAL_CHILD_PRICE: 61.23 }));
  try { expect((await import("@/lib/family-plan-words")).familyPlanWords.siblingPrice).toBe("Each child after the first is CAD 61.23 a month."); }
  finally { vi.doUnmock("@/lib/site"); vi.resetModules(); }
});
