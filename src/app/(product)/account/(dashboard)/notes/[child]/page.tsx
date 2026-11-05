import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import { NoteCard } from "@/components/parent-maya-notes";
import { parentNotesFamily } from "@/lib/parent-maya-notes-server";
import { listParentMayaNotes, notesPath } from "@/lib/parent-maya-notes";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/notes", title: "Notes from Maya", description: "Your child's notes from Maya.", index: false });

export default async function ParentNotes({ params, searchParams }: PageProps<"/account/notes/[child]">) {
  const { child: childId } = await params;
  const { db, parent, child, zone } = await parentNotesFamily(childId);
  const { notes, older, newer } = await listParentMayaNotes(db, parent, child.id, (await searchParams).cursor);
  const pageLink = (cursor: string) => cursor === "start" ? notesPath(child.id) : `${notesPath(child.id)}?cursor=${cursor}`;
  return <SupportPage label="Notes from Maya" title={child.first_name}>
    <Link className="maya-notes-back" href="/account">← Back to your account</Link>
    {notes.length ? <ul className="maya-notes-list">{notes.map((note) => <li key={note.call_id}>
      <NoteCard note={note} name={child.first_name} zone={zone} />
    </li>)}</ul> : <p>{newer ? "There are no older notes." : "There are no notes from Maya yet."}</p>}
    <nav className="maya-notes-nav" aria-label="Notes pages">
      {newer && <Link href={pageLink(newer)}>← Newer notes</Link>}
      {older && <Link href={pageLink(older)}>Older notes →</Link>}
    </nav>
  </SupportPage>;
}
