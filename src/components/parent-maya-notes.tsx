import Link from "next/link";
import { noteSentences, noteTranscriptLines, type Finished } from "@/lib/maya-call-note";
import { notePath, notesPath, notePlace, sessionKind, sessionWhen, type ParentNote, type ParentNoteSession } from "@/lib/parent-maya-notes";
import type { FamilyZone } from "@/lib/family-time";
import { SupportPage } from "@/components/support-page";
import "./parent-maya-notes.css";

const RESULTS: Record<Finished, string> = {
  on_own: "Finished alone", with_help: "Finished with help", answer_given: "Maya gave the answer", not_finished: "Not finished",
};

export function NoteResult({ note }: { note: ParentNote }) {
  return <span className={`maya-note-result is-${note.facts.finished}`}>{RESULTS[note.facts.finished]}</span>;
}

export function NoteText({ note, name }: { note: ParentNote; name: string }) {
  // The first sentence's question location is already in the heading. Keep every remaining stored sentence.
  const words = (s: string) => note.channel === "chat" ? s.replace(/\bcall\b/g, "chat").replace(/\bCall\b/g, "Chat") : s;
  // Change only the stored code sentences, before restoring a name such as "Call".
  const sentences = noteSentences({ sentences: note.sentences.slice(1).map(words), warm: note.warm ? words(note.warm) : null }, name);
  return <div className="maya-note-text">{sentences.map((s, i) => <p key={i} className={note.warm && i === sentences.length - 1 ? "maya-note-warm" : undefined}>{s}</p>)}</div>;
}

export function NoteCard({ note, name, zone, latest = false }: { note: ParentNote; name: string; zone: FamilyZone; latest?: boolean }) {
  return <section className={latest ? "maya-note-latest" : "maya-note-item"} aria-label={`${latest ? "Latest note" : "Note"} from Maya for ${name}`}>
    {latest && <h3>Latest note from Maya</h3>}
    <div className="maya-note-card">
      <div className="maya-note-head">
        <b>{sessionKind(note)}</b><time dateTime={note.startedAt}>{sessionWhen(note, zone)}</time>
      </div>
      <div className="maya-note-details"><NoteResult note={note} /><span>{notePlace(note)}</span></div>
      <NoteText note={note} name={name} />
      <div className="maya-note-links">
        <Link href={notePath(note)}>Read the {sessionKind(note).toLowerCase()}</Link>
        {latest && <Link href={notesPath(note.child_id)}>All notes</Link>}
      </div>
    </div>
  </section>;
}

function elapsed(second: number) {
  const whole = Math.max(0, Math.floor(second));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function NoteTranscript({ note, name }: { note: ParentNoteSession; name: string }) {
  const lines = noteTranscriptLines(note, name);
  return <section className="maya-note-transcript" aria-labelledby="maya-transcript-title">
    <h2 id="maya-transcript-title">What {name} and Maya said</h2>
    {lines.length ? <ol>{lines.map((line, i) => line.speaker === "note"
      ? <li key={i} className="maya-note-marker">{elapsed(line.second)} · {line.text}</li>
      : <li key={i} className={`maya-note-line is-${line.speaker}`}>
        <span className="maya-note-avatar" aria-hidden="true">{line.speaker === "maya"
          // eslint-disable-next-line @next/next/no-img-element -- Existing small local avatar; no layout change on load.
          ? <img src="/desk/maya.webp" alt="" width="36" height="36" /> : name.slice(0, 1)}</span>
        <div><div className="maya-note-speaker">{line.speaker === "maya" ? "Maya" : name} · {elapsed(line.second)}</div><p>{line.text}</p></div>
      </li>)}</ol> : <p>The words from this {sessionKind(note).toLowerCase()} are not available.</p>}
  </section>;
}

export function ParentSessionView({ note, name, zone }: { note: ParentNoteSession; name: string; zone: FamilyZone }) {
  return <SupportPage label={`${sessionKind(note)} with Maya`} title={`${name} · ${notePlace(note)}`}>
    <Link className="maya-notes-back" href="/account">← Back to your account</Link>
    <p><time dateTime={note.startedAt}>{sessionWhen(note, zone)}</time></p>
    <div className="maya-note-summary">
      <NoteText note={note} name={name} />
      <dl className="maya-note-facts">
        {note.facts.question.text && <><dt>Question</dt><dd><span className="maya-note-question">{note.facts.question.text}</span></dd></>}
        <dt>Result</dt><dd><NoteResult note={note} /></dd>
        <dt>{sessionKind(note)} length</dt><dd>{note.facts.minutes} {note.facts.minutes === 1 ? "minute" : "minutes"}</dd>
      </dl>
    </div>
    <NoteTranscript note={note} name={name} />
    <p className="maya-note-footnote">Maya is an AI math helper.{note.channel === "call" && " We keep the words of the call, never a recording."}</p>
    <nav className="maya-notes-nav" aria-label="More notes"><Link href={notesPath(note.child_id)}>All notes for {name} →</Link></nav>
  </SupportPage>;
}
