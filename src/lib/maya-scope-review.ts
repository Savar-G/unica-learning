import type { ScopeRefusal } from "@/lib/maya";

/**
 * One call's stored refusals: the trace's once the call has one, else the live session's (the trace and the live state
 * describe the same call, so a call counts once, also before it ends). A trace with no refusal list counts none.
 */
export function callRefusals(r: {
  trace: { scopeRefusals?: ScopeRefusal[] } | null;
  live: { text: { session: { scopeRefusals?: ScopeRefusal[] } } } | null;
}): { refusals: readonly ScopeRefusal[] | null | undefined } {
  return { refusals: r.trace ? r.trace.scopeRefusals : r.live?.text.session.scopeRefusals };
}

/** The refusals of every call, each call's list as callRefusals picks it (the admin page reads only that list's JSON path). */
export function scopeSummary(records: readonly { refusals: readonly ScopeRefusal[] | null | undefined }[]) {
  const refusals = records.flatMap(r => r.refusals ?? []);
  return { count: refusals.length, reasons: Object.fromEntries([...new Set(refusals.map(r => r.reason))].map(reason => [reason, refusals.filter(r => r.reason === reason).length])) };
}
