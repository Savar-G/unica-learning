import { beforeEach, expect, it, vi } from "vitest";
const { gate, run } = vi.hoisted(() => ({ gate: vi.fn(), run: vi.fn() }));
vi.mock("@/lib/desk-chat-request", () => ({ deskChatContext: gate }));
vi.mock("@/lib/maya-chat-server", () => ({ runChat: run }));
import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const book = "22222222-2222-4222-8222-222222222222";
const typed = { type: "start", id, workbookId: book, reference: "page 3, number 3" };
const request = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/desk/chat", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); gate.mockResolvedValue({ ok: true, ctx: { child: "selected-child" } }); run.mockResolvedValue({ chat: null }); });

it("passes the typed reference under the server's selected-child context", async () => {
  expect((await POST(request(typed))).status).toBe(200);
  expect(run).toHaveBeenCalledWith({ child: "selected-child" }, typed);
});
it.each([
  { ...typed, question: { source: "workbook", workbookId: book, page: 3, question: 1 } },
  { ...typed, workbookId: "guessed" }, { ...typed, reference: "x".repeat(101) },
  { type: "start", id, question: { source: "assessment", workbookId: book, page: 3, question: 1 } },
])("rejects an invalid or competing selection before the desk check", async body => {
  expect((await POST(request(body))).status).toBe(400);
  expect(gate).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it("rejects a foreign origin before the desk check", async () => {
  expect((await POST(request(typed, "https://other.test"))).status).toBe(403);
  expect(gate).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it.each(["signed_out", "forbidden", "unavailable"])("preserves the %s desk refusal before selection", async error => {
  gate.mockResolvedValue({ ok: false, error, status: 403 });
  expect((await POST(request(typed))).status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
