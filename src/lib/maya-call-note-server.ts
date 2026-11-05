import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { callNotes, noteAiClient, noteStep, type CallNote, type CallNotes, type NoteStep } from "@/lib/maya-call-note";
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

/** The child's first name; null when it cannot be read (then the note module asks nothing and writes nothing). */
async function childName(db: SupabaseClient<Database>, childId: string): Promise<string | null> {
  const { data, error } = await db.from("children").select("first_name").eq("id", childId).maybeSingle();
  if (error) console.error("[call note] child name lookup failed", error.message);
  return error ? null : (data?.first_name ?? null);
}

/** The note module with the secret key. `codeOnly`: no AI warm sentence (the sweep of abandoned calls, #528). */
export function serverCallNotes(admin: SupabaseClient<Database>, options: { codeOnly?: boolean } = {}): CallNotes {
  return callNotes({
    store: mayaCallNoteStore(admin),
    ai: options.codeOnly ? null : noteAiClient(),
    isTestFamily: (p) => isTestFamily(admin, p),
    childName: (id) => childName(admin, id),
    clock: () => Date.now(),
  });
}

/**
 * The `note` seam of the call module: writes the note of an ended call. "done" when the note is stored or refused for
 * good (a test call or a test family); "pending" otherwise, so the call keeps the note's inputs for a retry.
 */
export function writeNoteAfterCall(admin: SupabaseClient<Database>, options: { codeOnly?: boolean } = {}) {
  const notes = serverCallNotes(admin, options);
  return async ({ call, package: pkg, event }: { call: CallRecord; package: QuestionPackage; event: NewLearningEvent | null }): Promise<NoteStep> => {
    const result = await notes.write({ call, package: pkg, event });
    return noteStep(result, call.id);
  };
}

/** The signed-in parent's call notes, newest first, read with their own session (row-level security). */
export async function parentCallNotes(session: SupabaseClient<Database>, parentId: string, limit = 50): Promise<CallNote[]> {
  return mayaCallNoteStore(session).list(parentId, limit);
}
