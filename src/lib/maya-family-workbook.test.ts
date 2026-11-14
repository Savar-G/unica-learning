import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { CallSeams } from "@/lib/maya-call";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { MAYA_NOTICE_VERSION } from "@/lib/maya-notice";
import { checkQuestionPackage, workedSteps } from "@/lib/question-package";
import { deskView } from "@/lib/desk";

vi.mock("server-only", () => ({}));
const local = vi.hoisted(() => ({ books: null as unknown, seams: null as unknown }));
vi.mock("@/lib/workbook-store", () => ({ workbookStore: () => local.books }));
vi.mock("@/lib/maya-call-store", () => ({ mayaCallStore: () => (local.seams as CallSeams).store }));
vi.mock("@/lib/maya-call-seams", () => ({ callSeams: () => local.seams }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/stripe", () => ({ stripe: () => null }));
import { runChat, type ChatAction } from "@/lib/maya-chat-server";

const ID = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";
beforeEach(() => { vi.restoreAllMocks(); });

async function setup() {
  const f = await mayaWorkbookFixture();
  f.books.setStatus(f.ids.workbook, "shipped");
  local.books = f.books; local.seams = f.seams;
  const reads: string[] = [];
  let notice = true, pageExists = true, recovering = false;
  const db = createClient<Database>("https://test.invalid", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input)), table = url.pathname.split("/").pop()!;
    reads.push(table);
    if (table === "maya_notice_acceptances") return Response.json(notice ? [{ parent_id: f.ids.parent, notice_version: MAYA_NOTICE_VERSION, accepted_by: f.ids.parent, accepted_at: "2026-11-06T12:00:00Z" }] : []);
    if (table === "maya_chat_messages") return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    if (table === "workbook_pages") return Response.json(pageExists && [f.ids.workbook, OTHER].some(id => url.searchParams.get("workbook_id") === `eq.${id}`) && url.searchParams.get("page_number") === "eq.4" ? { id: "page-four" } : null);
    if (table === "recover_maya_chat_message") {
      if (!recovering) return Response.json({ status: "none" });
      recovering = false;
      const old = (await f.store.get(ID))!;
      await f.store.update(ID, old.revision, {});
      return Response.json({ status: "accepted", id: OTHER, callId: ID, revision: old.revision + 1, text: "66" });
    }
    if (table === "take_maya_chat_message") {
      const input = JSON.parse(String(init?.body));
      const revision = f.store.rows()[0].revision;
      return Response.json(input.p_revision === revision ? { status: "accepted", revision } : { status: "conflict", admitted: false });
    }
    throw Error(`Unexpected database access: ${table}`);
  } } });
  const ctx = { db, parent: f.ids.parent, child: f.ids.child, name: "Iris", grade: 4, zone: "America/Vancouver" as const };
  const start = (extra = {}) => runChat(ctx, { type: "start", id: ID, workbookId: f.ids.workbook, reference: "page 4, number 3", ...extra } as unknown as ChatAction);
  return { ...f, ctx, start, reads, noNotice: () => { notice = false; }, noPage: () => { pageExists = false; }, recover: () => { recovering = true; } };
}

