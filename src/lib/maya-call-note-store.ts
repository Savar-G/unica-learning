import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { CallNote, NoteStore } from "@/lib/maya-call-note";

// The parent's call notes (src/lib/maya-call-note.ts, #331) in Supabase: public.maya_call_notes (migration
// add_maya_call_notes). Writes need a client with the secret key (the service role may only insert and read). Reads work
// with either client: with the parent's own session, row-level security gives only that family's notes, so the parent
// home reads with `mayaCallNoteStore(parentSession)`. A second note for a call is "exists" (primary key); every other
// error throws, also the trigger's refusal of a test call or a test family. Tests use src/lib/maya-call-note-memory.ts.
// No Next.js or React.

type Row = Database["public"]["Tables"]["maya_call_notes"]["Row"];
type Insert = Database["public"]["Tables"]["maya_call_notes"]["Insert"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function fromNoteRow(r: Row): CallNote {
  return {
    callId: r.call_id,
    parentId: r.parent_id,
    childId: r.child_id,
    noteVersion: r.note_version,
    callEndedAt: r.call_ended_at,
    createdAt: r.created_at,
    facts: r.facts,
    sentences: r.sentences,
    warm: r.warm,
    writer: r.writer,
    model: r.model,
    promptVersion: r.prompt_version,
    transcript: r.transcript,
  };
}

export function mayaCallNoteStore(db: SupabaseClient<Database>): NoteStore {
  return {
    async get(callId) {
      if (!UUID.test(callId)) return null;
      const { data, error } = await db.from("maya_call_notes").select("*").eq("call_id", callId.toLowerCase()).maybeSingle();
      if (error) throw new Error(`maya call note load: ${error.message}`);
      return data ? fromNoteRow(data) : null;
    },
    async insert(n) {
      const row: Insert = {
        call_id: n.callId,
        parent_id: n.parentId,
        child_id: n.childId,
        note_version: n.noteVersion,
        call_ended_at: n.callEndedAt,
        created_at: n.createdAt,
        facts: n.facts,
        sentences: n.sentences,
        warm: n.warm,
        writer: n.writer,
        model: n.model,
        prompt_version: n.promptVersion,
        transcript: n.transcript,
      };
      const { error } = await db.from("maya_call_notes").insert(row);
      if (error?.code === "23505") return "exists";
      if (error) throw new Error(`maya call note insert: ${error.code ?? ""} ${error.message}`.trim());
      return "saved";
    },
    async list(parentId, limit) {
      const { data, error } = await db
        .from("maya_call_notes")
        .select("*")
        .eq("parent_id", parentId)
        .order("call_ended_at", { ascending: false })
        .order("call_id", { ascending: true })
        .limit(Math.max(1, Math.min(limit, 200)));
      if (error) throw new Error(`maya call notes list: ${error.message}`);
      return (data ?? []).map(fromNoteRow);
    },
  };
}
