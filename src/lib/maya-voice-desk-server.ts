import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { localDateTime, weekOf, type FamilyZone } from "@/lib/family-time";
import { mayaCalls, recordView, type CallRecord, type CallStore, type MayaCalls } from "@/lib/maya-call";
import { callSeams } from "@/lib/maya-call-seams";
import { mayaCallStore } from "@/lib/maya-call-store";
import { chatServesGrade } from "@/lib/maya-chat";
import { chatGate, type ChatContext } from "@/lib/maya-chat-server";
import { mayaNotice, type MayaNotice } from "@/lib/maya-notice";
import { noticeStore } from "@/lib/maya-notice-store";
import { livekitProject } from "@/lib/maya-voice";
import { deskVoiceCall, VOICE_WEEK_SECONDS, voiceCallLimitMs, voiceSwitchOpen, voiceUsage, voiceUsedSeconds, voiceWeekLeft, type DeskVoiceReply, type VoiceAction, type VoiceUsage } from "@/lib/maya-voice-desk";
import { mintVoiceToken } from "@/lib/maya-voice-token";
import { adminClient } from "@/lib/supabase-auth";
import type { WorkbookStore } from "@/lib/workbook-content";
import { workbookStore } from "@/lib/workbook-store";

// A child's voice call with Maya from the family desk, on the server (rules shared with the screen: src/lib/maya-voice-desk.ts).
// The call is a `maya_calls` row of kind "family" and mode "voice" on a shipped workbook question of this child. The web app
// makes the row and mints the LiveKit token; Maya's voice worker (worker/maya-voice) runs the call, exactly as for an admin
// test call. Parents read no call rows, so the week's usage is read with the secret key.

type DB = SupabaseClient<Database>;

/**
 * Whether voice is open to this child: LiveKit is set up; the child is Grade 3 or up (as chat is); a test family, or any other
 * family only with `MAYA_VOICE_ENABLED=on` and chat open to the child (its plan gate; `MAYA_CHAT_ENABLED=off` stops voice
 * for a family that is not a test family too). Throws when a check cannot be read: callers close on a throw.
 */
