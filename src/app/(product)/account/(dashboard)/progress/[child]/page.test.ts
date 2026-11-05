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
vi.mock("next/navigation", () => ({
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
    { parentId: "p1", childId: "c1", standard: "3.1", correct: 2, total: 2, at: "2026-10-30T18:00:00Z" },
    { parentId: "p1", childId: "c1", standard: "3.2", correct: 0, total: 4, at: "2026-10-30T18:00:00Z" },
  ],
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
  it("shows the map with the four state words, the areas and the child's name", async () => {
    const html = await render();
    expect(html).toContain("Leah&#x27;s progress");
    expect(html).toContain("BC Grade 3 math skills, the level Leah works at.");
    for (const word of ["Mastered", "Working on", "Needs review", "Not started"]) expect(html).toContain(word);
    for (const area of ["Number and operations", "Fractions and decimals", "Patterns and algebra", "Shapes, measurement and data"]) expect(html).toContain(area);
    expect(html).toContain("Number concepts to 1000");
    expect(html).toContain('aria-haspopup="dialog"');
  });
  it("names no U-level, percent, count of wrong answers, she or her, and no marks section", async () => {
    const text = (await render()).replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\b(she|her|hers)\b/i);
    expect(text).not.toMatch(/\d\s*%|\bU\d+\b/);
    for (const absent of ["What we", "Marks", "Change this mark", "Maya", "Pages"]) expect(text).not.toContain(absent);
  });
  it("marks a tile from another grade with its grade", async () => {
    const html = await render({
      workbooks: [{ parentId: "p1", childId: "c1", number: 1, status: "shipped" }],
      questions: [{ parentId: "p1", workbookId: "wb-c1-1", standard: "2.1" }],
    });
    expect(html).toContain("Working on · Grade 2");
  });
  it("says one line when there is no map, with no empty chart", async () => {
    const html = await render({ tests: [], reports: [], results: [], skillTests: [] });
    expect(html).toContain("Leah&#x27;s skill map appears once a test report is ready.");
    expect(html).not.toContain("pp-areas");
  });
  it("keeps the map with the report's note on an unreliable test, and says an Early sign", async () => {
    const html = await render({ results: [{ parentId: "p1", childId: "c1", assessmentId: "t1", level: { working: 3, top: 3, certainty: "early-sign", confidence: "low" } as never, answers: [], unreliable: true }] });
    expect(html).toContain("The last test may not show Leah&#x27;s level reliably");
    expect(html).toContain("This level is an Early sign");
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