describe("#677 family chat workbook selection through runChat", () => {
  it("keeps the stored printed question on the desk and in Maya's opening", async () => {
    const f = await setup();
    const book = await f.books.workbook(f.ids.workbook);
    if (!book) throw Error("Missing book");
    const question = book.pages[0].questions[0];
    if (question.content.status !== "found") throw Error("Missing question");
    // An edited whole-book response does not replace the stored printed page.
    const pkg = question.content.package;
    const operation = { kind: "missing-addend" as const, operands: [7, 10] as [number, number] };
    const easier = { kind: "missing-addend" as const, operands: [1, 2] as [number, number] };
    question.content.package = { ...pkg, text: "7 + ? = 10", operation, steps: workedSteps(operation), answer: { value: { type: "number", value: 3 }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number", value: 2 }, cause: "counting", description: "Miscounts.", step: null }], easierExample: { text: "1 + ? = 2", operation: easier, answer: { type: "number", value: 1 }, steps: workedSteps(easier) } };
    expect(checkQuestionPackage(question.content.package)).toMatchObject({ ok: true });
    vi.spyOn(f.books, "workbook").mockResolvedValue(book);
    const now = Date.UTC(2026, 10, 2, 16);
    const view = await deskView(f.books, { parentId: f.ids.parent, childId: f.ids.child, workbookId: f.ids.workbook, page: 4, question: 1 }, {
      receipt: async () => ({ workbookId: f.ids.workbook, parentId: f.ids.parent, childId: f.ids.child, number: 1,
        deliveredAt: new Date(now).toISOString(), localTime: "2026-11-02T08:00", timeZone: "America/Vancouver",
        recordedAt: new Date(now).toISOString(), actorId: f.ids.parent, auditId: 1 }),
    }, now);
    if (view.status !== "ready") throw Error("No desk");
    expect(view.page.questions[0]).toMatchObject({ number: 1, text: pkg.text, held: false });
    expect(view.page.questions[1]).toMatchObject({ held: false });
    expect(view.page.questions[0]).not.toHaveProperty("answer");
    const started = await f.start({ reference: "page 4, number 1" });
    expect(started.error).toBeUndefined();
    expect(started.chat?.transcript.filter(t => t.speaker === "maya").map(t => t.text))
      .toEqual(["Hi, I'm Maya, an AI helper. Let's do page 4, number 1: 27 + 39."]);
  });

  it("resolves a typed reference, confirms the stored question, and teaches only after that opening", async () => {
    const f = await setup();
    const fullBook = vi.spyOn(f.books, "workbook"), question = vi.spyOn(f.books, "question");
    const r = await f.start();
    expect(r.error).toBeUndefined();
    expect(r.chat?.transcript.filter(t => t.speaker === "maya").map(t => t.text)).toEqual(["Hi, I'm Maya, an AI helper. Let's do page 4, number 3: 27 + 39."]);
    expect(r.chat?.batches).toEqual([]);
    expect(f.store.rows()[0].question).toEqual({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 });
    expect(question).toHaveBeenCalledTimes(1);
    expect(fullBook).not.toHaveBeenCalled();
  });

  it.each(["guessed book", "sibling", "other family", "draft", "approved", "printed", "missing page", "invalid reference", "competing references", "notice"])("refuses %s before reading a question package", async reason => {
    const f = await setup();
    const question = vi.spyOn(f.books, "question"), fullBook = vi.spyOn(f.books, "workbook");
    let extra = {};
    if (reason === "guessed book") extra = { workbookId: OTHER };
    if (reason === "sibling") f.ctx.child = f.ids.sibling;
    if (reason === "other family") f.ctx.parent = OTHER;
    if (["draft", "approved", "printed"].includes(reason)) f.books.setStatus(f.ids.workbook, reason as "draft" | "approved" | "printed");
    if (reason === "missing page") f.noPage();
    if (reason === "invalid reference") extra = { reference: "page 4, number 3 or 1" };
    if (reason === "competing references") extra = { question: { source: "workbook", workbookId: f.ids.workbook, page: 4, question: 1 } };
    if (reason === "notice") f.noNotice();
    expect(await f.start(extra)).toMatchObject({ chat: null, admission: "refused" });
    expect(question).not.toHaveBeenCalled();
    expect(fullBook).not.toHaveBeenCalled();
    expect(f.store.rows()).toEqual([]);
  });

  it("keeps taps and typed references on the same shipped question and confirmation path", async () => {
    const f = await setup();
    const r = await runChat(f.ctx, { type: "start", id: ID, question: { source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 } });
    expect(r.error).toBeUndefined();
    expect(r.chat?.transcript[0].text).toContain("page 4, number 3: 27 + 39");
  });

  it("refuses a changed package reference and preserves the held-question invitation", async () => {
    const f = await setup(), question = vi.spyOn(f.books, "question");
    const found = await f.books.question({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 });
    if (found.status !== "found") throw Error("Missing fixture");
    question.mockResolvedValue({ status: "found", package: { ...found.package, ref: { ...found.package.ref, source: "workbook", workbookId: OTHER, page: 4, question: 3 } } });
    expect(await f.start()).toMatchObject({ chat: null, error: "invalid_question" });
    const operation = { kind: "missing-addend" as const, operands: [7, 10] as [number, number] };
    const easier = { kind: "missing-addend" as const, operands: [1, 2] as [number, number] };
    const pkg = { ...found.package, text: "7 + ? = 10", operation, steps: workedSteps(operation), answer: { value: { type: "number" as const, value: 3 }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number" as const, value: 2 }, cause: "counting", description: "Miscounts the missing part.", step: null }], easierExample: { text: "1 + ? = 2", operation: easier, answer: { type: "number" as const, value: 1 }, steps: workedSteps(easier) } };
    expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
    question.mockResolvedValue({ status: "found", package: pkg });
    const held = await f.start();
    expect(held.chat?.ended).toBe(true);
    expect(held.chat?.transcript.map(t => t.text).join(" ")).toContain("Want to pick another question on this page?");
    expect(f.store.rows()[0].learningEventId).toBeNull();
  });

  it("rechecks shipment after the selection read and before a stored chat can continue", async () => {
    const f = await setup(), question = vi.spyOn(f.books, "question");
    const original = question.getMockImplementation() ?? f.books.question.bind(f.books);
    const found = await original({ source: "workbook", workbookId: f.ids.workbook, page: 4, question: 3 });
    question.mockImplementation(async () => { f.books.setStatus(f.ids.workbook, "printed"); return found; });
    expect(await f.start()).toMatchObject({ chat: null, error: "not_found" });
    expect(f.store.rows()).toEqual([]);
    question.mockResolvedValue(found); f.books.setStatus(f.ids.workbook, "shipped");
    const started = await f.start();
    expect(started.chat?.ended).toBe(false);
    f.books.setStatus(f.ids.workbook, "printed");
    const before = f.store.rows()[0];
    expect(await runChat(f.ctx, { type: "child", id: ID, revision: before.revision, messageId: OTHER, text: "66" })).toMatchObject({ chat: null, error: "not_found", admission: "refused" });
    expect(f.store.rows()[0]).toEqual(before);
  });

  it("keeps a call ID on its original question and refuses a stale turn or another desk", async () => {
    const f = await setup();
    const started = await f.start();
    const before = f.store.rows()[0];
    expect(await f.start({ reference: "page 4, number 1" })).toMatchObject({ error: "conflict" });
    expect(f.store.rows()[0]).toEqual(before);
    expect(await runChat({ ...f.ctx, child: f.ids.sibling }, { type: "read", id: ID })).toMatchObject({ chat: null, admission: "refused" });
    f.advance();
    const answered = await runChat(f.ctx, { type: "child", id: ID, revision: started.chat!.revision, messageId: OTHER, text: "66" });
    expect(answered.error).toBeUndefined();
    const kept = f.store.rows()[0];
    expect(await runChat(f.ctx, { type: "child", id: ID, revision: started.chat!.revision, messageId: "77777777-7777-4777-8777-777777777777", text: "56" })).toMatchObject({ error: "conflict", admission: "refused" });
    expect(f.store.rows()[0]).toEqual(kept);
    expect(f.store.rows()[0].question).toEqual(before.question);
  });
});

it.each(["no pending", "shipped pending", "withdrawn pending"])("opens a new shipped book after %s", async mode => {
 const f=await setup();
 const first=await f.start();
 expect(first.error).toBeUndefined();
 const source = f.book.pages[0].questions[0].content;
 if (source.status !== "found") throw Error("Missing fixture question");
 const write=await f.books.write({id:OTHER,childId:f.ids.child,number:2,levels:[9],pdfPath:null,profileBuild:null,
   pages:[{number:4,type:"practice",dayLabel:"Tuesday",qrToken:"new-synthetic-token",image:{path:`${f.ids.parent}/${OTHER}/page-4.png`,width:600,height:780},
     questions:[{number:3,box:{x:0,y:0,width:100,height:100},package:{...source.package,id:OTHER+":4:3",ref:{source:"workbook",workbookId:OTHER,page:4,question:3}}}]}]});
 expect(write.status,JSON.stringify(write)).toBe("written"); f.books.setStatus(OTHER,"shipped");
 if (mode === "withdrawn pending") f.books.setStatus(f.ids.workbook,"printed");
 if (mode !== "no pending") f.recover();
 const r=await runChat(f.ctx,{type:"start",id:"77777777-7777-4777-8777-777777777777",question:{source:"workbook",workbookId:OTHER,page:4,question:3}});
 expect(r.error).toBeUndefined(); expect(r.chat?.question?.workbookId).toBe(OTHER);
 if (mode === "withdrawn pending") {
  const old = (await f.store.get(ID))!;
  expect(old.status).toBe("ended");
  expect(old.revision).toBeGreaterThan(first.chat!.revision + 1);
  expect(old.trace?.turns.filter(t => t.kind === "child")).toEqual([]);
 }
});
