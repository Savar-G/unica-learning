import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
import { runChat } from "@/lib/maya-chat-server";
import { MAYA_NOTICE_VERSION } from "@/lib/maya-notice";

// #529: a chat does not start without the family's agreement, in server code, whatever the screen shows. The positive
// control is that the same request with an agreement goes on to read the workbook.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const CHAT = "33333333-3333-4333-8333-333333333333";
const BOOK = "44444444-4444-4444-8444-444444444444";

function run(agreement: "none" | "yes" | "fail") {
  const reads: string[] = [];
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").pop()!;
    reads.push(table);
    if (table === "maya_chat_messages") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    if (table === "maya_notice_acceptances") {
      if (agreement === "fail") return Response.json({ message: "down" }, { status: 500 });
      expect(url.searchParams.get("notice_version")).toBe(`eq.${MAYA_NOTICE_VERSION}`);
      return Response.json(agreement === "yes" ? [{ parent_id: PARENT, notice_version: MAYA_NOTICE_VERSION, accepted_by: PARENT, accepted_at: "2026-11-05T12:00:00+00:00" }] : []);
    }
    if (init?.method && init.method !== "GET" && init.method !== "HEAD") throw new Error(`Unexpected write to ${table}`);
    return Response.json([]);
  } } });
  const reply = runChat({ db, parent: PARENT, child: CHILD, name: "Leah", zone: "America/Vancouver" as never }, {
    type: "start", id: CHAT, question: { source: "workbook", workbookId: BOOK, page: 1, question: 1 },
  });
  return { reply, reads };
}

describe("a chat start and the Maya notice", () => {
  it("refuses a family with no agreement before it reads the workbook or starts a chat", async () => {
    const { reply, reads } = run("none");
    expect(await reply).toMatchObject({ chat: null, error: "notice_required", admission: "refused" });
    expect(reads).not.toContain("workbooks");
  });

  it("goes on past the check for a family that agreed", async () => {
    const { reply, reads } = run("yes");
    expect((await reply).error).toBe("not_found");
    expect(reads).toContain("workbooks");
  });

  it("fails closed when the agreement cannot be read", async () => {
    const { reply, reads } = run("fail");
    await expect(reply).rejects.toThrow("maya notice read");
    expect(reads).not.toContain("workbooks");
  });
});
