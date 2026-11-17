"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export function CustomerContactNote({ parent, people }: { parent: string; people: { id: string; name: string }[] }) {
  const router = useRouter(), request = useRef<string | null>(null);
  const [note, setNote] = useState(""), [child, setChild] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    request.current ??= crypto.randomUUID();
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/customer-activity", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent, child: child || null, note, request: request.current }) });
      if (!response.ok) throw new Error("save");
      setNote(""); request.current = null; setMessage("Contact note saved."); router.refresh();
    } catch { setMessage("The save was not confirmed. Your text stays here. Try again."); }
    finally { setBusy(false); }
  }
  return <details className="rec-fold"><summary>Add a private contact note</summary>
    <p>Only the team can read this note. It stays until the family or selected child is deleted. It does not go to Slack or learning records.</p>
    <form onSubmit={submit} className="adm-filters">
      <label>About<select value={child} disabled={busy} onChange={e => { setChild(e.target.value); request.current = null; }}><option value="">Family</option>{people.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Contact note<textarea required maxLength={2000} rows={4} value={note} disabled={busy} onChange={e => { setNote(e.target.value); request.current = null; }} /></label>
      <button className="btn ghost adm-btn" disabled={busy || !note.trim()}>{busy ? "Saving..." : "Save note"}</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
