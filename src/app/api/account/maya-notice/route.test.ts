import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAYA_NOTICE_VERSION, mayaNotice } from "@/lib/maya-notice";
import { memoryNoticeStore } from "@/lib/maya-notice-memory";

// The parent's agreement (#529), through the route's POST export. Who agreed comes from the session, and a device with
// an open desk cannot agree, because the child is at that device.

const PARENT = "11111111-1111-4111-8111-111111111111";
const FORGED = "99999999-9999-4999-8999-999999999999";
const CHILD = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({ parent: null as string | null, cookie: undefined as string | undefined, notice: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => state.parent, adminClient: () => null }));
vi.mock("@/lib/maya-notice-server", () => ({ serverMayaNotice: () => state.notice }));

const { POST } = await import("@/app/api/account/maya-notice/route");
const { lockCookie } = await import("@/lib/desk");

const post = (fields: Record<string, string>, origin = "http://localhost") => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return POST(new Request("http://localhost/api/account/maya-notice", { method: "POST", headers: { origin }, body }));
};

describe("POST /api/account/maya-notice", () => {
  let store: ReturnType<typeof memoryNoticeStore>;
  beforeEach(() => {
    store = memoryNoticeStore();
    state.parent = PARENT;
    state.cookie = undefined;
    state.notice = mayaNotice(store);
  });

  it("saves the signed-in parent as who agreed, and ignores any id in the form", async () => {
    const res = await post({ version: MAYA_NOTICE_VERSION, parent: FORGED, accepted_by: FORGED });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/account/maya-notice?saved=1");
    expect(store.rows()).toMatchObject([{ parentId: PARENT, acceptedBy: PARENT, version: MAYA_NOTICE_VERSION }]);
  });

  it("keeps where the parent was going, so the desk opens next", async () => {
    const res = await post({ version: MAYA_NOTICE_VERSION, child: CHILD, p: "3", from: "qr" });
    const to = new URL(res.headers.get("location")!);
    expect(Object.fromEntries(to.searchParams)).toEqual({ child: CHILD, p: "3", from: "qr", saved: "1" });
  });

  it("refuses a device with an open desk: a child must not agree", async () => {
    state.cookie = lockCookie(PARENT, CHILD);
    const res = await post({ version: MAYA_NOTICE_VERSION });
    expect(res.status).toBe(423);
    expect(store.rows()).toEqual([]);
  });

  it("refuses another site and a signed-out visitor", async () => {
    expect((await post({ version: MAYA_NOTICE_VERSION }, "https://other.example")).status).toBe(403);
    state.parent = null;
    const res = await post({ version: MAYA_NOTICE_VERSION });
    expect(res.headers.get("location")).toContain("/sign-in");
    expect(store.rows()).toEqual([]);
  });

  it("saves nothing from an older screen, and asks the parent to read again", async () => {
    const res = await post({ version: "2020-01-01" });
    expect(res.headers.get("location")).toContain("changed=1");
    expect(store.rows()).toEqual([]);
  });

  it("says so when the save fails or the secret key is missing", async () => {
    store.fail(true);
    expect((await post({ version: MAYA_NOTICE_VERSION })).headers.get("location")).toContain("error=1");
    state.notice = null;
    expect((await post({ version: MAYA_NOTICE_VERSION })).headers.get("location")).toContain("error=1");
  });
});
