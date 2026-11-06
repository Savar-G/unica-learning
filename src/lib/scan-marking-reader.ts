import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { observationProblem, type Observation } from "@/lib/scan-observation";
import type { EffectiveMark, MarkingStore } from "@/lib/scan-marking";

// Read persisted marks without loading scan calibration, image processing or workbook rendering.
// The profile reader and the image store use the same validation and cursor pagination.

const record = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("marking_shape");
  return v as Record<string, unknown>;
};
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error("marking_shape"); return v; };
const str = (v: unknown): string => { if (typeof v !== "string") throw new Error("marking_shape"); return v; };
/** The persisted JSON is checked before it enters the public observation interface. */
export function observation(v: unknown): Observation {
  const r = record(v);
  record(r.identity); list(r.regions); record(r.mastery);
  const candidate = r as unknown as Observation;
  if (observationProblem(candidate)) throw new Error("marking_observation");
  return candidate;
}
export function mark(v: unknown): EffectiveMark {
  const r = record(v), o = observation(r.observation), e = record(r.expected);
  // Expected records were written from the trusted package by claim. Keep the projection tied to the same identity.
  if (JSON.stringify(e.identity) !== JSON.stringify(record(r.observation).identity)) {
    const i = record(e.identity);
    if (i.workbookId !== o.identity.workbookId || i.printedRevision !== o.identity.printedRevision || i.pageId !== o.identity.pageId || i.itemId !== o.identity.itemId) throw new Error("marking_identity");
  }
  return { expected: e as unknown as EffectiveMark["expected"], observation: o,
    originalEvent: r.original_event === null ? null : record(r.original_event) as unknown as EffectiveMark["originalEvent"], eventId: r.event_id === null ? null : str(r.event_id),
    at: str(r.evidence_at), model: r.model === null ? null : str(r.model), prompt: r.prompt === null ? null : str(r.prompt) };
}
export type MarkingCommand = (action: string, parent: string | null, photo: string | null, token: string | null, data?: Json) => Promise<unknown>;
/** Deliberately uses generated RPC names. Parent must install the migration and generate database types. */
export function markingCommand(db: SupabaseClient<Database>): MarkingCommand {
  return async (action, parent, photo, token, data = {}) => {
    const result = await db.rpc("scan_marking_command", { p_action: action, p_parent: parent, p_photo: photo, p_token: token, p_data: data });
    if (result.error) throw new Error("marking_store");
    return result.data;
  };
}
export function scanMarkingReader(db: SupabaseClient<Database>) {
  const command = markingCommand(db);
  async function rows(parent: string, child: string, action: "effective" | "outbox") {
    const result: { id: string; mark: EffectiveMark }[] = [];
    for (let after: string | null = null; ;) {
      const page = list(await command(action, parent, null, null, { child, after }));
      if (!page.length) return result;
      for (const row of page) result.push({ id: str(record(row).id), mark: mark(row) });
      after = str(record(page[page.length - 1]).id);
    }
  }
  return {
    rows,
    effective: (async (parent, child) => (await rows(parent, child, "effective")).map((r) => r.mark)) satisfies MarkingStore["effective"],
  };
}
