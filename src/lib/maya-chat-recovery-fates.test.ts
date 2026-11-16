import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

const isPut = (c: unknown) => typeof c === "object" && c !== null && "op" in c && c.op === "put";

const ID = "55555555-5555-4555-8555-555555555555";
const MSG = "66666666-6666-4666-8666-666666666666";
const FATE = { batchId: `${ID}-b2`, fate: "skipped" as const };

beforeEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function setup(mode?: "pending" | "confirmed") {
  const f = await mayaWorkbookFixture();
  f.books.setStatus(f.ids.workbook, "shipped");
  let held = false;
  let releaseModel: () => void = () => {};
  let releaseSave: () => void = () => {};
  const checkpoint = f.seams.store.checkpoint!.bind(f.seams.store);
  const store = { ...f.seams.store, checkpoint: async (...args: Parameters<typeof checkpoint>) => {
    const saved = await checkpoint(...args);
    if (held && mode === "pending") await new Promise<void>(r => { releaseSave = r; });
    return saved;
  } };
  const model = conversationalFake({ ...(mode ? { stream: { chunk: 7, beforeEnd: () => held ? new Promise<void>(r => { releaseModel = r; }) : Promise.resolve() } } : {}), answer: () => reply("7 plus 9 is 16. Write 6 in the ones. What do we carry?", "guide", { draw: [{ offer: "digit", place: "ones" }] }) });
  local.seams = { ...f.seams, store, ...(mode ? { streamChat: true } : {}), tutorFamilies: true, model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer() } satisfies CallSeams;
  local.books = f.books;
  let recover: Record<string, unknown> = { status: "none" };
  let claim: Record<string, unknown> | (() => Record<string, unknown>) | null = null;
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
      return Response.json((typeof claim === "function" ? claim() : claim) ?? { status: "accepted", revision: args.p_revision, text: args.p_text, fates: args.p_fates ?? [] });
    }
    throw Error(`Unexpected database access: ${table}`);
  } } });
  const ctx = { db, parent: f.ids.parent, child: f.ids.child, name: "Iris", grade: 4, zone: "America/Vancouver" as const };
  const started = await runChat(ctx, { type: "start", id: ID, question: { source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 } });
  if (!started.chat) throw Error(`no chat: ${started.error}`);
  return { f, model, ctx, admitted, revision: started.chat.revision,
    recover: (r: Record<string, unknown>) => { recover = { status: "accepted", id: MSG, callId: ID, ...r }; },
    hold: () => { held = true; }, release: () => { held = false; releaseSave(); releaseModel(); },
    claim: (r: Record<string, unknown> | (() => Record<string, unknown>)) => { claim = r; } };
}

