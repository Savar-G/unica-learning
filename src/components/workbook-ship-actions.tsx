"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { NewMarksView } from "@/lib/next-book-refresh";

// #314: the buttons that approve a draft and mark a workbook printed, then shipped. D-308: before approving a next-book
// draft, "Update with new marks" and the "Update first?" question. One confirm each; the server checks
// again and answers why it refused. After a change the page reloads its data (approval opens the stored workbook).

const LOST = "The response was lost. Reload the page to see whether it changed.";

async function post(url: string, body: unknown): Promise<{ status: number; result: Record<string, unknown> | null }> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, result: res.status === 404 ? null : await res.json() };
}

/** POST to "Update with new marks" (D-308): one status line back. `onDone` runs after every answer the server gave. */
function useUpdateWithNewMarks(runId: string) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  async function update(onDone?: (ok: boolean) => void) {
    if (busy) return;
    setBusy(true);
    setLine("");
    try {
      const { status, result } = await post(`/api/admin/workbooks/runs/${runId}/update-marks`, {});
      if (!result) { setLine(status === 404 ? "This draft is unavailable or your admin access has ended." : LOST); return; }
      setLine(typeof result.line === "string" ? result.line : "It could not be updated. Try again later.");
      // A failed press may still have written a revision: the caller reads the check again to show the true state.
      onDone?.(result.ok === true);
    } catch { setLine(LOST); }
    finally { setBusy(false); }
  }
  return { busy, line, update };
}

/**
 * D-308: the marks of the current book this next-book draft's pages were not drawn from, with "Update with new marks".
 * `view` is the server's check (GET .../new-marks); `onChanged` reads it again after a press.
 */
export function NewMarksNotice({ runId, view, onChanged }: { runId: string; view: NewMarksView; onChanged: () => void }) {
  const { busy, line: status, update } = useUpdateWithNewMarks(runId);
  if (view.state === "unavailable") return <p className="adm-note adm-wb-full" role="note">New marks status is unavailable.</p>;
  if (view.state !== "new") return null;
  return <div className="adm-note adm-wb-full" role="note">
    <p><b>{view.line}.</b> This draft was planned before these pages were marked.</p>
    {view.updated !== null && <p>Plan updated with the new marks (plan version {view.updated}). The pages are not drawn again yet.</p>}
    {view.unfinished !== null && <p>Plan version {view.unfinished} was saved but not planned yet. Press Update with new marks again.</p>}
    {view.canUpdate && <button type="button" className="btn adm-btn" onClick={() => void update(() => onChanged())} disabled={busy || !view.ready}>{busy ? "Updating..." : "Update with new marks"}</button>}
    {!view.ready && view.canUpdate && <p>The planner is not ready yet.</p>}
    {status && <p role="status">{status}</p>}
  </div>;
}

/** The question before an approval: new marks ("Update first?") or a check that could not be read. */
type Ask = { line: string; unavailable: boolean; confirmed: boolean };

/**
 * "Approve for print" on a run's draft, at the revision the admin sees. `newMarks`: the page's own D-308 check; the
 * server checks again and answers `askUpdate` when marks arrived since, or when it cannot check (`checkUnavailable`).
 */
