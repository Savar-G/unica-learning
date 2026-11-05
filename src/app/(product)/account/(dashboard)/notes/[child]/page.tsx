import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import { NoteCard } from "@/components/parent-maya-notes";
import { DemoMinutesLine, MinutesRow } from "@/components/parent-home-rows";
import { mayaWeek, parentNotesFamily } from "@/lib/parent-maya-notes-server";
import { listParentMayaNotes, notesPath } from "@/lib/parent-maya-notes";
import { pageMetadata } from "@/lib/metadata";

export const metadata = pageMetadata({ path: "/account/notes", title: "Notes from Maya", description: "Your child's notes from Maya.", index: false });

// A child's notes from Maya. In the dashboard, for a child with the Maya tab (#553), this page is that tab: the minutes
// left this week above the notes, and the tabs as the way back. It has no pattern line: no code counts a pattern across
// calls today, and the tab shows only what code counted.
export default async function ParentNotes({ params, searchParams }: PageProps<"/account/notes/[child]">) {
  const { child: childId } = await params;
  const { db, parent, child, zone, mayaTab } = await parentNotesFamily(childId);
  const [{ notes, older, newer }, week] = await Promise.all([
    listParentMayaNotes(db, parent, child.id, (await searchParams).cursor),
    mayaTab ? mayaWeek(db, parent, zone, child) : null,
  ]);
  const pageLink = (cursor: string) => cursor === "start" ? notesPath(child.id) : `${notesPath(child.id)}?cursor=${cursor}`;
  return <SupportPage label={mayaTab ? "Maya" : "Notes from Maya"} title={child.first_name}>
    {mayaTab
      ? (week?.minutes || week?.chat) && <div className="maya-tab-week"><MinutesRow name={child.first_name} minutes={week.minutes} chat={week.chat} /></div>
      : <Link className="maya-notes-back" href="/account">← Back to your account</Link>}
    {mayaTab && <h2 className="maya-tab-notes">Notes from Maya</h2>}
    {notes.length ? <ul className="maya-notes-list">{notes.map((note) => <li key={note.call_id}>
      <NoteCard note={note} name={child.first_name} zone={zone} />
    </li>)}</ul> : <p>{newer ? "There are no older notes." : "There are no notes from Maya yet."}</p>}
    <nav className="maya-notes-nav" aria-label="Notes pages">
      {newer && <Link href={pageLink(newer)}>← Newer notes</Link>}
      {older && <Link href={pageLink(older)}>Older notes →</Link>}
    </nav>
    {week?.minutes && <DemoMinutesLine />}
  </SupportPage>;
}