it("#1084: recovery applies the admitted skipped drawing before the next tutor brief and permits redraw", async () => {
  const s = await setup();
  const first = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Help me with the ones." });
  expect((s.model.briefs.at(-1) as unknown as { drawn: string[] }).drawn).not.toContain("digit:ones");
  const batch = first.chat!.batches.find(b => b.commands.some(isPut));
  expect(batch).toBeDefined();
  s.recover({ revision: first.chat!.revision, text: "Help me with 7 plus 9.", fates: [{ batchId: batch!.transactionId, fate: "skipped" }] });
  const r = await runChat(s.ctx, { type: "read", id: ID });
  const brief = s.model.briefs.at(-1) as unknown as { drawn: string[]; sent?: string[] };
  expect(brief.sent ?? []).not.toContain("digit:ones");
  expect(brief.drawn).not.toContain("digit:ones");
  expect(r.chat!.batches.filter(b => b.commands.some(isPut))).toHaveLength(2);
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

it.each([{}, [{ batchId: "x", fate: "unknown" }], Array(33).fill(FATE), [{ batchId: "x".repeat(65), fate: "shown" }]].map(fates => [fates]))("#1084: malformed stored fates stop recovery: %j", async fates => {
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

it("#1084: duplicate concurrent requests run the admitted child turn once", async () => {
  const s = await setup();
  let claims = 0;
  s.claim(() => ++claims === 1 ? { status: "accepted", revision: s.revision, text: "Original child words.", fates: [] } : { status: "busy", admitted: true });
  const action = { type: "child" as const, id: ID, messageId: MSG, revision: s.revision, text: "Original child words." };
  const r = await Promise.all([runChat(s.ctx, action), runChat(s.ctx, action)]);
  expect(r.every(x => x.admission === "accepted")).toBe(true);
  expect(s.model.briefs).toHaveLength(1);
  const saved = (await s.f.store.get(ID))!;
  expect(saved.live!.text.session.turns.filter(t => t.speaker === "child")).toHaveLength(1);
});

for (const mode of ["pending", "confirmed"] as const) {
  it(`#1084: ${mode} streamed recovery keeps original text and skipped fates`, async () => {
    const s = await setup(mode);
    const first = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Help me with the ones." });
    const batch = first.chat!.batches.find(b => b.commands.some(isPut))!;
    expect(batch).toBeDefined();
    const fates = [{ batchId: batch.transactionId, fate: "skipped" as const }];
    s.hold();
    const heard = vi.fn();
    const running = runChat(s.ctx, { type: "child", id: ID, messageId: "77777777-7777-4777-8777-777777777777", revision: first.chat!.revision, text: "Help me with 7 plus 9.", fates }, { say: { part: heard } });
    try {
      await vi.waitFor(async () => {
        const log = (await s.f.store.get(ID))!.live!.text.log!;
        expect(log.map(e => e.kind)).toContain(mode === "pending" ? "part_pending" : "part_confirmed");
      });
      const record = (await s.f.store.get(ID))!;
      const noModel = conversationalFake({ answer: () => { throw Error("Recovery must not ask the model"); } });
      local.seams = { ...(local.seams as CallSeams), model: () => noModel };
      await s.f.store.update(ID, record.revision, {});
      s.recover({ revision: record.revision + 1, text: "Help me with 7 plus 9.", fates });
      const r = await runChat(s.ctx, { type: "read", id: ID });
      expect(r.chat!.transcript.filter(t => t.speaker === "child" && t.text === "Help me with 7 plus 9.")).toHaveLength(1);
      expect(noModel.briefs).toHaveLength(0);
      const saved = (await s.f.store.get(ID))!;
      expect(saved.trace!.board.find(b => b.transactionId === batch.transactionId)?.fate).toBe("skipped");
      expect(saved.outcome?.reason).toBe("technical_issue");
    } finally { s.release(); await running; }
  });
}

it("#1084: duplicate incoming batch IDs persist only the first validated fate", async () => {
  const s = await setup();
  await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Hello", fates: [FATE, { ...FATE, fate: "shown" }] });
  expect(s.admitted[0].p_fates).toEqual([FATE]);
});

it("#1084: an expired retry uses the first report even when its replacement claims the drawing was shown", async () => {
  const s = await setup();
  const first = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: s.revision, text: "Help me with the ones." });
  const batch = first.chat!.batches.find(b => b.commands.some(isPut))!;
  s.claim({ status: "accepted", revision: first.chat!.revision, text: "Original child words.", fates: [{ batchId: batch.transactionId, fate: "skipped" }] });
  const r = await runChat(s.ctx, { type: "child", id: ID, messageId: MSG, revision: first.chat!.revision, text: "Replacement words.", fates: [{ batchId: batch.transactionId, fate: "shown" }] });
  const brief = s.model.briefs.at(-1) as unknown as { drawn: string[]; sent?: string[] };
  expect(brief.drawn).not.toContain("digit:ones");
  expect(brief.sent ?? []).not.toContain("digit:ones");
  expect(r.chat!.transcript.filter(t => t.speaker === "child").at(-1)?.text).toBe("Original child words.");
  expect(r.chat!.batches.filter(b => b.commands.some(isPut))).toHaveLength(2);
});
