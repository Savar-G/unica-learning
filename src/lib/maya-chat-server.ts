import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { adminClient } from "@/lib/supabase-auth";
import { stripe } from "@/lib/stripe";
import { readBookingCustomers } from "@/lib/retention-stripe";
import { chatFamilyGate, chatGradeLine, chatServesGrade, chatUsage, chatWindow, childChatView, type ChatUsage, type ChatReply } from "@/lib/maya-chat";
import { mayaCalls, recordView, type CallRecord } from "@/lib/maya-call";
import type { InkEvent } from "@/lib/board-history";
import { callSeams } from "@/lib/maya-call-seams";
import { mayaCallStore } from "@/lib/maya-call-store";
import { mayaNotice } from "@/lib/maya-notice";
import { noticeStore } from "@/lib/maya-notice-store";
import { workbookStore } from "@/lib/workbook-store";
import { type FamilyZone } from "@/lib/family-time";
import type { WorkbookQuestionRef } from "@/lib/question-package";

type DB = SupabaseClient<Database>;
/**
 * The family part of the chat check (#530): a test family, or a family on the admin list with the switch on and a
 * running plan. Stripe remains the plan authority. Unknown, canceled and past due fail closed. A family off the list
 * is refused before Stripe is read.
 */
export async function chatAccess(db: DB, parent: string): Promise<boolean> {
  const [{ data: test, error }, { data: listed, error: listError }] = await Promise.all([
    db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle(),
    db.from("maya_chat_families").select("parent_id").eq("parent_id", parent).maybeSingle(),
  ]);
  if (error || listError) throw Error((error ?? listError)!.message);
  const gate = chatFamilyGate({ test: !!test, listed: !!listed }, process.env);
  if (gate === "closed") return false;
  if (gate === "test") return true;
  const s = stripe();
  if (!s) return false;
  const { data, error: cardsError } = await db.rpc("family_retention_cards", { p: parent });
  if (cardsError || !Array.isArray(data)) throw Error("Plan could not be read");
  const customers = new Set<string>();
  for (const value of data) {
    const card = value as { customer?: string | null; booking?: { email: string; ref: string } | null };
    if (card.customer) customers.add(card.customer);
    if (card.booking) {
      for (const id of await readBookingCustomers(s, card.booking, () => ({ timeout: 10_000, maxNetworkRetries: 0 }))) customers.add(id);
    }
  }
  for (const customer of customers) {
    for await (const sub of s.subscriptions.list({ customer, status: "all", limit: 100 }, { timeout: 10_000, maxNetworkRetries: 0 })) {
      if ((typeof sub.customer === "string" ? sub.customer : sub.customer.id) !== customer) throw Error("Plan scope changed");
      if (sub.status === "trialing" || sub.status === "active") return true;
    }
  }
  return false;
}

export async function readChatUsage(db: DB, parent: string, child: string, zone: FamilyZone, now = Date.now()): Promise<ChatUsage> {
  const window = chatWindow(now, zone);
  const { count, error } = await db.from("maya_chat_messages").select("id", { count: "exact", head: true })
    .eq("parent_id", parent).eq("child_id", child).gte("received_at", new Date(window.start).toISOString()).lt("received_at", new Date(window.end).toISOString());
  if (error || count === null) throw Error("Chat usage could not be read");
  return chatUsage(count, now, zone);
}

/** The whole chat check on every chat request: the family first, then the child's grade (Grade 3 and up). */
export async function chatGate(db: DB, parent: string, grade: number | null | undefined): Promise<"open" | "too_young" | "closed"> {
  if (!await chatAccess(db, parent)) return "closed";
  return chatServesGrade(grade) ? "open" : "too_young";
}

/** Chat usage for the children who can chat; a younger child has none. An empty map when the family has no chat. */
export async function parentChatUsage(session: DB, parent: string, children: readonly { id: string; grade: number }[], zone: FamilyZone): Promise<Map<string, ChatUsage>> {
  try {
    const admin = adminClient();
    if (!admin || !await chatAccess(admin, parent)) return new Map();
    return new Map(await Promise.all(children.filter((c) => chatServesGrade(c.grade))
      .map(async (c) => [c.id, await readChatUsage(session, parent, c.id, zone)] as const)));
  } catch { return new Map(); }
}

