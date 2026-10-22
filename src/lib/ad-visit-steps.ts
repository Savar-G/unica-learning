// Ad test steps (docs/ad-tracking.md): how far a visit from an ad gets before signup. A browser tab that has an ad
// visit ID (made by keepVisit, src/lib/visit-source.ts) posts each step once to /api/visit/step, which stores one row
// per visit and step in public.ad_visit_steps. No cookie, no consent needed, no form value: only the visit ID and the
// step name travel. Pure: the tab's storage and the sender are passed in.
import { VISIT_STORAGE_KEY, type TabStore } from "@/lib/visit-source";

/** The steps, in funnel order. The table's check allows the same. */
export const AD_STEPS = ["start_open", "form_start", "google_start", "code_sent"] as const;
export type AdStep = (typeof AD_STEPS)[number];

/** sessionStorage key of the steps this tab has sent already. */
export const STEPS_STORAGE_KEY = "unica:steps";

/** Steps /api/visit/step stores in 10 minutes before it stops. Four per visit at most, so four times the visit cap. */
export const STEP_RATE_MAX = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdStepPost {
  visitId: string;
  step: AdStep;
}

export interface AdStepRow {
  visit_id: string;
  step: AdStep;
}

const isStep = (v: unknown): v is AdStep => typeof v === "string" && (AD_STEPS as readonly string[]).includes(v);

/** The row to store for a posted step, or null when the post is not a valid visit ID and step. */
export function adStepRow(body: unknown): AdStepRow | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.visitId !== "string" || !UUID.test(b.visitId) || !isStep(b.step)) return null;
  return { visit_id: b.visitId.toLowerCase(), step: b.step };
}

function sentSteps(raw: string | null): AdStep[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(isStep) : [];
  } catch {
    return [];
  }
}

/**
 * Sends a step once per tab, and only from a tab that has an ad visit ID (a visit that did not come from an ad sends
 * nothing). Nothing is sent when the tab cannot keep the record, so a blocked storage never sends a step twice.
 */
export function markStep({ step, store, send }: { step: AdStep; store: TabStore; send: (post: AdStepPost) => void }): void {
  let visitId: string | null;
  try {
    visitId = store.getItem(VISIT_STORAGE_KEY);
    if (!visitId || !UUID.test(visitId)) return;
    const sent = sentSteps(store.getItem(STEPS_STORAGE_KEY));
    if (sent.includes(step)) return;
    const next = JSON.stringify([...sent, step]);
    store.setItem(STEPS_STORAGE_KEY, next);
    if (store.getItem(STEPS_STORAGE_KEY) !== next) return;
  } catch {
    return;
  }
  send({ visitId: visitId.toLowerCase(), step });
}

/** The browser side of markStep: the tab's sessionStorage and a post to /api/visit/step. Call it in the browser only. */
export function markAdStep(step: AdStep): void {
  let store: Storage;
  try { store = window.sessionStorage; } catch { return; }
  markStep({
    step,
    store,
    // keepalive: a step such as google_start leaves the page at once; the count must still arrive.
    send: (post) => { fetch("/api/visit/step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(post), keepalive: true }).catch(() => {}); },
  });
}
