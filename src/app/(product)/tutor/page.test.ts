import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import DeskPage from "./page";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { memoryWorkbookStore } from "@/lib/workbook-store-memory";
import type { DeliveryReceipt } from "@/lib/workbook-delivery";
import type { WorkbookStore } from "@/lib/workbook-content";
const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", BOOK = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ store: null as WorkbookStore | null, receipt: vi.fn(), sign: vi.fn(), chat: vi.fn(), notice: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({}), redirect: (path: string) => { throw Error(`REDIRECT ${path}`); } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "11111111-1111-4111-8111-111111111111.22222222-2222-4222-8222-222222222222" }) }) }));
vi.mock("@/lib/supabase-auth", () => ({ parentId: async () => PARENT, sessionClient: async () => ({
  from: (table: string) => { const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "children" ? { id: CHILD, first_name: "Leah", grade: "3", province: "BC" } : { postal: "V6B1A1", time_zone: "America/Vancouver" } }) }; return query; },
  storage: { from: () => ({ createSignedUrl: state.sign }) },
}) }));
vi.mock("@/lib/family-time-server", () => ({ loadFamilyProvince: async () => "BC" }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => state.store }));
vi.mock("@/lib/workbook-delivery-store", () => ({ workbookDeliveryStore: () => ({ receipt: state.receipt }) }));
vi.mock("@/lib/maya-notice-server", () => ({ mayaNoticeDue: async () => state.notice }));
vi.mock("@/lib/maya-chat-server", () => ({ deskChat: state.chat }));
const receipt: DeliveryReceipt = { workbookId: BOOK, parentId: PARENT, childId: CHILD, number: 1, deliveredAt: "2026-11-01T20:00:00Z", localTime: "2026-11-01T12:00", timeZone: "America/Vancouver", recordedAt: "2026-11-01T21:00:00Z", actorId: PARENT, auditId: 1 };
const page = (search: Record<string, string> = {}) => DeskPage({ searchParams: Promise.resolve(search) } as never);
const html = async (search?: Record<string, string>) => renderToStaticMarkup(await page(search));
beforeEach(async () => {
  vi.clearAllMocks(); state.notice = false;
  const store = memoryWorkbookStore({ children: [{ id: CHILD, parentId: PARENT }], now: () => new Date("2026-11-01T20:00:00Z") });
  expect((await store.write(sampleWorkbook({ workbookId: BOOK, childId: CHILD, parentId: PARENT, qrTokens: [1, 2, 3].map(p => `sample-token-0000000${p}`) }))).status).toBe("written");
  store.setStatus(BOOK, "shipped"); state.store = store;
  vi.spyOn(store, "workbook"); vi.spyOn(store, "page"); state.receipt.mockResolvedValue(receipt);
  state.sign.mockResolvedValue({ data: { signedUrl: "https://example.invalid/page.png" }, error: null });
  state.chat.mockResolvedValue({ usage: { used: 0, left: 60, resetsAt: 1800000000000, backAt: "Monday" }, note: null });
});
it("shows the awaiting-delivery desk without reading packages or signing an image and retains Leave and eligible chat", async () => {
  state.receipt.mockResolvedValue(null);
  const body = await html({ w: BOOK, p: "2", q: "1", pick: "1" });
  expect(body).toContain("Your workbook pages will open here after we confirm delivery.");
  expect(body).toContain("Leave"); expect(body).toContain('aria-label="Page and question number"');
  expect(body).toContain("Chat with Maya"); expect(body).toContain("60 left today");
  expect(body).not.toContain("Pick from my page"); expect(body).not.toContain("https://example.invalid/page.png");
  expect(state.store!.workbook).not.toHaveBeenCalled(); expect(state.store!.page).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
  expect(state.chat).toHaveBeenCalledOnce();
});
it.each([{ deliveredAt: "2999-01-01T00:00:00Z" }, { parentId: BOOK }, { childId: BOOK }, { workbookId: CHILD }, { number: 2 }])("keeps an invalid effective receipt closed: %j", async change => {
  state.receipt.mockResolvedValue({ ...receipt, ...change });
  expect(await html()).toContain("after we confirm delivery");
  expect(state.store!.workbook).not.toHaveBeenCalled(); expect(state.store!.page).not.toHaveBeenCalled(); expect(state.sign).not.toHaveBeenCalled();
});
it("keeps the notice and delivery message visible when Maya is unavailable or the weekly chat count is zero", async () => {
  state.receipt.mockResolvedValue(null); state.notice = true;
  let body = await html(); expect(body).toContain("after we confirm delivery"); expect(body).toContain("grown-up"); expect(state.chat).not.toHaveBeenCalled();
  state.notice = false; state.chat.mockResolvedValue({ usage: { used: 60, left: 0, resetsAt: 1800000000000, backAt: "Monday" }, note: null });
  body = await html(); expect(body).toContain("after we confirm delivery"); expect(body).toContain("Leave");
});
it("keeps the delivered page, picks and question crop through the real desk component without sending answers", async () => {
  const result = await page({ w: BOOK, p: "2", q: "1", pick: "1" });
  const body = renderToStaticMarkup(createElement("div", null, result));
  expect(body).toContain("Pick another question"); expect(body).toContain("Pick from my page"); expect(body).toContain("https://example.invalid/page.png");
  expect(result.props.areas).toHaveLength(4); expect(result.props.questions[0].crop).not.toBeNull(); expect(result.props.picked).toBe(1);
  expect(result.props.questions[0].text).toContain("268"); expect(JSON.stringify(result.props.questions)).not.toContain('"answer"');
  expect(state.sign).toHaveBeenCalledWith(`${PARENT}/${BOOK}/page-2.png`, 900);
});
it("returns to awaiting delivery if the receipt is retracted during the content read", async () => {
  state.receipt.mockResolvedValueOnce(receipt).mockResolvedValue(null);
  expect(await html()).toContain("after we confirm delivery"); expect(state.sign).not.toHaveBeenCalled();
});
it.each([
  ["never had a plan", { usage: null, note: null, planClosed: false }, "Chat and calls with Maya start soon.", "60 messages a day"],
  ["ended", { usage: null, note: "Chat with Maya is closed because your family's plan has ended. Ask a grown-up.", planClosed: true }, "Chat with Maya is closed because your family's plan has ended. Ask a grown-up.", "Closed"],
  ["payment failed", { usage: null, note: "Chat with Maya is paused because the last payment did not go through. Ask a grown-up.", planClosed: true }, "Chat with Maya is paused because the last payment did not go through. Ask a grown-up.", "Closed"],
])("tells the child about chat for a family whose plan state is %s, on the delivered page and while awaiting delivery", async (_, chat, line, label) => {
  state.chat.mockResolvedValue(chat);
  for (const receipt of [undefined, null]) {
    if (receipt === null) state.receipt.mockResolvedValue(null);
    const body = (await html()).replace(/&#x27;/g, "'");
    expect(body).toContain(line);
    expect(body).toContain(`<dd>${label}</dd>`);
    if (chat.planClosed) expect(body).not.toContain("start soon");
    expect(body).not.toContain("Grade 3 and up");
  }
});
it("an open plan shows the chat, with no closed line and no start-soon line", async () => {
  const body = await html();
  expect(body).toContain("<dd>60 left today</dd>");
  expect(body).not.toMatch(/Chat with Maya is (closed|paused)/);
  expect(body).not.toContain("start soon");
});
