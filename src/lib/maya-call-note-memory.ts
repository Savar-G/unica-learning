import { NOTE_CALL_KINDS, type CallNote, type NoteStore } from "@/lib/maya-call-note";

// The parent's call notes (src/lib/maya-call-note.ts, #331) in memory, for tests. It keeps the database's rules
// (migration add_maya_call_notes): a note only for an ended call of the family call kind, with the call's own parent and
// child, never for a test family; one note per call; a note never changes. `reader(parentId)` reads as that parent's
// own session does under row-level security: only that family's notes. Notes are JSON in the database, so the store
// keeps and gives copies.

export interface MemoryCall {
  id: string;
  kind: string;
  status: "live" | "ended";
  parentId: string;
  childId: string;
}

export function memoryNoteStore(options: { calls: () => readonly MemoryCall[]; testFamilies: readonly string[] }): NoteStore & {
  rows(): CallNote[];
  /** The store as one parent's session reads it. */
  reader(parentId: string): Pick<NoteStore, "get" | "list">;
} {
  const rows = new Map<string, CallNote>();
  const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const newestFirst = (a: CallNote, b: CallNote) => b.callEndedAt.localeCompare(a.callEndedAt) || a.callId.localeCompare(b.callId);
  const listOf = (parentId: string, limit: number) => [...rows.values()].filter((n) => n.parentId === parentId).sort(newestFirst).slice(0, limit).map(copy);
  return {
    async get(callId) {
      const n = rows.get(callId);
      return n ? copy(n) : null;
    },
    async insert(n) {
      const call = options.calls().find((c) => c.id === n.callId);
      if (!call) throw new Error("maya call note insert: maya_call_note_no_call");
      if (!(NOTE_CALL_KINDS as readonly string[]).includes(call.kind)) throw new Error("maya call note insert: maya_call_note_test_call");
      if (call.parentId !== n.parentId || call.childId !== n.childId) throw new Error("maya call note insert: maya_call_note_family_mismatch");
      if (call.status !== "ended") throw new Error("maya call note insert: maya_call_note_not_ended");
      if (options.testFamilies.includes(n.parentId)) throw new Error("maya call note insert: maya_call_note_test_family");
      if ((n.writer === "ai") !== (n.warm !== null)) throw new Error("maya call note insert: maya_call_notes_writer");
      if (rows.has(n.callId)) return "exists";
      rows.set(n.callId, copy(n));
      return "saved";
    },
    async list(parentId, limit) {
      return listOf(parentId, limit);
    },
    rows: () => [...rows.values()].map(copy),
    reader: (parentId) => ({
      async get(callId) {
        const n = rows.get(callId);
        return n && n.parentId === parentId ? copy(n) : null;
      },
      async list(_asked, limit) {
        // Row-level security: whatever family is asked for, a parent's session sees only its own.
        return listOf(parentId, limit).filter((n) => n.parentId === _asked);
      },
    }),
  };
}
