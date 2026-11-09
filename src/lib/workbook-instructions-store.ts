// Book instructions (src/lib/workbook-instructions.ts) in public.workbook_instructions: one row per child. The server
// writes with the secret key after the route checks the admin's session; admins read with their own session.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { workbookInstructions, type WorkbookInstructions } from "@/lib/workbook-instructions";

export interface StoredInstructions {
  instructions: WorkbookInstructions;
  updatedAt: string;
  updatedBy: string | null;
}

/** The child's stored instructions, or null. A row the code cannot read is an error, never "none". */
export async function readWorkbookInstructions(db: SupabaseClient<Database>, childId: string): Promise<StoredInstructions | null> {
  const { data, error } = await db.from("workbook_instructions").select("instructions, updated_at, updated_by_email").eq("child_id", childId).maybeSingle();
  if (error) throw new Error(`book instructions read: ${error.message}`);
  if (!data) return null;
  const instructions = workbookInstructions(data.instructions);
  if (!instructions) throw new Error("book instructions read: the stored set cannot be read");
  return { instructions, updatedAt: data.updated_at, updatedBy: data.updated_by_email };
}

/** Saves the set for the child (replacing any), or "not_found" when there is no such child. */
export async function saveWorkbookInstructions(db: SupabaseClient<Database>, childId: string, instructions: WorkbookInstructions, by: { id: string; email: string }): Promise<"saved" | "not_found"> {
  const child = await db.from("children").select("parent_id").eq("id", childId).maybeSingle();
  if (child.error) throw new Error(`book instructions child: ${child.error.message}`);
  if (!child.data) return "not_found";
  const { error } = await db.from("workbook_instructions").upsert({
    child_id: childId, parent_id: child.data.parent_id, schema_version: 1, instructions: { ...instructions },
    updated_at: new Date().toISOString(), updated_by: by.id, updated_by_email: by.email || null,
  }, { onConflict: "child_id" });
  if (error) throw new Error(`book instructions save: ${error.message}`);
  return "saved";
}

/** Clears the child's set: the next books use the automatic plan. */
export async function clearWorkbookInstructions(db: SupabaseClient<Database>, childId: string): Promise<void> {
  const { error } = await db.from("workbook_instructions").delete().eq("child_id", childId);
  if (error) throw new Error(`book instructions clear: ${error.message}`);
}
