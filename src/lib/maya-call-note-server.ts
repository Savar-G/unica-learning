import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { callNotes, noteAiClient, type CallNote, type CallNotes } from "@/lib/maya-call-note";
import { mayaCallNoteStore } from "@/lib/maya-call-note-store";
import type { CallRecord } from "@/lib/maya-call";
import type { NewLearningEvent } from "@/lib/learning-events";
import type { QuestionPackage } from "@/lib/question-package";

// The parent's call notes on the server (#331): the note module (src/lib/maya-call-note.ts) with its seams. The call
// module runs `writeNoteAfterCall` when a call ends (the `note` seam of src/lib/maya-call.ts); it writes with the secret
// key. The parent home reads with the parent's own session (`parentCallNotes`), so row-level security gives only that
// family's notes. The AI: OpenRouter with OPENROUTER_API_KEY, the fake in development with AI_REVIEW_FAKE, else none
// (then every note is code only).

async function isTestFamily(db: SupabaseClient<Database>, parentId: string): Promise<boolean> {
  const { data, error } = await db.from("test_accounts").select("parent_id").eq("parent_id", parentId).maybeSingle();
  if (error) throw new Error(`test family check: ${error.message}`);
  return data !== null;
}

/** The note module with the secret key. */
export function serverCallNotes(admin: SupabaseClient<Database>): CallNotes {
  return callNotes({ store: mayaCallNoteStore(admin), ai: noteAiClient(), isTestFamily: (p) => isTestFamily(admin, p), clock: () => Date.now() });
}

/** The `note` seam of the call module: writes the note of an ended call (refused for test calls and test families). */
export function writeNoteAfterCall(admin: SupabaseClient<Database>) {
  const notes = serverCallNotes(admin);
  return async ({ call, package: pkg, event }: { call: CallRecord; package: QuestionPackage; event: NewLearningEvent | null }) => {
    const { data } = await admin.from("children").select("first_name").eq("id", call.childId).maybeSingle();
    const result = await notes.write({ call, package: pkg, event, childName: data?.first_name ?? null });
    if (!result.ok && result.error === "not_ended") console.error("[call note] the call has no outcome", call.id);
    return result;
  };
}

/** The signed-in parent's call notes, newest first, read with their own session (row-level security). */
export async function parentCallNotes(session: SupabaseClient<Database>, parentId: string, limit = 50): Promise<CallNote[]> {
  return mayaCallNoteStore(session).list(parentId, limit);
}