/** What the desk shows for one child: the chat usage, or why a younger child has none. Nothing when the family has no chat. */
export async function deskChat(session: DB, parent: string, child: { id: string; grade: number }, zone: FamilyZone): Promise<{ usage: ChatUsage | null; note: string | null }> {
  try {
    const admin = adminClient();
    const gate = admin ? await chatGate(admin, parent, child.grade) : "closed";
    if (gate === "too_young") return { usage: null, note: chatGradeLine() };
    if (gate === "open") return { usage: await readChatUsage(session, parent, child.id, zone), note: null };
  } catch { /* The desk shows chat as not open yet. */ }
  return { usage: null, note: null };
}

export interface ChatContext { db: DB; parent: string; child: string; name: string; grade?: number; zone: FamilyZone }
export type ChatAction = { type: "start"; id: string; question: WorkbookQuestionRef } | { type: "read"; id: string } |
  { type: "child"; id: string; messageId: string; revision: number; text: string } | { type: "end"; id: string; revision: number };

/**
 * The child's ink events of a chat from the desk (#534, #635): appended to the call's log at sequences `from`, `from + 1`,
 * …, each sequence once; only for a chat of this parent and child (the store checks it too), live or ended a few minutes
 * ago at most, one append a second. `held` is the last sequence the call holds. Never changes the chat's revision.
 */
export async function appendChatInk(ctx: ChatContext, id: string, from: unknown, events: unknown): ReturnType<ReturnType<typeof mayaCalls>["appendInk"]> {
  const { db, parent, child } = ctx;
  return mayaCalls({ ...callSeams(db), canChat: async (p, c) => p === parent && c === child }).appendInk(id, { parentId: parent, childId: child }, from, events);
}

/** The ink log the call holds for a chat of this child (#635, R639-4), for the board the desk starts from; null when none. */
export async function readChatInk(ctx: ChatContext, id: string): Promise<InkEvent[] | null> {
  const { db, parent, child } = ctx;
  return mayaCalls({ ...callSeams(db), canChat: async (p, c) => p === parent && c === child }).readInk(id, { parentId: parent, childId: child });
}

