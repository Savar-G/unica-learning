import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Activity, Family } from "@/lib/admin-dashboard";
import type { Book } from "@/lib/admin-production";
import { familyJourney } from "@/lib/admin-family-page";
import { ChildCard, FamilyHead, FamilyTimeline, TIMELINE_SHOWN } from "@/components/admin-family-page";
import { ChildHead } from "@/components/admin-child-page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/admin/parents/x", useSearchParams: () => new URLSearchParams() }));

const now = new Date("2026-11-10T20:00:00.000Z");
const f = {
  id: "fam", name: "Rivera", email: "r@example.invalid", postal: null, createdAt: "2026-11-01T17:00:00Z", source: null, children: [],
  stage: "card_saved", stageAt: "2026-11-05T17:00:00Z", reached: { account: "2026-11-01T17:00:00Z", started: "2026-11-02T17:00:00Z", finished: "2026-11-03T17:00:00Z", card_saved: "2026-11-05T17:00:00Z" },
  tests: [], expired: false, card: null, cards: [{ childId: "kid", savedAt: "2026-11-05T17:00:00Z", createdAt: "2026-11-05T17:00:00Z", customerId: null, foundInStripe: true }],
  subscription: null, subscriptions: [], emails: [], lastEmail: null, unsubscribed: true, nextReminders: [], lastActivityAt: "2026-11-05T17:00:00Z", test: false,
} as unknown as Family;

describe("the family head card", () => {
  it("leads with the Needs you item and its place on the page, and marks the current stage", () => {
    const html = renderToStaticMarkup(createElement(FamilyHead, {
      f, journey: familyJourney(f), now: now.toISOString(), contact: [["Email", "r@example.invalid"]],
      next: { needs: [{ title: "Start a subscription", detail: "Card saved, and no Stripe subscription yet", tone: "warn" }], calm: "Start the plan." },
    }));
    expect(html).toContain("Needs you");
    expect(html).toContain('href="#cards"');
    expect(html).toContain('aria-current="step"');
    expect(html).toMatch(/Card saved<\/b><span class="adm-sr">: now/);
    expect(html).toContain("Reminders are off: this parent unsubscribed.");
  });
});

describe("a child's card", () => {
  it("shows the book's stage with its action, and sends a child with no workbook to the child page", () => {
    const base = { childId: "kid", parentId: "fam", child: "Mira", family: "Rivera", test: false, number: 1, at: null, tries: [] };
    const review = { ...base, stage: "review", run: { run: { id: "run-1", createdAt: "2026-11-09T00:00:00Z" } } } as unknown as Book;
    const c = { id: "kid", parentId: "fam", name: "Mira", grade: 3, place: "BC", addedAt: "2026-11-01T17:00:00Z", test: null, tests: 0, plan: { tone: "ok" as const, text: "Card saved. Plan started." }, chat: "Not on the chat list.", goals: [["Main goal", "Catch up to grade level"], ["Feeling about math", "Finds it hard"], ["Math help now", "No answer"]] as [string, string][] };
    const html = renderToStaticMarkup(createElement(ChildCard, { c: { ...c, book: review }, runner: "mac", now, isTest: false }));
    expect(html).toContain("Ready to review");
    expect(html).toContain("Review draft");
    expect(html).toContain("No test yet.");
    // D-325: the parent goals, one answer a line, for the results call.
    expect(html).toContain("Parent goals");
    expect(html).toContain("Catch up to grade level");
    expect(html).toContain("Math help now:</span> No answer");
    const none = renderToStaticMarkup(createElement(ChildCard, { c: { ...c, book: { ...base, stage: "none" } as Book }, runner: "mac", now, isTest: false }));
    expect(none).toContain('href="/admin/children/kid"');
    expect(none).not.toContain("<button");
  });
});

describe("the timeline", () => {
  it("folds the items after the first ones", () => {
    const items: Activity[] = Array.from({ length: TIMELINE_SHOWN + 3 }, (_, i) => ({ at: new Date(+now - i * 3_600_000).toISOString(), kind: "account", familyId: "fam", familyName: "Rivera", text: `Event ${i}` }));
    const html = renderToStaticMarkup(createElement(FamilyTimeline, { items, now }));
    expect(html).toContain("Show 3 earlier events");
    expect(html.indexOf("Event 0")).toBeLessThan(html.indexOf("<details"));
  });
});

describe("the child head card", () => {
  it("holds the prepare button while there is no workbook yet", () => {
    const html = renderToStaticMarkup(createElement(ChildHead, { book: null, childId: "kid", child: "Mira", runner: "mac", now, restart: null, facts: [] }));
    expect(html).toContain("Prepare next workbook");
    expect(html).toContain("No workbook yet");
    expect(html).toContain('aria-current="step"');
  });
});