export function ApproveDraft({ runId, revision, workbookPath, child, pending, newMarks = null, onMarksChanged }: {
  runId: string; revision: number; workbookPath: string; child: string; pending: number; newMarks?: NewMarksView | null; onMarksChanged?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [askPending, setAskPending] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const updater = useUpdateWithNewMarks(runId);
  /** `confirmed`: the admin already confirmed this approval before the server's question. */
  async function approve(despiteNewMarks = false, confirmed = false) {
    if (busy || (!confirmed && !window.confirm(`Approve this version of ${child}'s workbook for print? It is stored as the workbook to print, and any later edit needs approval again.`))) return;
    setBusy(true);
    setErrors([]);
    try {
      const { status, result } = await post(`/api/admin/workbooks/runs/${runId}/approve`, despiteNewMarks ? { revision, despiteNewMarks } : { revision });
      if (!result) { setErrors([status === 404 ? "This draft is unavailable or your admin access has ended." : LOST]); return; }
      if (result.ok) { router.push(workbookPath); return; }
      if (typeof result.askUpdate === "string") { setAsk({ line: result.askUpdate, unavailable: result.checkUnavailable === true, confirmed: true }); return; }
      setErrors(Array.isArray(result.reasons) ? result.reasons.map(String) : [result.error === "unavailable" ? "The database is unavailable. Try again later." : "It was not approved."]);
    } catch { setErrors([LOST]); }
    finally { setBusy(false); }
  }
  /** After the comments question: ask first when the page already knows of new marks, or could not check them. */
  const next = () => {
    if (newMarks?.state === "new") setAsk({ line: newMarks.line, unavailable: false, confirmed: false });
    else if (newMarks?.state === "unavailable") setAsk({ line: "The new marks could not be checked", unavailable: true, confirmed: false });
    else void approve();
  };
  const ready = newMarks && newMarks.state !== "none" ? newMarks.ready : true;
  const canUpdate = newMarks?.state === "new" ? newMarks.canUpdate : true;
  const updateFirst = () => void updater.update((ok) => { if (ok) setAsk(null); onMarksChanged?.(); });
  return <>
    <button type="button" className="btn adm-btn" onClick={() => pending ? setAskPending(true) : next()} disabled={busy}>{busy ? "Approving..." : `Approve version ${revision} for print`}</button>
    {askPending && <div role="dialog" aria-modal="true" aria-labelledby="unsent-comments-title" className="adm-note adm-wb-full">
      <p id="unsent-comments-title">There {pending === 1 ? "is 1 unsent comment" : `are ${pending} unsent comments`}. Send {pending === 1 ? "it" : "them"} first?</p>
      <button type="button" className="btn adm-btn" onClick={() => setAskPending(false)}>Return to comments</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => { setAskPending(false); next(); }}>Continue to approval</button>
    </div>}
    {ask && <div role="dialog" aria-modal="true" aria-labelledby="update-first-title" className="adm-note adm-wb-full">
      {ask.unavailable
        ? <p id="update-first-title"><b>Approve anyway?</b> {ask.line}. The approval is noted as made without the check.</p>
        : <p id="update-first-title"><b>Update first?</b> {ask.line}. This draft does not use them yet.</p>}
      {!ask.unavailable && canUpdate && <><button type="button" className="btn adm-btn" onClick={updateFirst} disabled={updater.busy || !ready}>{updater.busy ? "Updating..." : "Update with new marks"}</button>{" "}</>}
      <button type="button" className="btn adm-btn" onClick={() => { const a = ask; setAsk(null); void approve(true, a.confirmed); }} disabled={busy}>Approve anyway</button>{" "}
      <button type="button" className="btn adm-btn" onClick={() => setAsk(null)}>Cancel</button>
      {!ask.unavailable && !ready && <p>The planner is not ready yet.</p>}
      {updater.line && <p role="status">{updater.line}</p>}
    </div>}
    {errors.length > 0 && <div role="alert" className="adm-note adm-wb-full">Not approved: <ul className="adm-wb-list">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
  </>;
}

/**
 * D-308, a next-book draft not yet approved: the new marks check, read once when the page opens and again after
 * "Update with new marks", never on the page's refresh loop (it reads the book's marks with the service key). Until it
 * answers, the approval works as before: the server checks again.
 */
export function NextBookApproval(props: { runId: string; revision: number; workbookPath: string; child: string; pending: number }) {
  const [view, setView] = useState<NewMarksView | null>(null);
  const [reads, setReads] = useState(0);
  const reload = useCallback(() => setReads((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    fetch(`/api/admin/workbooks/runs/${props.runId}/new-marks`, { cache: "no-store" })
      .then(async (res) => (res.status === 200 ? await res.json() as NewMarksView : { state: "unavailable", ready: true } as const))
      .catch(() => ({ state: "unavailable", ready: true } as const))
      .then((v) => { if (live) setView(v); });
    return () => { live = false; };
  }, [props.runId, reads]);
  return <>
    {view && <NewMarksNotice runId={props.runId} view={view} onChanged={reload} />}
    <ApproveDraft {...props} newMarks={view} onMarksChanged={reload} />
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
