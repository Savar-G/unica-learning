import { NOT_STATED, recordPathSteps, type ReferenceRecord } from "@/lib/reference-record";
import { isSentinel } from "@/lib/reference-record/validate-parts";

// A copy of a record in which every place that single_read names holds "not_stated". Code that reads
// this copy treats a once-read value like a value that the page does not state.
export function trustedView(record: ReferenceRecord): Record<string, unknown> {
  const view = structuredClone(record) as unknown as Record<string, unknown>;
  for (const path of record.single_read ?? []) {
    const steps = recordPathSteps(path);
    if (steps === null) throw new Error(`${record.source_ref}: bad single_read path "${path}"`);
    redact(view, steps);
  }
  delete view.single_read;
  delete view.readers;
  return view;
}

function redact(root: Record<string, unknown>, steps: Array<string | number>): void {
  let node: unknown = root;
  for (const [i, step] of steps.entries()) {
    // An entry above this place is already redacted.
    if (typeof node !== "object" || node === null) return;
    const holder = node as Record<string | number, unknown>;
    if (i === steps.length - 1) holder[step] = NOT_STATED;
    else node = holder[step];
  }
}

// True when single_read names this place, a place inside it, or a place around it.
export function isOnceRead(record: ReferenceRecord, path: string): boolean {
  const inside = (outer: string, inner: string): boolean =>
    inner === outer || inner.startsWith(`${outer}.`) || inner.startsWith(`${outer}[`);
  return (record.single_read ?? []).some((p) => inside(p, path) || inside(path, p));
}

export function holdsSentinel(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(holdsSentinel);
  if (typeof value === "object" && value !== null) return Object.values(value).some(holdsSentinel);
  return isSentinel(value);
}

// The value when it is in the list, else "not_stated".
export function knownOr<T extends string>(value: unknown, allowed: readonly T[]): T | typeof NOT_STATED {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : NOT_STATED;
}
