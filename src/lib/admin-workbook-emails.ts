import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import type { Workbook } from "@/lib/workbook-content";

/** Read with the admin's session. The stored book, rather than a browser selection, identifies the family and child. */
export async function getWorkbookEmailPanel(admin: AdminSession, book: Pick<Workbook, "parentId" | "childId" | "number">) {
  const { data: card, error: cardError } = await admin.db.rpc("admin_card_setups").select("id")
    .eq("parent_id", book.parentId).eq("child_id", book.childId).not("card_saved_at", "is", null).maybeSingle();
  if (cardError) throw Error("Cannot load the workbook's saved card");
  if (!card) return null;
  const [parent, child, emails] = await Promise.all([
    admin.db.rpc("admin_parents").select("name, email").eq("id", book.parentId).maybeSingle(),
    admin.db.rpc("admin_children").select("first_name").eq("id", book.childId).eq("parent_id", book.parentId).maybeSingle(),
    admin.db.from("workbook_emails").select("id, kind, workbook_number, status, claimed_at, sent_at, delivery, subject, text_body")
      .eq("card_setup_id", card.id).in("kind", ["ready", "dispatch"]).eq("workbook_number", book.number).order("created_at").order("id"),
  ]);
  if (parent.error || child.error || emails.error || !parent.data || !child.data) throw Error("Cannot load the workbook's email details");
  return { cardId: card.id, parentName: parent.data.name, parentEmail: parent.data.email, childName: child.data.first_name,
    records: emails.data, observedAt: Date.now() };
}
