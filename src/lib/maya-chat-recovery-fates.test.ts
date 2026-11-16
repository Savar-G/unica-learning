import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { CallSeams } from "@/lib/maya-call";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { MAYA_NOTICE_VERSION } from "@/lib/maya-notice";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";

vi.mock("server-only", () => ({}));
const local = vi.hoisted(() => ({ books: null as unknown, seams: null as unknown }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => local.books }));
vi.mock("@/lib/maya-call-store", () => ({ mayaCallStore: () => (local.seams as CallSeams).store }));
vi.mock("@/lib/maya-call-seams", () => ({ callSeams: () => local.seams }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
import { runChat } from "@/lib/maya-chat-server";

const ID = "55555555-5555-4555-8555-555555555555";
const MSG = "66666666-6666-4666-8666-666666666666";
const FATE = { batchId: `${ID}-b2`, fate: "skipped" as const };

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function setup() {
  const f = await mayaWorkbookFixture();
  f.books.setStatus(f.ids.workbook, "shipped");
  const model = conversationalFake({ answer: () => reply("7 plus 9 is 16. Write 6 in the ones. What do we carry?", "guide", { draw: [{ offer: "digit", place: "ones" }] }) });
  local.seams = { ...f.seams, tutorFamilies: true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer() } satisfies CallSeams;
  local.books = f.books;
  let recover: Record<string, unknown> = { status: "none" };
  let claim: Record<string, unknown> | null = null;
  const admitted: Record<string, unknown>[] = [];
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const table = new URL(String(input)).pathname.split("/").pop()!;
    if (table === "maya_notice_acceptances") return Response.json([{ notice_version: MAYA_NOTICE_VERSION }]);
    if (table === "maya_chat_messages") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    if (table === "workbook_pages") return Response.json({ id: "page-four" });
    if (table === "recover_maya_chat_message") { const r = recover; recover = { status: "none" }; return Response.json(r); }
    if (table === "take_maya_chat_message") {
      const args = JSON.parse(String(init?.body));
      admitted.push(args);
      return Response.json(claim ?? { status: "accepted", revision: args.p_revision, text: args.p_text, fates: args.p_fates ?? [] });
    }
    throw Error(`Unexpected database access: ${table}`);
  } } });
  const ctx = { db, parent: f.ids.parent, child: f.ids.child, name: "Iris", grade: 4, zone: "America/Vancouver" as const };
  const started = await runChat(ctx, { type: "start", id: ID, question: { source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 } });
  if (!started.chat) throw Error(`no chat: ${started.error}`);
  return { f, model, ctx, admitted, revision: started.chat.revision,
    recover: (r: Record<string, unknown>) => { recover = { status: "accepted", id: MSG, callId: ID, ...r }; },
    claim: (r: Record<string, unknown>) => { claim = r; } };
}

it("#1084: recovery applies the admitted skipped drawing before the next tutor brief and permits redraw", async () => {
  const s = await setup();
  const first = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Help me with the ones." });
  expect((s.model.briefs.at(-1) as unknown as { drawn: string[] }).drawn).not.toContain("digit:ones");
  const batch = first.chat!.batches.find(b => b.commands.some(c => c.op === "put"));
  expect(batch).toBeDefined();
  s.recover({ revision: first.chat!.revision, text: "I still need help.", fates: [{ batchId: batch!.transactionId, fate: "skipped" }] });
  const r = await runChat(s.ctx, { type: "read", id: ID });
  const brief = s.model.briefs.at(-1) as unknown as { drawn: string[]; sent?: string[] };
  expect(brief.sent ?? []).not.toContain("digit:ones");
  expect(brief.drawn).not.toContain("digit:ones");
  expect(r.chat!.batches.filter(b => b.commands.some(c => c.op === "put"))).toHaveLength(2);
});

it("#1084: normal admission persists validated fates and uses the admitted payload, not a retry's replacement", async () => {
  const s = await setup();
  s.claim({ status: "accepted", revision: s.revision, text: "Original child words.", fates: [FATE] });
  const r = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Replacement words.", fates: [FATE] });
  expect(s.admitted[0].p_fates).toEqual([FATE]);
  expect(r.chat!.transcript.filter(t => t.speaker === "child").map(t => t.text)).toEqual(["Original child words."]);
});

for (const fates of [undefined, null, []]) {
  it(`#1084: legacy recovery without a report remains readable (${String(fates)})`, async () => {
    const s = await setup();
    s.recover({ revision: s.revision, text: "Original child words.", fates });
    const r = await runChat(s.ctx, { type: "read", id: ID });
    expect(r.chat!.transcript.filter(t => t.speaker === "child").map(t => t.text)).toEqual(["Original child words."]);
  });
}

it.each([{}, [{ batchId: "x", fate: "unknown" }], Array(33).fill(FATE), [{ batchId: "x".repeat(65), fate: "shown" }]])("#1084: malformed stored fates stop recovery: %j", async fates => {
  const s = await setup();
  s.recover({ revision: s.revision, text: "Original child words.", fates });
  await expect(runChat(s.ctx, { type: "read", id: ID })).rejects.toThrow("Chat payload cannot be read");
  expect(s.model.briefs).toHaveLength(0);
});

it("#1084: invalid incoming reports cannot admit a message", async () => {
  const s = await setup();
  const r = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Hello", fates: [{ batchId: "x", fate: "unknown" as never }] });
  expect(r).toMatchObject({ error: "invalid", admission: "refused" });
  expect(s.admitted).toHaveLength(0);
  expect(s.model.briefs).toHaveLength(0);
});
