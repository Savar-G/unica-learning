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

export function notesPage(raw: string | string[] | undefined): number {
  return typeof raw === "string" && /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) - 1 : 0;
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
      .order("call_ended_at", { ascending: false }).order("call_id").limit(1);
    if (error) throw new Error(`Latest parent note: ${error.message}`);
    return data ?? [];
  }));
  return new Map((await withSessions(db, rows.flat())).map((n) => [n.child_id, n]));
}

export async function listParentMayaNotes(db: SupabaseClient<Database>, parent: string, child: string, page: number) {
  const start = page * NOTES_PAGE_SIZE;
  const { data, error } = await db.from("maya_call_notes").select(COLUMNS)
    .eq("parent_id", parent).eq("child_id", child)
    .order("call_ended_at", { ascending: false }).order("call_id").range(start, start + NOTES_PAGE_SIZE);
  if (error) throw new Error(`Parent notes: ${error.message}`);
  return { notes: await withSessions(db, (data ?? []).slice(0, NOTES_PAGE_SIZE)), hasMore: (data?.length ?? 0) > NOTES_PAGE_SIZE };
}

export async function readParentMayaNote(db: SupabaseClient<Database>, parent: string, child: string, call: string): Promise<ParentNoteSession | null> {
  if (!UUID.test(call)) return null;
  const { data, error } = await db.from("maya_call_notes").select(`${COLUMNS}, transcript`)
    .eq("parent_id", parent).eq("child_id", child).eq("call_id", call.toLowerCase()).maybeSingle();
  if (error) throw new Error(`Parent note: ${error.message}`);
  return (await withSessions(db, data ? [data] : []))[0] ?? null;
}
