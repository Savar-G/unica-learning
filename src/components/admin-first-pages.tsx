"use client";

// The first pages of Workbook 1 on the admin child page (docs/first-pages.md): each set's state, what it took, its four
// pages, and the two actions a team member may need: make the first pages of the newest finished test (one test, for a
// check before the switches go on), and the choice after Workbook 1's plan stopped matching the pages.
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface AdminFirstPagesSet {
  id: string;
  assessmentId: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  readyAt: string | null;
  keptBy: string | null;
  decision: "keep-plan" | "drop" | null;
  counts: { dayPages: number; writerCalls: number; solveChecks: number; usd: number | null } | null;
  images: { number: number; url: string }[];
  pdfUrl: string | null;
}

const STATUS: Record<string, string> = {
  queued: "Waiting to be made", running: "Being made", ready: "Ready", failed: "Failed", unavailable: "Not possible for this test", hidden: "Hidden (made without them)",
};

export function AdminFirstPages({ sets, newestTest, child }: { sets: AdminFirstPagesSet[]; newestTest: string | null; child: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const post = async (url: string, body?: unknown) => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
      const answer = await res.json().catch(() => null) as { ok?: boolean; error?: string; status?: string } | null;
      if (!res.ok || !answer?.ok) setNote(answer?.error ?? `It did not work (${res.status}).`);
      else router.refresh();
    } catch { setNote("The response was lost. Reload the page."); }
    finally { setBusy(false); }
  };
  const canQueue = newestTest && !sets.some((s) => s.assessmentId === newestTest);
  return <div className="adm-fp">
    {sets.length === 0 && <p className="adm-note">No first pages yet.</p>}
    {sets.map((s) => (
      <div key={s.id} className="adm-fp-set">
        <p><b>{STATUS[s.status] ?? s.status}</b>{s.status === "ready" && s.keptBy ? " · kept by Workbook 1" : ""}{s.decision === "keep-plan" ? " · Workbook 1 uses their plan" : ""} · attempt {s.attempts}
          {s.counts && <> · {s.counts.dayPages} day pages, {s.counts.writerCalls} AI page calls, {s.counts.solveChecks} solve checks, {s.counts.usd === null ? "cost not known (subscription or fake)" : `USD ${s.counts.usd.toFixed(4)}`}</>}</p>
        {s.error && <p className="adm-note">{s.error}</p>}
        {s.images.length > 0 && <div className="adm-fp-pages">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.images.map((i) => <a key={i.number} href={i.url} target="_blank" rel="noreferrer"><img src={i.url} alt={`Page ${i.number}`} width={120} /></a>)}
          {s.pdfUrl && <a href={s.pdfUrl} target="_blank" rel="noreferrer">PDF</a>}
        </div>}
        {s.status === "ready" && !s.keptBy && <div className="adm-row">
          <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => window.confirm(`Make ${child}'s Workbook 1 from the plan these pages were made from?`) && post(`/api/admin/first-pages/${s.id}/decide`, { decision: "keep-plan" })}>Use the first pages&apos; plan</button>
          <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => window.confirm(`Make ${child}'s Workbook 1 without these pages? They will no longer show on the report.`) && post(`/api/admin/first-pages/${s.id}/decide`, { decision: "drop" })}>Make it without the first pages</button>
        </div>}
      </div>
    ))}
    {canQueue && <div className="adm-row">
      <button type="button" className="btn ghost adm-btn" disabled={busy} onClick={() => window.confirm(`Make the first pages of ${child}'s newest test? The AI writes three pages. No email goes while the email switch is off.`) && post(`/api/admin/assessments/${newestTest}/first-pages`)}>Make first pages for the newest test</button>
    </div>}
    {note && <p role="alert" className="adm-note">{note}</p>}
  </div>;
}
