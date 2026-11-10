import { describe, expect, it } from "vitest";
import { STAGE_ACTION, type Dashboard, type Family } from "@/lib/admin-dashboard";
import { bookSteps, childPlan, familyJourney, familyNextSteps, familyTimeline, latestTest } from "@/lib/admin-family-page";

const family = (over: Partial<Family>): Family => ({
  id: "fam", name: "Rivera", email: "r@example.invalid", postal: null, createdAt: "2026-11-01T17:00:00Z", source: null,
  children: [{ id: "kid", name: "Mira", grade: 3, province: "BC" }], stage: "account", stageAt: "2026-11-01T17:00:00Z",
  reached: { account: "2026-11-01T17:00:00Z" }, tests: [], expired: false, card: null, cards: [], subscription: null, subscriptions: [],
  emails: [], lastEmail: null, unsubscribed: false, nextReminders: [], lastActivityAt: "2026-11-01T17:00:00Z", test: false,
  ...over,
} as Family);

describe("familyJourney", () => {
  it("marks the steps before the family's column done, its column now and the rest not yet", () => {
    const f = family({ stage: "card_started", reached: { account: "2026-11-01T17:00:00Z", started: "2026-11-02T17:00:00Z", finished: "2026-11-03T17:00:00Z", card_started: "2026-11-04T17:00:00Z" } });
    const { steps, off } = familyJourney(f);
    expect(steps.map((s) => `${s.label}:${s.state}`)).toEqual(["Signed up:done", "Taking the test:done", "Finished the test:now", "Card saved:todo", "Customer:todo"]);
    // a column with two stages shows the first time either was reached
    expect(steps[2].at).toBe("2026-11-03T17:00:00Z");
    expect(off).toBeNull();
  });
  it("shows a cancelled family beside the columns, with the steps it reached done", () => {
    const f = family({ stage: "cancelled", reached: { account: "a", started: "b", finished: "c", card_saved: "d", trial: "e", cancelled: "f" } });
    const { steps, off } = familyJourney(f);
    expect(off).toBe("Cancelled");
    expect(steps.every((s) => s.state === "done")).toBe(true);
    expect(steps.some((s) => s.state === "now")).toBe(false);
  });
  it("names the waitlist lane and leaves the steps it never reached open", () => {
    const { steps, off } = familyJourney(family({ stage: "waitlist", reached: { account: "a", started: "b", finished: "c", waitlist: "d" } }));
    expect(off).toBe("Waitlist");
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "todo", "todo"]);
  });
});

describe("familyNextSteps", () => {
  it("takes the dashboard's Needs you items that hold the family, and the stage action as the calm line", () => {
    const f = family({ stage: "card_saved" });
    const other = family({ id: "other" });
    const needs: Dashboard["needs"] = [
      { title: "Start a subscription", detail: "Card saved, and no Stripe subscription yet", tone: "warn", families: [f] },
      { title: "Email failed", detail: "An email did not send", tone: "bad", families: [other] },
    ];
    const next = familyNextSteps(f, needs);
    expect(next.needs).toEqual([{ title: "Start a subscription", detail: "Card saved, and no Stripe subscription yet", tone: "warn" }]);
    expect(next.calm).toBe(STAGE_ACTION.card_saved);
    expect(familyNextSteps(other, needs).needs.map((n) => n.title)).toEqual(["Email failed"]);
  });
});

describe("latestTest", () => {
  it("picks the child's newest test by start", () => {
    const t = (id: string, childId: string, startedAt: string) => ({ id, childId, childName: "Mira", status: "completed" as const, startedAt, completedAt: null, lastAnswerAt: null, answered: 3, reportId: null });
    const tests = [t("old", "kid", "2026-10-01T00:00:00Z"), t("new", "kid", "2026-11-01T00:00:00Z"), t("sib", "other", "2026-12-01T00:00:00Z")];
    expect(latestTest(tests, "kid")?.id).toBe("new");
    expect(latestTest(tests, "none")).toBeNull();
  });
});

describe("childPlan", () => {
  const card = (over: object) => ({ child_id: "kid", card_saved_at: null, updated_at: "2026-11-01T00:00:00Z", planStarted: null, ...over });
  it("says whether the plan started, and asks for a Stripe check when that is unknown", () => {
    expect(childPlan([card({ card_saved_at: "2026-11-02T00:00:00Z", planStarted: true })], "kid")).toMatchObject({ tone: "ok", text: "Card saved. Plan started." });
    expect(childPlan([card({ card_saved_at: "2026-11-02T00:00:00Z", planStarted: false })], "kid").text).toBe("Card saved. No plan started yet.");
    expect(childPlan([card({ card_saved_at: "2026-11-02T00:00:00Z" })], "kid").text).toBe("Card saved. Check the plan in Stripe.");
  });
  it("tells an opened payment page from no card, and reads only the child's own cards", () => {
    expect(childPlan([card({})], "kid").text).toBe("Opened the payment page. No card saved.");
    expect(childPlan([card({ card_saved_at: "2026-11-02T00:00:00Z", planStarted: true })], "sibling").text).toBe("No card yet.");
  });
});

describe("familyTimeline", () => {
  it("lists the family's events newest first, starting with a capital letter", () => {
    const f = family({ tests: [{ id: "t", childId: "kid", childName: "Mira", status: "completed", startedAt: "2026-11-02T17:00:00Z", completedAt: "2026-11-02T18:00:00Z", lastAnswerAt: null, answered: 40, reportId: null }] });
    expect(familyTimeline(f).map((a) => a.text)).toEqual(["Mira finished the test (40 answers)", "Mira started the test", "Signed up for Mira"]);
  });
});

describe("bookSteps", () => {
  it("marks Production's stages before the book's stage done", () => {
    expect(bookSteps("printed").map((s) => s.state)).toEqual(["done", "done", "done", "done", "now", "todo", "todo"]);
    expect(bookSteps("none")[0]).toEqual({ stage: "none", label: "No workbook yet", state: "now" });
  });
});