/** One authorized desk request. The database serializes message admission before the shared call module runs. */
export async function runChat(ctx: ChatContext, action: ChatAction): Promise<ChatReply> {
  const { db, parent, child, name, zone } = ctx;
  const store = mayaCallStore(db);
  const seams = callSeams(db);
  // The route rechecks plan and feature access before every request. The module keeps that authorization explicit.
  const calls = mayaCalls({ ...seams, canChat: async (p, c) => p === parent && c === child });
  const usage = () => readChatUsage(db, parent, child, zone);
  const owned = (r: CallRecord | null): r is CallRecord => !!r && r.kind === "chat" && r.parentId === parent && r.childId === child;
  let childPending = false;
  /** Recovery claims the child's original request under the same lock, even from another question or day. */
  const recoverChild = async () => {
    const { data, error } = await db.rpc("recover_maya_chat_message", { p_parent: parent, p_child: child });
    if (error) throw Error(error.message);
    const recovered = data as { status: string; id?: string; callId?: string; revision?: number; text?: string };
    childPending = recovered.status !== "none";
    if (recovered.status !== "accepted" || !recovered.callId || recovered.revision === undefined || !recovered.text) return;
    const result = await calls.input(recovered.callId, recovered.revision, { type: "child", text: recovered.text }, name);
    if (!result.ok) throw Error(`Chat recovery: ${result.error}`);
    const saved = await store.get(recovered.callId);
    if (saved?.status === "live" && (await usage()).left === 0) await calls.input(saved.id, saved.revision, { type: "end" }, name);
    childPending = false;
  };
  const reply = async (r: CallRecord | null, error?: string, admission?: ChatReply["admission"]): Promise<ChatReply> => {
    const view = r && recordView(r);
    const chat = view ? childChatView(view) : null;
    if (chat && r?.status === "live") {
      const { data, error } = await db.from("maya_chat_messages").select("id").eq("call_id", r.id).eq("claim_revision", r.revision).limit(1);
      if (error) throw Error(error.message);
      chat.pending = childPending || !!data?.length;
    }
    if (chat && r?.live) chat.hint = Math.min(3, r.live.text.session.highestHint ?? 0);
    return { usage: await usage(), chat, ...(error ? { error } : {}), ...(admission ? { admission } : {}) };
  };
  let record = await store.get(action.id);
  if (record && !owned(record)) return reply(null, "not_found", "refused");
  if (action.type === "start") {
    // No new chat without a parent's agreement (#529). A chat already under way can still be read, answered and ended.
    if (!record && !await mayaNotice(noticeStore(db)).accepted(parent)) return reply(null, "notice_required", "refused");
    const ref = action.question;
    const books = workbookStore(db);
    const book = await books.workbook(ref.workbookId);
    if (!book || book.childId !== child || book.parentId !== parent || book.status !== "shipped") return reply(null, "not_found");
    const question = await books.question(ref);
    if (question.status !== "found") return reply(null, "invalid_question");
    await recoverChild();
    if (record) {
      record = await store.get(record.id);
      if (!record) return reply(null, "not_found");
      if (JSON.stringify(record.question) !== JSON.stringify(ref)) return reply(null, "conflict");
      return reply(record);
    }
    if ((await usage()).left === 0) return reply(null, "cap");
    const result = await calls.start({ id: action.id, kind: "chat", parentId: parent, childId: child, childName: name, grade: ctx.grade, startedBy: parent, package: question.package });
    return result.ok ? reply(await store.get(result.view.id)) : reply(null, result.error);
  }
  if (!owned(record)) return reply(null, "not_found", "refused");
  await recoverChild();
  record = await store.get(action.id);
  if (!owned(record)) return reply(null, "not_found", "refused");
  if (action.type === "read") return reply(record);
  if (action.type === "child") {
    const now = Date.now(), window = chatWindow(now, zone);
    const { data, error } = await db.rpc("take_maya_chat_message", {
      p_id: action.messageId, p_parent: parent, p_child: child, p_call: record.id, p_revision: action.revision,
      p_text: action.text, p_fingerprint: createHash("sha256").update(action.text).digest("hex"), p_start: new Date(window.start).toISOString(), p_end: new Date(window.end).toISOString(),
    });
    if (error) throw Error(error.message);
    const claim = data as { status: string; revision?: number; admitted?: boolean };
    if (claim.status === "done") return reply(await store.get(record.id), undefined, "accepted");
    if (claim.status !== "accepted" || claim.revision === undefined) {
      childPending = claim.status === "busy" || claim.status === "recover";
      return reply(await store.get(record.id), claim.status, claim.admitted ? "accepted" : "refused");
    }
    const result = await calls.input(record.id, claim.revision, { type: "child", text: action.text }, name);
    record = await store.get(record.id);
    // At the cap, finish through the same path as a call, including learning, notes and alerts.
    if (result.ok && record?.status === "live" && (await usage()).left === 0) {
      await calls.input(record.id, record.revision, { type: "end" }, name);
      record = await store.get(record.id);
    }
    return reply(record, result.ok ? undefined : result.error, "accepted");
  }
  if (childPending) return reply(record, "busy");
  const { data: pending, error: pendingError } = await db.from("maya_chat_messages").select("id").eq("call_id", record.id).eq("claim_revision", record.revision).limit(1);
  if (pendingError) throw Error(pendingError.message);
  if (record.status === "live" && pending?.length) return reply(record, "busy");
  const result = await calls.input(record.id, action.revision, { type: "end" }, name);
  return reply(await store.get(record.id), result.ok ? undefined : result.error);
}
