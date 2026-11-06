import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import WorkbookAnswers from "./page";
import { deskGate } from "@/lib/desk";
const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", BOOK = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ parent: "11111111-1111-4111-8111-111111111111" as string | null, open: true, read: vi.fn(), source: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => state.parent }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: async () => state.open }));
vi.mock("@/lib/parent-workbook-answers-server", () => ({ parentWorkbookAnswerSource: state.source }));
vi.mock("@/lib/parent-workbook-answers", () => ({ readParentWorkbookAnswers: state.read }));
const page = () => WorkbookAnswers({ params: Promise.resolve({ child: CHILD, workbook: BOOK }) } as never);
beforeEach(() => { vi.clearAllMocks(); state.parent = PARENT; state.open = true; state.source.mockReturnValue({}); });
it("checks sign-in and release access on this direct route before it reads any answers", async () => {
  state.parent = null; await expect(page()).rejects.toThrow("REDIRECT /sign-in");
  state.parent = PARENT; state.open = false; await expect(page()).rejects.toThrow("NOT_FOUND");
  expect(state.source).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
});
it("passes the signed-in parent, child and workbook to the gated reader and refuses an unavailable key", async () => {
  state.read.mockResolvedValue(null);
  await expect(page()).rejects.toThrow("NOT_FOUND");
  expect(state.read).toHaveBeenCalledWith(expect.anything(), { parentId: PARENT, childId: CHILD, workbookId: BOOK }, expect.any(Number));
});
it("shows only the delivered answer projection and keeps the desk lock on the whole path", async () => {
  state.read.mockResolvedValue({ childId: CHILD, childName: "Leah", workbookId: BOOK, number: 1, pages: [{ number: 4, dayLabel: "Day 1", questions: [{ number: 2, kind: "fixed", answers: [{ part: 1, value: "42", alternatives: [] }], hasOpenWork: false }] }] });
  const html = renderToStaticMarkup(await page());
  expect(html).toContain("Question 2"); expect(html).toContain("42");
  expect(html).not.toMatch(/Download PDF|<img|package|PRIVATE/);
  expect(deskGate(`/account/workbooks/${CHILD}/answers/${BOOK}`, `${PARENT}.${CHILD}`, PARENT)).toBe("to-desk");
});
