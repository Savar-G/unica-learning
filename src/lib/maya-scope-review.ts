import type { ScopeRefusal } from "@/lib/maya";

/** Trace and live state describe the same call. Count it once, including before the call ends. */
export function scopeSummary(records: readonly {
  trace: { scopeRefusals?: ScopeRefusal[] } | null;
  live: { text: { session: { scopeRefusals?: ScopeRefusal[] } } } | null;
}[]) {
  const refusals = records.flatMap(r => (r.trace ? r.trace.scopeRefusals : r.live?.text.session.scopeRefusals) ?? []);
  return { count: refusals.length, reasons: Object.fromEntries([...new Set(refusals.map(r => r.reason))].map(reason => [reason, refusals.filter(r => r.reason === reason).length])) };
}
