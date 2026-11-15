import { readFileSync } from "node:fs";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adsBlockedPath } from "@/lib/ad-tags";
import { deskGate } from "@/lib/desk";
import { memoryParentViewReaders, type MemoryParentViewTables } from "@/lib/parent-view-memory";
import Progress from "./page";

// The page through its render, with the in-memory reader. It proves the two switches, the empty state, the words a parent
// reads, and that the desk lock and the ad block cover this address.
vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ signedIn: true, dashboard: true, reader: null as unknown }));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/progress/sample-child",
  redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) => createElement("a", { href }, children) }));
vi.mock("@/components/cookie-consent", () => ({ CookieSettingsButton: () => null }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => (state.dashboard ? { children: [] } : null) }));
vi.mock("@/lib/parent-view-server", () => ({ signedInParentView: async () => (state.signedIn ? state.reader : null) }));

const ON = { progress: true, maya: false, scanPages: false };
const child = { id: "c1", parentId: "p1", firstName: "Leah", grade: 3, createdAt: "2026-10-01T00:00:00Z" };
const AT = Date.parse("2026-10-30T18:00:00Z");
const tables = (over: Partial<MemoryParentViewTables> = {}): MemoryParentViewTables => ({
  children: [child],
  switches: ON,
  cards: [{ parentId: "p1", childId: "c1", cardSavedAt: "2026-10-05T00:00:00Z" }],
  tests: [{ id: "t1", parentId: "p1", childId: "c1", province: "BC", status: "completed", startedAt: AT - 1000, lastAnswerAt: AT, resumeUntil: AT, completedAt: AT }],
  reports: [{ parentId: "p1", childId: "c1", assessmentId: "t1" }],
  results: [{ parentId: "p1", childId: "c1", assessmentId: "t1", level: { working: 3, top: 3, certainty: "clear", confidence: "high" } as never, answers: [] }],
  skillTests: [
    { parentId: "p1", childId: "c1", assessmentId: "t1", standard: "3.1", correct: 2, total: 2, at: "2026-10-30T18:00:00Z" },
    { parentId: "p1", childId: "c1", assessmentId: "t1", standard: "3.2", correct: 0, total: 4, at: "2026-10-30T18:00:00Z" },
  ],
  // A marked page: without one, the tab says progress starts after the first marked pages.
  overviewProgress: [{ parentId: "p1", childId: "c1", marks: [], skillMarks: [{ standard: "3.3", right: true, review: false, at: "2026-11-02T18:00:00Z" }] }],
  history: [{ parentId: "p1", childId: "c1", standard: "3.1", state: "mastered", changedAt: "2026-11-02T18:00:00Z" }],
  ...over,
});
const render = async (over: Partial<MemoryParentViewTables> = {}, id = "c1") => {
  state.reader = memoryParentViewReaders(tables(over)).parent("p1");
  return renderToStaticMarkup((await Progress({ params: Promise.resolve({ child: id }) } as never)) as ReactElement);
};

beforeEach(() => { state.signedIn = true; state.dashboard = true; });

describe("who gets the page", () => {
  it("sends a signed-out visitor to sign in", async () => {
    state.signedIn = false;
    await expect(render()).rejects.toThrow("REDIRECT /sign-in");
  });
  it("is the 404 for a family the dashboard is not open to, also with the Progress switch on", async () => {
    state.dashboard = false;
    await expect(render()).rejects.toThrow("NOT_FOUND");
  });
  it("is the 404 with the Progress switch off, for a family the dashboard is open to", async () => {
    await expect(render({ switches: { progress: false, maya: false, scanPages: false } })).rejects.toThrow("NOT_FOUND");
  });
  it("is the 404 for another family's child", async () => {
    await expect(render({}, "someone-else")).rejects.toThrow("NOT_FOUND");
  });
  it("is the 404 in a stage with no Progress tab", async () => {
    await expect(render({ cards: [] })).rejects.toThrow("NOT_FOUND");
  });
});

