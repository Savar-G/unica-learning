import { notFound } from "next/navigation";
import { ParentSessionView } from "@/components/parent-maya-notes";
import { parentNotesFamily } from "@/lib/parent-maya-notes-server";
import { notesPath, readParentMayaNote } from "@/lib/parent-maya-notes";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/notes", title: "Note from Maya", description: "Your child's conversation with Maya.", index: false });

export default async function ParentSession({ params }: PageProps<"/account/notes/[child]/[session]">) {
  const { child: childId, session } = await params;
  const { db, parent, child, zone, mayaTab } = await parentNotesFamily(childId);
  const note = await readParentMayaNote(db, parent, child.id, session);
  if (!note) notFound();
  // In the Maya tab (#553) the way back is the tab.
  return <ParentSessionView note={note} name={child.first_name} zone={zone} back={mayaTab ? { href: notesPath(child.id), label: "← Back to Maya" } : undefined} />;
}
