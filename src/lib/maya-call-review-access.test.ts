import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { admin, calls } = vi.hoisted(() => ({ admin: vi.fn(), calls: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: admin }));
vi.mock("@/lib/maya-call-server", () => ({ serverMayaCalls: calls, childFirstName: vi.fn() }));
import { GET, POST } from "@/app/api/admin/maya/calls/[id]/route";

it.each(["signed out", "parent"])("denies saved call reads and writes for %s before the service client is used", async () => {
  admin.mockResolvedValue(null);
  calls.mockClear();
  const ctx = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000334" }) };
  expect((await GET(new Request("http://localhost/api/admin/maya/calls/test"), ctx)).status).toBe(404);
  expect((await POST(new Request("http://localhost/api/admin/maya/calls/test", { method: "POST" }), ctx)).status).toBe(404);
  expect(calls).not.toHaveBeenCalled();
});
