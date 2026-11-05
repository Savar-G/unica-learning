import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { MAYA_NOTICE, MAYA_NOTICE_VERSION, callNeedsNotice, mayaNotice, noticeDue, type NoticeStore } from "@/lib/maya-notice";
import { memoryNoticeStore } from "@/lib/maya-notice-memory";
import { noticeStore } from "@/lib/maya-notice-store";

const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "44444444-4444-4444-8444-444444444444";

/** The Supabase store on a fake PostgREST that keeps the table's primary key. */
function supabaseStore(): NoticeStore {
  const rows: Record<string, string>[] = [];
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "POST") {
      const row = JSON.parse(String(init.body)) as Record<string, string>;
      if (rows.some((r) => r.parent_id === row.parent_id && r.notice_version === row.notice_version)) {
        return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
      }
      rows.push({ ...row, accepted_at: "2026-11-05T12:00:00+00:00" });
      return new Response(null, { status: 201 });
    }
    const parent = url.searchParams.get("parent_id")?.replace("eq.", "");
    const version = url.searchParams.get("notice_version")?.replace("eq.", "");
    return Response.json(rows.filter((r) => r.parent_id === parent && r.notice_version === version));
  } } });
  return noticeStore(db);
}

describe.each([["memory", () => memoryNoticeStore()], ["supabase", supabaseStore]] as const)("the Maya notice on the %s store", (_name, makeStore) => {
  it("has no agreement until a parent agrees, and then saves who and which version", async () => {
    const store = makeStore();
    const notice = mayaNotice(store);
    expect(await notice.accepted(PARENT)).toBe(false);
    expect(await notice.accept(PARENT, PARENT, MAYA_NOTICE_VERSION)).toBe("saved");
    expect(await notice.accepted(PARENT)).toBe(true);
    expect(await notice.acceptance(PARENT)).toMatchObject({ parentId: PARENT, acceptedBy: PARENT, version: MAYA_NOTICE_VERSION, acceptedAt: expect.any(String) });
  });

  it("keeps one family's agreement from covering another", async () => {
    const notice = mayaNotice(makeStore());
    await notice.accept(PARENT, PARENT, MAYA_NOTICE_VERSION);
    expect(await notice.accepted(OTHER)).toBe(false);
  });

  it("asks again when the notice changes: an older agreement does not cover a new version", async () => {
    const store = makeStore();
    await mayaNotice(store, "v1").accept(PARENT, PARENT, "v1");
    expect(await mayaNotice(store, "v1").accepted(PARENT)).toBe(true);
    expect(await mayaNotice(store, "v2").accepted(PARENT)).toBe(false);
  });

  it("saves nothing from a screen that shows an older version or none", async () => {
    const notice = mayaNotice(makeStore(), "v2");
    expect(await notice.accept(PARENT, PARENT, "v1")).toBe("old_version");
    expect(await notice.accept(PARENT, PARENT, null)).toBe("old_version");
    expect(await notice.accepted(PARENT)).toBe(false);
  });

  it("keeps the first agreement when a parent agrees twice", async () => {
    const store = makeStore();
    const notice = mayaNotice(store);
    await notice.accept(PARENT, PARENT, MAYA_NOTICE_VERSION);
    const first = await notice.acceptance(PARENT);
    expect(await notice.accept(PARENT, PARENT, MAYA_NOTICE_VERSION)).toBe("saved");
    expect(await notice.acceptance(PARENT)).toEqual(first);
  });
});

describe("which calls need the notice", () => {
  it("exempts only an admin test call, so a later kind is closed", () => {
    expect(callNeedsNotice("admin_test")).toBe(false);
    for (const kind of ["chat", "family", "demo", ""]) expect(callNeedsNotice(kind)).toBe(true);
  });
});

describe("when a family sees the notice", () => {
  const open = (value: boolean) => vi.fn(async () => value);

  it("shows it when Maya is open and the family has not agreed", async () => {
    expect(await noticeDue(PARENT, mayaNotice(memoryNoticeStore()), open(true))).toBe(true);
  });

  it("does not show it when Maya is closed to the family", async () => {
    expect(await noticeDue(PARENT, mayaNotice(memoryNoticeStore()), open(false))).toBe(false);
  });

  it("does not ask the plan check for a family that agreed", async () => {
    const notice = mayaNotice(memoryNoticeStore());
    await notice.accept(PARENT, PARENT, MAYA_NOTICE_VERSION);
    const check = open(true);
    expect(await noticeDue(PARENT, notice, check)).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it("shows nothing when a check fails, and the agreement check itself still fails closed", async () => {
    const store = memoryNoticeStore();
    store.fail(true);
    expect(await noticeDue(PARENT, mayaNotice(store), open(true))).toBe(false);
    await expect(mayaNotice(store).accepted(PARENT)).rejects.toThrow();
    store.fail(false);
    expect(await noticeDue(PARENT, mayaNotice(store), vi.fn(async () => { throw new Error("Stripe"); }))).toBe(false);
  });
});

describe("the notice text", () => {
  const text = MAYA_NOTICE.map((p) => `${p.title} ${p.text}`).join(" ");

  it("names no company: names stay in the privacy disclosure", () => {
    expect(text).not.toMatch(/openrouter|anthropic|claude|supabase|resend|livekit|assemblyai|inworld|stripe/i);
  });

  it("says Maya is an AI, what we keep, that a chat has no audio, and the limit", () => {
    expect(text).toMatch(/Maya is an AI, not a person/);
    expect(text).toMatch(/We keep each chat, a note about it and a learning record/);
    expect(text).toMatch(/A chat has no audio/);
    expect(text).toMatch(/60 messages a day/);
    expect(text).toMatch(/Chat is for Grade 3 and up/);
  });

  it("says the chat can go to the AI after it ends, that other details can remain, and the recap's limit", () => {
    expect(text).toMatch(/After a chat ends, we can also send the chat to the AI company/);
    expect(text).toMatch(/other personal details your child typed can remain/);
    expect(text).toMatch(/newest 10 chats or calls across your family/);
    expect(text).toMatch(/stores our records/);
    expect(text).toMatch(/sends our email/);
  });
});
