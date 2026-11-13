"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// #314: the buttons that approve a draft and mark a workbook printed, then shipped. D-308: before approving a next-book
// draft, "Update with new marks" and the "Update first?" question. One confirm each; the server checks
// again and answers why it refused. After a change the page reloads its data (approval opens the stored workbook).

const LOST = "The response was lost. Reload the page to see whether it changed.";

async function post(url: string, body: unknown): Promise<{ status: number; result: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, result: res.status === 404 ? null : await res.json() };
}

/** POST to "Update with new marks" (D-308): one status line back; the page reloads its data when it worked. */
function useUpdateWithNewMarks(runId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  async function update() {
    if (busy) return;
    setBusy(true);
    setLine("");
    try {
      const { status, result } = await post(`/api/admin/workbooks/runs/${runId}/update-marks`, {});
      if (!result) { setLine(status === 404 ? "This draft is unavailable or your admin access has ended." : LOST); return; }
      setLine(typeof result.line === "string" ? result.line : "It could not be updated. Try again later.");
      if (result.ok) router.refresh();
    } catch { setLine(LOST); }
    finally { setBusy(false); }
  }
  return { busy, line, update };
}

/**
 * D-308: the marks of the current book this next-book draft did not use, with "Update with new marks". `line` is null
 * when there are none; `updated` names the plan version an earlier update wrote.
 */
export function NewMarksNotice({ runId, line, updated, ready, unavailable = false }: { runId: string; line: string | null; updated: number | null; ready: boolean; unavailable?: boolean }) {
  const { busy, line: status, update } = useUpdateWithNewMarks(runId);
  if (unavailable) return <p className="adm-note adm-wb-full" role="note">New marks status is unavailable.</p>;
  if (!line) {
    return updated ? <p className="adm-note adm-wb-full" role="note">Plan updated with the new marks (plan version {updated}). The pages are not drawn again yet.</p> : null;
  }
  return <div className="adm-note adm-wb-full" role="note">
    <p><b>{line}.</b> This draft was planned before these pages were marked.</p>
    <button type="button" className="btn adm-btn" onClick={update} disabled={busy || !ready}>{busy ? "Updating..." : "Update with new marks"}</button>
    {!ready && <p>The planner is not ready yet.</p>}
    {status && <p role="status">{status}</p>}
  </div>;
}

/**
 * "Approve for print" on a run's draft, at the revision the admin sees. `newMarks`: the page's own D-308 check; the
 * server checks again and answers `askUpdate` when marks arrived since the page loaded.
 */
export function ApproveDraft({ runId, revision, workbookPath, child, pending, newMarks = null, ready = true }: {
  runId: string; revision: number; workbookPath: string; child: string; pending: number; newMarks?: string | null; ready?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [askPending, setAskPending] = useState(false);
  const [askUpdate, setAskUpdate] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const updater = useUpdateWithNewMarks(runId);
  async function approve(despiteNewMarks = false) {
    if (busy || !window.confirm(`Approve this version of ${child}'s workbook for print? It is stored as the workbook to print, and any later edit needs approval again.`)) return;
    setBusy(true);
    setErrors([]);
    try {
      const { status, result } = await post(`/api/admin/workbooks/runs/${runId}/approve`, despiteNewMarks ? { revision, despiteNewMarks } : { revision });
      if (!result) { setErrors([status === 404 ? "This draft is unavailable or your admin access has ended." : LOST]); return; }
      if (result.ok) { router.push(workbookPath); return; }
      if (typeof result.askUpdate === "string") { setAskUpdate(result.askUpdate); return; }
      setErrors(Array.isArray(result.reasons) ? result.reasons.map(String) : [result.error === "unavailable" ? "The database is unavailable. Try again later." : "It was not approved."]);
    } catch { setErrors([LOST]); }
    finally { setBusy(false); }
  }
  /** After the comments question: ask "Update first?" when the page already knows of new marks. */
  const next = () => newMarks ? setAskUpdate(newMarks) : void approve();
  return <>
    <button type="button" className="btn adm-btn" onClick={() => pending ? setAskPending(true) : next()} disabled={busy}>{busy ? "Approving..." : `Approve version ${revision} for print`}</button>
    {askPending && <div role="dialog" aria-modal="true" aria-labelledby="unsent-comments-title" className="adm-note adm-wb-full">
      <p id="unsent-comments-title">There {pending === 1 ? "is 1 unsent comment" : `are ${pending} unsent comments`}. Send {pending === 1 ? "it" : "them"} first?</p>
      <button type="button" className="btn adm-btn" onClick={() => setAskPending(false)}>Return to comments</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => { setAskPending(false); next(); }}>Continue to approval</button>
    </div>}
    {askUpdate && <div role="dialog" aria-modal="true" aria-labelledby="update-first-title" className="adm-note adm-wb-full">
      <p id="update-first-title"><b>Update first?</b> {askUpdate}. This draft does not use them yet.</p>
      <button type="button" className="btn adm-btn" onClick={updater.update} disabled={updater.busy || !ready}>{updater.busy ? "Updating..." : "Update with new marks"}</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => { setAskUpdate(null); void approve(true); }} disabled={busy}>Approve anyway</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => setAskUpdate(null)}>Cancel</button>
      {!ready && <p>The planner is not ready yet.</p>}
      {updater.line && <p role="status">{updater.line}</p>}
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
