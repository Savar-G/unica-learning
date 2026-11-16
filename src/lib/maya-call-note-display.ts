// Pure display helpers shared by parent pages and the browser-only admin preview.
import type { CallNote, NoteTranscriptLine } from "@/lib/maya-call-note";

export const CHILD = "{child}";

/** Puts the child's first name in place of {child}. */
const fillName = (s: string, childName: string) => s.split(CHILD).join(childName.trim() || "Your child");

/** The note's sentences for the screen, with the child's first name in place of {child}. */
export function noteSentences(note: Pick<CallNote, "sentences" | "warm">, childName: string): string[] {
  return [...note.sentences, ...(note.warm ? [note.warm] : [])].map((s) => fillName(s, childName));
}

/** The note's transcript for the screen, with the child's first name in place of {child}. */
export function noteTranscriptLines(note: Pick<CallNote, "transcript">, childName: string): NoteTranscriptLine[] {
  return note.transcript.map((l) => ({ ...l, text: fillName(l.text, childName) }));
}

