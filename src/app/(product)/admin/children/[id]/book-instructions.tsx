import type { AdminSession } from "@/lib/admin-store";
import { isGrade, type Grade } from "@/lib/assessment";
import { storedChildProfile } from "@/lib/child-profile";
import { when } from "@/lib/admin-view";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { instructionPicker } from "@/lib/workbook-instructions";
import { readWorkbookInstructions } from "@/lib/workbook-instructions-store";
import { PLACEMENT_CEILING, placeChild } from "@/lib/workbook-placement";
import { WorkbookInstructionsForm } from "@/components/workbook-instructions-form";

/** The child's book instructions, read with the admin's session, and the automatic level placement chooses now. */
export async function loadBookInstructions(admin: AdminSession, child: { id: string; grade: number; province: string }, workbooks: readonly { number: number; levels: number[] }[]) {
  const curriculum = child.province === "BC" ? curriculumFor("bc") : null;
  const stored = await readWorkbookInstructions(admin.db, child.id);
  let autoLevel: string | null = null;
  if (curriculum && isGrade(child.grade)) {
    // Only a hint for the form: a profile that cannot be read leaves "Automatic" without a level.
    const { data } = await admin.db.from("child_profiles").select("profile").eq("child_id", child.id).maybeSingle();
    try {
      autoLevel = placeChild({ curriculum, grade: child.grade as Grade, profile: data ? storedChildProfile(data.profile) : null, workbooks }).level.id;
    } catch { autoLevel = null; }
  }
  return { stored, autoLevel, levels: curriculum ? instructionPicker(curriculum, PLACEMENT_CEILING) : null };
}

export function BookInstructions({ child, note, data }: {
  child: { id: string; first_name: string; grade: number };
  note: string;
  data: Awaited<ReturnType<typeof loadBookInstructions>>;
}) {
  return <>
    <h2 id="book-instructions-title">Book instructions</h2>
    <p>Set these after a results call with the family. They apply to every next workbook until you change or clear them. Each run keeps the set it was made with and shows which ones applied.</p>
    <p className="adm-note">{data.stored ? `Saved by ${data.stored.updatedBy ?? "an admin"} on ${when(data.stored.updatedAt)} (Pacific).` : "No instructions saved: the next workbook uses the automatic plan."}</p>
    {!data.levels ? <p role="status">A workbook curriculum is not available for this child.</p> : <>
      <p className="adm-hint">
        <strong>What the parent said {child.first_name} finds hard:</strong> {note ? `“${note}”` : "No answer on the learning card."} This is a hint for you; the book never reads it.
      </p>
      <WorkbookInstructionsForm childId={child.id} child={child.first_name} schoolGrade={child.grade} levels={data.levels} autoLevel={data.autoLevel}
        saved={data.stored && { startLevel: data.stored.instructions.startLevel, teachMore: data.stored.instructions.teachMore, teachLess: data.stored.instructions.teachLess,
          addReview: data.stored.instructions.addReview, difficulty: data.stored.instructions.difficulty }} />
    </>}
  </>;
}
