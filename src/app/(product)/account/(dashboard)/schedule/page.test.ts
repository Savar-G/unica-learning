import { beforeEach, expect, it, vi } from "vitest";
import SchedulePage from "./page";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ parent: "11111111-1111-4111-8111-111111111111" as string | null, dashboard: true, deletion: false, desk: undefined as string | undefined, children: [{ id: "c1" }, { id: "c2" }] }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.desk ? { value: state.desk } : undefined }) }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => state.parent, sessionClient: async () => ({}) }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard ? { children: state.children, remembered: "c2", deletionRequested: state.deletion } : null }));
const go = async (query = {}) => { try { await SchedulePage({ searchParams: Promise.resolve(query) } as never); } catch (error) { return (error as Error).message; } return "rendered"; };
beforeEach(() => { state.parent = "11111111-1111-4111-8111-111111111111"; state.dashboard = true; state.deletion = false; state.desk = undefined; state.children = [{ id: "c1" }, { id: "c2" }]; });

it("returns to the old address after sign-in and checks dashboard, Desk and deletion first", async () => {
  state.parent = null;
  expect(await go()).toBe("REDIRECT /sign-in?next=%2Faccount%2Fschedule");
  state.parent = "11111111-1111-4111-8111-111111111111"; state.dashboard = false;
  expect(await go()).toBe("NOT_FOUND");
  state.dashboard = true; state.desk = `${state.parent}.22222222-2222-4222-8222-222222222222`;
  expect(await go()).toBe("REDIRECT /tutor");
  state.desk = undefined; state.deletion = true;
  expect(await go()).toBe("REDIRECT /family-deleted");
});

it("sends a family on the dashboard to the child's Workbooks page: the remembered child, or the one named", async () => {
  expect(await go()).toBe("REDIRECT /account/workbooks/c2");
  expect(await go({ child: "c1" })).toBe("REDIRECT /account/workbooks/c1");
});

it("sends a ?book= link to that book's page, which refuses a book that is not the family's", async () => {
  expect(await go({ child: "c1", book: "book-7" })).toBe("REDIRECT /account/workbooks/c1/book/book-7");
  expect(await go({ book: "book 7/x" })).toBe("REDIRECT /account/workbooks/c2/book/book%207%2Fx");
});

it("refuses an explicit foreign child, a repeated query and an empty book, and sends a family with no child home", async () => {
  expect(await go({ child: "foreign" })).toBe("NOT_FOUND");
  expect(await go({ child: ["c1", "c2"] })).toBe("NOT_FOUND");
  expect(await go({ book: ["a", "b"] })).toBe("NOT_FOUND");
  expect(await go({ child: "c1", book: "" })).toBe("NOT_FOUND");
  state.children = [];
  expect(await go()).toBe("REDIRECT /account");
  expect(await go({ book: "b" })).toBe("NOT_FOUND");
});
