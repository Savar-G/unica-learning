import { beforeEach, describe, expect, it, vi } from "vitest";

// Opening the desk (#301) and the Maya notice (#529), through the route's POST export. A family with Maya open reads the
// notice on the parent's side, before the device becomes the child's desk.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const BOOK = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ due: false, cookie: undefined as string | undefined, pin: true as boolean | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: CHILD } }) }) }) }) }),
  parentId: async () => PARENT,
}));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => state.pin }));
vi.mock("@/lib/maya-notice-server", () => ({ mayaNoticeDue: async () => state.due }));

const { POST } = await import("@/app/api/desk/open/route");
const { DESK_COOKIE, lockCookie } = await import("@/lib/desk");

const post = (fields: Record<string, string>) => {
  const body = new FormData();
  body.set("child", CHILD);
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return POST(new Request("http://localhost/api/desk/open", { method: "POST", headers: { origin: "http://localhost" }, body }));
};
const opened = (res: Response) => (res.headers.get("set-cookie") ?? "").includes(`${DESK_COOKIE}=`);

describe("POST /api/desk/open with the Maya notice", () => {
  beforeEach(() => { state.due = false; state.cookie = undefined; state.pin = true; });

  it("opens the desk when no notice is due", async () => {
    const res = await post({});
    expect(new URL(res.headers.get("location")!).pathname).toBe("/tutor");
    expect(opened(res)).toBe(true);
  });

  it("sends the parent to the notice first, and does not make the device a desk", async () => {
    state.due = true;
    const res = await post({ w: BOOK, p: "3", from: "qr" });
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/account/maya-notice");
    expect(Object.fromEntries(to.searchParams)).toEqual({ child: CHILD, w: BOOK, p: "3", from: "qr" });
    expect(opened(res)).toBe(false);
  });

  it("opens the desk without Maya when the parent chooses that", async () => {
    state.due = true;
    const res = await post({ maya: "later" });
    expect(new URL(res.headers.get("location")!).pathname).toBe("/tutor");
    expect(opened(res)).toBe(true);
  });

  it("asks for the PIN before the notice", async () => {
    state.due = true;
    state.pin = false;
    expect((await post({})).headers.get("location")).toContain("/account/pin");
  });

  it("does not stop an open desk for the notice", async () => {
    state.due = true;
    state.cookie = lockCookie(PARENT, CHILD);
    expect(new URL((await post({})).headers.get("location")!).pathname).toBe("/tutor");
  });
});
