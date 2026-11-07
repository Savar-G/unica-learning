import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SchedulePage from "./page";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ parent: "11111111-1111-4111-8111-111111111111" as string | null, dashboard: true, deletion: false, desk: undefined as string | undefined, kind: "waiting", read: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/schedule", redirect: (path: string) => { throw new Error(`REDIRECT ${path}`); }, notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.desk ? { value: state.desk } : undefined }) }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => state.parent, sessionClient: async () => ({}) }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => state.dashboard ? { children: [{ id: "c1" }, { id: "c2" }], remembered: "c2", deletionRequested: state.deletion } : null }));
vi.mock("@/lib/parent-schedule-server", () => ({ parentSchedule: async (...args: unknown[]) => { state.read(...args); return { kind: state.kind, child: { id: args[1], firstName: "Kai", parentId: state.parent } }; } }));
const render = async (query = {}) => renderToStaticMarkup(await SchedulePage({ searchParams: Promise.resolve(query) } as never));
beforeEach(() => { state.parent = "11111111-1111-4111-8111-111111111111"; state.dashboard = true; state.deletion = false; state.desk = undefined; state.kind = "waiting"; state.read.mockClear(); });

it("returns to the plain schedule after sign-in and checks dashboard, Desk and deletion before reading", async () => {
  state.parent = null;
  await expect(render()).rejects.toThrow("REDIRECT /sign-in?next=%2Faccount%2Fschedule");
  state.parent = "11111111-1111-4111-8111-111111111111"; state.dashboard = false;
  await expect(render()).rejects.toThrow("NOT_FOUND");
  state.dashboard = true; state.desk = `${state.parent}.22222222-2222-4222-8222-222222222222`;
  await expect(render()).rejects.toThrow("REDIRECT /tutor");
  state.desk = undefined; state.deletion = true;
  await expect(render()).rejects.toThrow("REDIRECT /family-deleted");
  expect(state.read).not.toHaveBeenCalled();
});
it("uses the owned remembered child and refuses explicit foreign children and books", async () => {
  expect(await render()).toContain("No printed workbook yet");
  expect(state.read).toHaveBeenLastCalledWith(state.parent, "c2", null);
  await render({ child: "c1" }); expect(state.read).toHaveBeenLastCalledWith(state.parent, "c1", null);
  await expect(render({ child: "foreign" })).rejects.toThrow("NOT_FOUND");
  await expect(render({ child: ["c1", "c2"] })).rejects.toThrow("NOT_FOUND");
  state.kind = "not-found"; await expect(render({ child: "c1", book: "foreign-book" })).rejects.toThrow("NOT_FOUND");
  state.kind = "unavailable"; expect(await render()).toContain("The schedule is unavailable");
});
