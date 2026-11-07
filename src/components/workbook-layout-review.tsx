"use client";

import { useState } from "react";
import type { ReviewComment } from "@/lib/workbook-edit";
import type { LayoutResolution } from "@/lib/workbook-layout-edit";

/** Review results are explicit. A partial result never closes its comment. */
export function WorkbookLayoutReview({ comments, pages, busy, apply }: {
  comments: ReviewComment[]; pages: number[]; busy: boolean; apply(body: object): Promise<boolean>;
}) {
  const [results, setResults] = useState<Record<string, { status: LayoutResolution["status"] | "unresolved"; note: string }>>({});
  const [scope, setScope] = useState("");
  const [reviewed, setReviewed] = useState(false), [error, setError] = useState("");
  if (!comments.length) return null;
  const selected = comments.filter(c => results[c.id]?.status && results[c.id].status !== "unresolved");
  async function submit() {
    setError("");
    const unresolvedOnly = selected.length > 0 && selected.every(c => results[c.id].status === "unsupported");
    const requested = !scope.trim() && unresolvedOnly ? [...new Set(selected.map(c => c.page))]
      : scope.trim().toLowerCase() === "all" ? pages : scope.split(",").map(n => Number(n.trim()));
    if ((!scope.trim() && !unresolvedOnly) || requested.some(n => !Number.isInteger(n) || !pages.includes(n)) || new Set(requested).size !== requested.length
      || !selected.length
      || selected.some(c => !requested.includes(c.page) || !results[c.id].note.trim()) || !reviewed) {
      setError("Select the affected pages and give a reviewed result for each selected comment. Partial and unsupported comments stay open."); return;
    }
    const sent = await apply({ reviewed: true, pages: requested,
      results: selected.map(c => ({ id: c.id, page: c.page, status: results[c.id].status, note: results[c.id].note })) });
    if (sent) { setResults({}); setReviewed(false); }
  }
  return <details className="wbr-layout-review">
    <summary>Review page-layout changes ({comments.length})</summary>
    <p>Cover, instruction and layout requests need a reviewed template correction. After that correction is ready, render the stored questions again. No question or answer is rewritten here.</p>
    {comments.map(c => <fieldset key={c.id} disabled={busy}>
      <legend>Page {c.page}{c.question === null ? "" : `, question ${c.question}`}</legend><p>{c.note}</p>
      <label>Reviewed result<select value={results[c.id]?.status ?? "unresolved"}
        onChange={e => setResults(current => ({ ...current, [c.id]: { note: current[c.id]?.note ?? "", status: e.target.value as LayoutResolution["status"] | "unresolved" } }))}>
        <option value="unresolved">Not ready</option><option value="applied">The correction is ready</option>
        <option value="partial">Only part is ready - keep open</option><option value="unsupported">Cannot apply - keep open</option>
      </select></label>
      <label>What changed, or what still needs work?<textarea maxLength={2000} value={results[c.id]?.note ?? ""}
        onChange={e => setResults(current => ({ ...current, [c.id]: { status: current[c.id]?.status ?? "unresolved", note: e.target.value } }))} /></label>
    </fieldset>)}
    <label>Affected page numbers<input disabled={busy} value={scope} placeholder="1, 2, 6 or all" onChange={e => setScope(e.target.value)} /></label>
    <p>Include later pages only when they use the corrected template. Other saved page images stay in place.</p>
    <label><input type="checkbox" disabled={busy} checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the template correction and these results.</label>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn adm-btn" disabled={busy || !reviewed || !selected.length} onClick={() => void submit()}>{selected.length > 0 && selected.every(c => results[c.id].status === "unsupported") ? "Save unresolved results" : "Render reviewed layout changes"}</button>
  </details>;
}