export async function voiceGate(db: DB, parent: string, grade: number | null | undefined, child: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<"open" | "too_young" | "closed"> {
  if (!livekitProject(env)) return "closed";
  if (!chatServesGrade(grade)) return "too_young";
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
  if (error) throw Error(`voice test family check: ${error.message}`);
  if (!voiceSwitchOpen({ test: !!data }, env)) return "closed";
  return (await chatGate(db, parent, grade, child)) === "open" ? "open" : "closed";
}

/** The week's used seconds of a child: its family calls created in the family's current week (see voiceUsedSeconds). */
export async function readVoiceUsedSeconds(db: DB, parent: string, child: string, zone: FamilyZone, now = Date.now()): Promise<number> {
  const week = weekOf(now, zone);
  const { data, error } = await db.from("maya_calls")
    .select("status, connected_seconds, end_at_ms:live->text->session->limits->endAtMs")
    .eq("parent_id", parent).eq("child_id", child).eq("kind", "family")
    .gte("created_at", new Date(localDateTime(week.start, zone)).toISOString()).lt("created_at", new Date(week.resetsAt).toISOString())
    .limit(1000);
  if (error || !data) throw Error(`voice usage: ${error?.message ?? "no rows"}`);
  return voiceUsedSeconds(data.map((r) => ({ status: r.status, connectedSeconds: r.connected_seconds, endAtMs: typeof r.end_at_ms === "number" ? r.end_at_ms : null })));
}

/**
 * What the desk needs for one child's voice: the week's usage, or null when voice is closed to this child (the gate, the
 * switch or LiveKit) or cannot be read: closed on every failure. The usage is read with the secret key, since a parent reads
 * no call rows; `session` is kept for the symmetry with `deskChat` and is not used.
 */
export async function deskVoice(session: DB, parent: string, child: { id: string; grade: number }, zone: FamilyZone, now = Date.now()): Promise<{ usage: VoiceUsage } | null> {
  void session;
  try {
    const admin = adminClient();
    if (!admin || await voiceGate(admin, parent, child.grade, child.id) !== "open") return null;
    return { usage: voiceUsage(await readVoiceUsedSeconds(admin, parent, child.id, zone, now), now, zone) };
  } catch (e) {
    console.error("[desk voice] state could not be read", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

/** What one desk voice request needs; the server's own come from `serverVoiceDeps`, and tests pass their own. */
export interface VoiceDeps {
  calls: MayaCalls;
  store: Pick<CallStore, "get">;
  books: Pick<WorkbookStore, "workbook" | "question">;
  notice: Pick<MayaNotice, "accepted">;
  project: ReturnType<typeof livekitProject>;
  /** The child's used seconds of the family week now (see voiceUsedSeconds). */
  usedSeconds(): Promise<number>;
  now(): number;
}

export function serverVoiceDeps(ctx: ChatContext): VoiceDeps {
  const { db, parent, child, zone } = ctx;
  // The route checked the family, the child and the voice gate before this request; the module keeps that explicit.
  const calls = mayaCalls({ ...callSeams(db), canCallVoice: async (p, c) => p === parent && c === child });
  return { calls, store: mayaCallStore(db), books: workbookStore(db), notice: mayaNotice(noticeStore(db)), project: livekitProject(process.env), usedSeconds: () => readVoiceUsedSeconds(db, parent, child, zone), now: Date.now };
}

/**
 * One authorized desk voice request. The parent and the child come from the desk (the route's context), never from the
 * request. A call of another family, another child or another kind answers `not_found`, like no call at all.
 */
export async function runVoice(ctx: ChatContext, action: VoiceAction, deps: VoiceDeps = serverVoiceDeps(ctx)): Promise<DeskVoiceReply> {
  const { parent, child, name, zone } = ctx;
  const owned = (r: CallRecord | null): r is CallRecord => !!r && r.kind === "family" && r.mode === "voice" && r.parentId === parent && r.childId === child;
  const usage = async (): Promise<VoiceUsage | null> => {
    try { return voiceUsage(await deps.usedSeconds(), deps.now(), zone); } catch (e) {
      console.error("[desk voice] usage could not be read", e instanceof Error ? e.message : "unknown");
      return null;
    }
  };
  const reply = async (r: CallRecord | null, more: { ticket?: DeskVoiceReply["ticket"]; error?: string } = {}): Promise<DeskVoiceReply> => {
    const view = r && recordView(r);
    return { call: view ? deskVoiceCall(view) : null, ...(more.ticket ? { ticket: more.ticket } : {}), usage: await usage(), ...(more.error ? { error: more.error } : {}) };
  };
  /** A fresh ticket for this live call of this child, or the reason it cannot be given. */
  const ticket = async (r: CallRecord) => {
    if (!deps.project) return { error: "unavailable" } as const;
    const minted = await mintVoiceToken({ call: { id: r.id, parentId: r.parentId, childId: r.childId, kind: r.kind, mode: r.mode, status: r.status }, notice: deps.notice, parentId: parent, childId: child, project: deps.project, name, now: deps.now() });
    return minted.ok ? { ticket: minted.ticket } : { error: minted.error };
  };
  /** A call that is live gets a ticket, else the call as it is. */
  const answer = async (r: CallRecord): Promise<DeskVoiceReply> => {
    if (r.status !== "live") return reply(r);
    const t = await ticket(r);
    return "ticket" in t ? reply(r, { ticket: t.ticket }) : reply(r, { error: t.error });
  };
  const end = (r: CallRecord) => deps.calls.input(r.id, r.revision, { type: "end" }, name);

  let record = await deps.store.get(action.id);
  if (record && !owned(record)) return reply(null, { error: "not_found" });

  if (action.type === "read") return record ? reply(record) : reply(null, { error: "not_found" });

  if (action.type === "token") {
    if (!record) return reply(null, { error: "not_found" });
    return record.status === "live" ? answer(record) : reply(record, { error: "ended" });
  }

  if (action.type === "cancel") {
    if (!record) return reply(null, { error: "not_found" });
    // Only a call Maya has not joined can be cancelled here; once she has, the call ends by hanging up in the room.
    for (let tries = 0; tries < 2 && record.status === "live"; tries++) {
      if (record.startedAt !== null) return reply(record, { error: "already_started" });
      const result = await end(record);
      if (result.ok) break;
      // Another request changed the call first (Maya may have joined): read it again.
      if (result.error !== "conflict") return reply(await deps.store.get(record.id), { error: result.error === "voice_call" ? "already_started" : result.error });
      record = (await deps.store.get(record.id)) ?? record;
    }
    record = await deps.store.get(action.id);
    if (record?.status === "live") return reply(record, { error: record.startedAt !== null ? "already_started" : "conflict" });
    return reply(record);
  }

  // start
  const ref = action.question;
  if (record) {
    // The same call again (a retry, or a second tab): the call as it is, with a fresh ticket while it is live.
    if (JSON.stringify(record.question) !== JSON.stringify(ref)) return reply(null, { error: "conflict" });
    return answer(record);
  }
  // No new call without a parent's agreement (#529). A call already under way can still be read and rejoined.
  if (!await deps.notice.accepted(parent)) return reply(null, { error: "notice_required" });
  const book = await deps.books.workbook(ref.workbookId);
  if (!book || book.childId !== child || book.parentId !== parent || book.status !== "shipped") return reply(null, { error: "not_found" });
  const question = await deps.books.question(ref);
  if (question.status !== "found") return reply(null, { error: "invalid_question" });
  // The weekly limit: the call gets the time left when that is under the normal 10 minutes.
  const limitMs = voiceCallLimitMs(voiceWeekLeft(await deps.usedSeconds()));
  if (limitMs === null) return reply(null, { error: "voice_week_used" });
  let started: Awaited<ReturnType<MayaCalls["startVoice"]>>;
  try {
    started = await deps.calls.startVoice({ id: action.id, kind: "family", parentId: parent, childId: child, childName: name, grade: ctx.grade, startedBy: parent, package: question.package, limitMs });
  } catch (e) {
    // A second request with the same id may have made the call first: that call is the answer.
    const raced = await deps.store.get(action.id);
    if (owned(raced)) return answer(raced);
    // Another call of this child is live (a second tab, or two starts at once): one call at a time (index
    // maya_calls_one_live_family_call), so the weekly time cannot be spent twice.
    if (e instanceof Error && e.message.includes("maya_calls_one_live_family_call")) return reply(null, { error: "busy" });
    throw e;
  }
  if (!started.ok) return reply(null, { error: started.error === "not_test_family" ? "unavailable" : started.error });
  const made = await deps.store.get(started.view.id);
  if (!made) return reply(null, { error: "unavailable" });
  // The week read again, now that this call is the child's only live call (index maya_calls_one_live_family_call) and
  // counts at its whole limit (R904-1). A start that read the week before another call ended, and inserted after it,
  // can be over the week here: that call ends before it gets a ticket, as a call Maya never joined.
  if (await deps.usedSeconds() > VOICE_WEEK_SECONDS) {
    await end(made).catch(() => undefined);
    return reply(await deps.store.get(made.id), { error: "busy" });
  }
  const t = await ticket(made);
  if ("ticket" in t) return reply(made, { ticket: t.ticket });
  // A call with no ticket would stay live until the sweep: end it now, as a call Maya never joined.
  await end(made).catch(() => undefined);
  return reply(await deps.store.get(made.id), { error: t.error });
}
