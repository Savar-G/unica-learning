import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { familyTime, formatInZone, type FamilyZone } from "@/lib/family-time";

type Row = Database["public"]["Tables"]["maya_call_notes"]["Row"];
export type ParentNote = Pick<Row, "call_id" | "child_id" | "call_ended_at" | "facts" | "sentences" | "warm"> & {
  channel: "chat" | "call";
  startedAt: string;
};
export type ParentNoteSession = ParentNote & Pick<Row, "transcript">;
const COLUMNS = "call_id, child_id, call_ended_at, facts, sentences, warm";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NOTES_PAGE_SIZE = 20;

export const notesPath = (child: string) => `/account/notes/${child}`;
export const notePath = (note: Pick<ParentNote, "child_id" | "call_id">) => `${notesPath(note.child_id)}/${note.call_id}`;
export const sessionKind = (note: ParentNote) => note.channel === "chat" ? "Chat" : "Call";
export const notePlace = (note: ParentNote) => note.facts.question.source === "workbook"
  ? `Page ${note.facts.question.page}, question ${note.facts.question.number}` : "Assessment question";

export function sessionWhen(note: ParentNote, zone: FamilyZone): string {
  const at = Date.parse(note.startedAt);
  const day = formatInZone(at, zone, { weekday: "long", month: "long", day: "numeric" });
  const minutes = note.facts.minutes;
  return `${day} · ${familyTime(at, zone)} · ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

type NoteCursor = { at: string; id: string; direction: "older" | "newer" };
function noteCursor(raw: string | string[] | undefined): NoteCursor | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return c && typeof c.at === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(c.at) &&
      Number.isFinite(Date.parse(c.at)) && new Date(c.at.slice(0, 10)).toISOString().slice(0, 10) === c.at.slice(0, 10) &&
      typeof c.id === "string" && UUID.test(c.id) && (c.direction === "older" || c.direction === "newer")
      ? { at: c.at, id: c.id.toLowerCase(), direction: c.direction } : null;
  } catch { return null; }
}

/** Only safe metadata comes from the session table. The notes and transcripts still use parent-session RLS. */
async function withSessions<T extends Pick<Row, "call_id">>(db: SupabaseClient<Database>, notes: T[]) {
  if (!notes.length) return [];
  const { data, error } = await db.rpc("parent_maya_note_sessions", { p_calls: notes.map((n) => n.call_id) });
  if (error) throw new Error(`Parent note sessions: ${error.message}`);
  const sessions = new Map((data ?? []).map((s) => [s.call_id, s]));
  return notes.flatMap((n) => {
    const s = sessions.get(n.call_id);
    return s && (s.channel === "chat" || s.channel === "call")
      ? [{ ...n, channel: s.channel as "chat" | "call", startedAt: s.started_at }] : [];
  });
}

/** One query per child avoids a busy sibling hiding another child's latest note. No transcript is loaded. */
export async function latestParentMayaNotes(db: SupabaseClient<Database>, parent: string, children: string[]): Promise<Map<string, ParentNote>> {
  const rows = await Promise.all(children.map(async (child) => {
    const { data, error } = await db.from("maya_call_notes").select(COLUMNS)
      .eq("parent_id", parent).eq("child_id", child)
      .order("call_ended_at", { ascending: false }).order("call_id", { ascending: false }).limit(1);
    if (error) throw new Error(`Latest parent note: ${error.message}`);
    return data ?? [];
  }));
  return new Map((await withSessions(db, rows.flat())).map((n) => [n.child_id, n]));
}

export async function listParentMayaNotes(db: SupabaseClient<Database>, parent: string, child: string, token?: string | string[]) {
  const cursor = noteCursor(token);
  const backwards = cursor?.direction === "newer";
  let query = db.from("maya_call_notes").select(COLUMNS).eq("parent_id", parent).eq("child_id", child);
  if (cursor) {
    const comparison = backwards ? "gt" : "lt";
    query = query.or(`call_ended_at.${comparison}.${cursor.at},and(call_ended_at.eq.${cursor.at},call_id.${comparison}.${cursor.id})`);
  }
  const { data, error } = await query.order("call_ended_at", { ascending: backwards })
    .order("call_id", { ascending: backwards }).limit(NOTES_PAGE_SIZE + 1);
  if (error) throw new Error(`Parent notes: ${error.message}`);
  const more = (data?.length ?? 0) > NOTES_PAGE_SIZE;
  const picked = (data ?? []).slice(0, NOTES_PAGE_SIZE);
  if (backwards) picked.reverse();
  const link = (note: (typeof picked)[number], direction: NoteCursor["direction"]) =>
    Buffer.from(JSON.stringify({ at: note.call_ended_at, id: note.call_id, direction })).toString("base64url");
  const older = picked.length ? (backwards || more ? link(picked.at(-1)!, "older") : null) : backwards ? "start" : null;
  const newer = picked.length ? (backwards ? more : cursor !== null) ? link(picked[0], "newer") : null : cursor && !backwards ? "start" : null;
  return { notes: await withSessions(db, picked), older, newer };
}

export async function readParentMayaNote(db: SupabaseClient<Database>, parent: string, child: string, call: string): Promise<ParentNoteSession | null> {
  if (!UUID.test(call)) return null;
  const { data, error } = await db.from("maya_call_notes").select(`${COLUMNS}, transcript`)
    .eq("parent_id", parent).eq("child_id", child).eq("call_id", call.toLowerCase()).maybeSingle();
  if (error) throw new Error(`Parent note: ${error.message}`);
  return (await withSessions(db, data ? [data] : []))[0] ?? null;
}