describe("what a parent reads", () => {
  it("shows Week, Month and All time, the four tiles, the line, and the math topics, naming the child", async () => {
    const html = await render();
    expect(html).toContain("Leah&#x27;s progress");
    for (const word of ["Week", "Month", "All time"]) expect(html).toContain(`>${word}</button>`);
    expect(html).toContain('aria-pressed="true">Week</button>');
    for (const tile of ["Skills mastered", "Moved up", "Needs help", "Days done"]) expect(html).toContain(`<span class="pp-k">${tile}</span>`);
    expect(html).toContain("This week");
    expect(html).toContain("Skills mastered over time");
    expect(html).toContain("per week");
    expect(html).toContain("Math topics");
    expect(html).toContain("Leah&#x27;s level in each");
    for (const area of ["Number and operations", "Fractions and decimals", "Patterns and algebra", "Shapes, measurement and data"]) expect(html).toContain(area);
    for (const word of ["Strong", "Getting there", "Needs help"]) if (word !== "Needs help") expect(html).toContain(word === "Strong" ? "pp-topic-row" : word);
  });
  it("draws one point per week on Week, labelled by Monday, never one per day", async () => {
    // The page reads the clock: Wednesday 4 November is in the week of Monday 2 November.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse("2026-11-04T18:00:00Z") });
    try {
      const html = await render();
      expect(html).toContain('aria-label="Skills mastered over time, per week: Oct 26 0, Nov 2 1"');
      // Two points in each of the two drawings (a phone's and a laptop's).
      expect(html.match(/<circle /g)!.length).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
  it("has no starting-test comparison, no percent, no U-level, no she or her, and no marks or skill map", async () => {
    const html = await render();
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\b(she|her|hers)\b/i);
    expect(text).not.toMatch(/\d\s*%|\bU\d+\b/);
    for (const absent of ["starting test", "Starting test", "this month vs", "Skill map", "Marks", "Change this mark", "pp-tile-name"]) expect(text + html).not.toContain(absent);
  });
  it("with no marked page it says progress starts after the first marked pages, with no chart", async () => {
    const html = await render({ overviewProgress: [] });
    expect(html).toContain("Progress starts after the first marked pages");
    expect(html).toContain("When Leah finishes Day 1, scan the pages.");
    expect(html).not.toContain("pp-chart");
    expect(html).not.toContain("Skills mastered over time");
    expect(html).not.toMatch(/\b(she|her|hers)\b/i);
  });
  it("offers Go to Scan only where the Scan tab is open", async () => {
    const delivered = { deliveries: [{ parentId: "p1", childId: "c1" }], overviewProgress: [] };
    expect(await render({ ...delivered, switches: { progress: true, maya: false, scanPages: true } })).toContain('href="/account/scan"');
    expect(await render(delivered)).not.toContain('href="/account/scan"');
  });
});

describe("the rules that already cover every account page", () => {
  const PARENT = "11111111-1111-4111-8111-111111111111";
  const LOCK = `${PARENT}.22222222-2222-4222-8222-222222222222`;
  it("sends this address back to the desk while the desk is open", () => {
    expect(deskGate("/account/progress/c1", LOCK, PARENT)).toBe("to-desk");
    expect(deskGate("/account/progress/c1", undefined, PARENT)).toBe("pass");
  });
  it("is under the proxy's account paths and the account layout's desk guard", () => {
    expect(readFileSync("src/proxy.ts", "utf8")).toContain('"/account/:path*"');
    expect(readFileSync("src/app/(product)/account/layout.tsx", "utf8")).toContain("<DeskGuard />");
    expect(import.meta.url).toContain("/(product)/account/(dashboard)/progress/");
  });
  it("loads no ad tags on this address", () => {
    expect(adsBlockedPath("/account/progress/c1")).toBe(true);
  });
});
