import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
const calls = vi.hoisted(() => ({ session: vi.fn(() => { throw new Error("A retired PDF route must read and sign nothing"); }) }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: calls.session, parentId: calls.session }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: calls.session }));
const requestPdf: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> = GET;
afterEach(() => vi.clearAllMocks());
it.each(["own-book", "other-family-book", "../workbook.pdf"])("returns no PDF, redirect, signer or family read for %s", async id => {
  const response = await requestPdf(new Request(`https://unicalearning.com/api/account/workbooks/${encodeURIComponent(id)}/pdf`), { params: Promise.resolve({ id }) });
  expect(response.status).toBe(410);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).not.toContain("https://");
  expect(calls.session).not.toHaveBeenCalled();
});
