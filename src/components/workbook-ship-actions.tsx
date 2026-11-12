"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// #314: the buttons that approve a draft and mark a workbook printed, then shipped. One confirm each; the server checks
// again and answers why it refused. After a change the page reloads its data (approval opens the stored workbook).

const LOST = "The response was lost. Reload the page to see whether it changed.";

async function post(url: string, body: unknown): Promise<{ status: number; result: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, result: res.status === 404 ? null : await res.json() };
}

/** "Approve for print" on a run's draft, at the revision the admin sees. */
export function ApproveDraft({ runId, revision, workbookPath, child, pending }: { runId: string; revision: number; workbookPath: string; child: string; pending: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [askPending, setAskPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  async function approve() {
    if (busy || !window.confirm(`Approve this version of ${child}'s workbook for print? It is stored as the workbook to print, and any later edit needs approval again.`)) return;
    setBusy(true);
    setErrors([]);
    try {
      const { status, result } = await post(`/api/admin/workbooks/runs/${runId}/approve`, { revision });
      if (!result) { setErrors([status === 404 ? "This draft is unavailable or your admin access has ended." : LOST]); return; }
      if (result.ok) { router.push(workbookPath); return; }
      setErrors(Array.isArray(result.reasons) ? result.reasons.map(String) : [result.error === "unavailable" ? "The database is unavailable. Try again later." : "It was not approved."]);
    } catch { setErrors([LOST]); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="btn adm-btn" onClick={() => pending ? setAskPending(true) : void approve()} disabled={busy}>{busy ? "Approving..." : `Approve version ${revision} for print`}</button>
    {askPending && <div role="dialog" aria-modal="true" aria-labelledby="unsent-comments-title" className="adm-note adm-wb-full">
      <p id="unsent-comments-title">There {pending === 1 ? "is 1 unsent comment" : `are ${pending} unsent comments`}. Send {pending === 1 ? "it" : "them"} first?</p>
      <button type="button" className="btn adm-btn" onClick={() => setAskPending(false)}>Return to comments</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => { setAskPending(false); void approve(); }}>Continue to approval</button>
    </div>}
    {errors.length > 0 && <div role="alert" className="adm-note adm-wb-full">Not approved: <ul className="adm-wb-list">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
  </>;
}

const MARK = {
  printed: { label: "Mark printed", busy: "Saving...", confirm: (n: number) => `Mark workbook ${n} printed? After this, the workbook cannot change.` },
  shipped: { label: "Mark shipped", busy: "Saving...", confirm: (n: number) => `Mark workbook ${n} shipped? The family can then read it in their account.` },
} as const;

/** "Mark printed" on an approved workbook, "Mark shipped" on a printed one. */
export function MarkWorkbook({ workbookId, to, number }: { workbookId: string; to: "printed" | "shipped"; number: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mark() {
    if (busy || !window.confirm(MARK[to].confirm(number))) return;
    setBusy(true);
    setError("");
    try {
      const { status, result } = await post(`/api/admin/workbooks/${workbookId}/status`, { to });
      if (!result) { setError(status === 404 ? "This workbook is unavailable or your admin access has ended." : LOST); return; }
      if (result.ok) { router.refresh(); return; }
      setError(typeof result.reason === "string" ? (result.reason.endsWith(".") ? result.reason : `Not changed: ${result.reason}.`) : "The database is unavailable. Try again later.");
    } catch { setError(LOST); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" className="btn adm-btn" onClick={mark} disabled={busy}>{busy ? MARK[to].busy : MARK[to].label}</button>
    {error && <p role="alert" className="adm-note adm-wb-full">{error}</p>}
  </>;
}
