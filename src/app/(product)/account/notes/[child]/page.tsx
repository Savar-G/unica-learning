import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import { NoteCard } from "@/components/parent-maya-notes";
import { parentNotesFamily } from "@/lib/parent-maya-notes-server";
import { listParentMayaNotes, notesPage, notesPath } from "@/lib/parent-maya-notes";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/notes", title: "Notes from Maya", description: "Your child's notes from Maya.", index: false });

export default async function ParentNotes({ params, searchParams }: PageProps<"/account/notes/[child]">) {
  const { child: childId } = await params;
  const { db, parent, child, zone } = await parentNotesFamily(childId);
  const page = notesPage((await searchParams).page);
  const { notes, hasMore } = await listParentMayaNotes(db, parent, child.id, page);
  return <SupportPage label="Notes from Maya" title={child.first_name}>
    <Link className="maya-notes-back" href="/account">← Back to your account</Link>
    {notes.length ? <ul className="maya-notes-list">{notes.map((note) => <li key={note.call_id}>
      <NoteCard note={note} name={child.first_name} zone={zone} />
    </li>)}</ul> : <p>{page ? "There are no older notes." : "There are no notes from Maya yet."}</p>}
    <nav className="maya-notes-nav" aria-label="Notes pages">
      {page > 0 && <Link href={`${notesPath(child.id)}?page=${page}`}>← Newer notes</Link>}
      {hasMore && <Link href={`${notesPath(child.id)}?page=${page + 2}`}>Older notes →</Link>}
    </nav>
  </SupportPage>;
}
