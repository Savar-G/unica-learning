import "server-only";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { storedQuestion } from "@/lib/workbook-content";
import { printContractForPhoto, storedPrintContract } from "@/lib/workbook-print-contract";
import { calibrationForPhoto } from "@/lib/scan-calibration";
import { scanPartPath } from "@/lib/scan-crops";
import { firstObservation } from "@/lib/scan-observation";
import { learningEvents } from "@/lib/learning-events";
import { learningEventStore } from "@/lib/learning-events-store";
import { currentSheetCheck, MARKING_PROMPT_VERSION, type MarkingFrame, type MarkingRef, type MarkingStore } from "@/lib/scan-marking";
import { markingCommand, scanMarkingReader, mark, observation } from "@/lib/scan-marking-reader";
export { markingCommand, type MarkingCommand } from "@/lib/scan-marking-reader";
import { digestOf } from "@/lib/workbook-digest";

const record = (v: unknown): Record<string, unknown> => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("marking_shape");
  return v as Record<string, unknown>;
};
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error("marking_shape"); return v; };
const str = (v: unknown): string => { if (typeof v !== "string") throw new Error("marking_shape"); return v; };
const num = (v: unknown): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("marking_shape"); return v; };
export function scanMarkingStore(db: SupabaseClient<Database>): MarkingStore {
  const command = markingCommand(db), frames = new Map<string, { frame: MarkingFrame; path: string; hash: string }>();
  const refKey = (ref: MarkingRef) => `${ref.parent}:${ref.photo}`;
  const events = learningEvents(learningEventStore(db));
  const reader = scanMarkingReader(db);
  return {
    async frame(ref) {
      const raw = await command("frame", ref.parent, ref.photo, null);
      if (typeof raw === "string" || raw === null) return null;
      const r = record(raw), p = record(r.photo), pg = record(r.page), c = record(r.calibration), result = record(c.result);
      if (c.state !== "ready" || !currentSheetCheck(result)) return null;
      const workbookId = str(p.workbook_id), pageNumber = num(pg.page_number), printedRevision = str(p.printed_revision);
      const image = { width: num(pg.image_width), height: num(pg.image_height) };
      const contract = storedPrintContract(pg.print_contract, { workbookId, page: pageNumber, image });
      const usable = printContractForPhoto({ printedRevision: str(pg.printed_revision) }, { printContract: contract }, { printedRevision });
      if (usable.status !== "available" || !result.calibration || !calibrationForPhoto(result.calibration as Parameters<typeof calibrationForPhoto>[0], { printedRevision })) return null;
      if (!list(result.parts).includes("straight")) return null;
      const questions = list(r.questions).map((value) => {
        const q = record(value);
        const read = storedQuestion({ number: num(q.question_number), schemaVersion: num(q.schema_version), package: q.package,
          box: { x: num(q.box_x), y: num(q.box_y), width: num(q.box_width), height: num(q.box_height) },
          regions: q.regions, teaching: q.teaching }, { source: "workbook", workbookId, page: pageNumber, question: num(q.question_number) }, image);
        return { number: read.number, package: read.content.status === "found" ? read.content.package : null, regions: read.regions, teaching: read.teaching };
      });
      const frame: MarkingFrame = { parentId: ref.parent, childId: str(p.child_id), photo: ref.photo, workbookId, printedRevision, pageId: str(p.page_id), pageNumber, ready: true, questions };
      frames.set(refKey(ref), { frame, path: scanPartPath(ref.parent, ref.photo, str(c.lease_token), "straight"), hash: digestOf(JSON.stringify({ contract, questions })) });
      return frame;
    },
    async claim(ref, token, frame, items) {
      const held = frames.get(refKey(ref));
      if (!held || held.frame !== frame) return "unavailable";
      const result = await command("claim", ref.parent, ref.photo, token, toJson({ hash: held.hash, items: items.map((e) => ({ expected: e, observation: firstObservation(e, ref.photo) })) }));
      if (result === "busy" || result === "terminal" || result === "unavailable") return result;
      const r = record(result);
      return { token: str(r.token), items: list(r.items).map(mark), extraction: r.extraction === null ? null : list(r.extraction).map(observation) };
    },
    async image(ref) {
      const path = frames.get(refKey(ref))?.path;
      if (!path) throw new Error("marking_image");
      const got = await db.storage.from("scan-photos").download(path);
      if (got.error) throw new Error("marking_image");
      const bytes = new Uint8Array(await got.data.arrayBuffer());
      // Default sharp output drops EXIF, XMP and ICC metadata. Whole-page coordinates and orientation stay unchanged.
      return new Uint8Array(await sharp(bytes, { limitInputPixels: 48_000_000, failOn: "warning" }).jpeg({ quality: 85 }).toBuffer());
    },
    async admit(ref, token, model) {
      const r = await command("admit", ref.parent, ref.photo, token, { model });
      if (r === "terminal" || r === "budget" || r === "price-unverified" || r === "attempts") return r;
      return { dispatch: str(record(r).dispatch) };
    },
    async settle(dispatch, costMicros) {
      const r = await command("settle", null, null, dispatch, { cost: costMicros });
      if (r !== true) throw new Error("marking_cost_reconciliation");
    },
    async extract(ref, token, observations, model) { return await command("extract", ref.parent, ref.photo, token, toJson({ observations, model, prompt: MARKING_PROMPT_VERSION })) === true; },
    async apply(ref, token, _observations, pendingEvents, at) { return await command("apply", ref.parent, ref.photo, token, toJson({ events: pendingEvents, at })) === true; },
    async pause(ref, token, status) { await command("pause", ref.parent, ref.photo, token, { status }); },
    async finish(ref, token) { return await command("finish", ref.parent, ref.photo, token) === true; },
    async publish(parent, child) {
      for (const row of await reader.rows(parent, child, "outbox")) {
        if (!row.mark.originalEvent) continue;
        const appended = await events.append(row.mark.originalEvent);
        if (!appended.ok) throw new Error("marking_publication");
        if (await command("ack", parent, null, null, { child, item: row.id, event: appended.event.id }) !== true) throw new Error("marking_publication_ack");
      }
    },
    effective: reader.effective,
  };
}

export interface ParentMarkChoice { itemId: string; version: number; result: "right" | "wrong" | "blank" }
export function parentMarkChoice(value: unknown): ParentMarkChoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !["itemId", "version", "result"].includes(key))
    || typeof v.itemId !== "string" || !v.itemId.length || v.itemId.length > 200
    || typeof v.version !== "number" || !Number.isSafeInteger(v.version) || v.version < 1 || v.version > 999_999_999
    || (v.result !== "right" && v.result !== "wrong" && v.result !== "blank")) return null;
  return { itemId: v.itemId, version: v.version, result: v.result };
}
/** Public store action. It cannot read an image or dispatch a model request. */
export async function changeScanMark(command: MarkingCommand, parent: string, photo: string, choice: ParentMarkChoice): Promise<{ status: "refused" } | { status: "saved" | "conflict"; mark: EffectiveMark }> {
  const raw = await command("change", parent, photo, null, toJson(choice));
  if (raw === "refused") return { status: "refused" as const };
  const r = record(raw);
  if (r.status !== "saved" && r.status !== "conflict") throw new Error("mark_change_shape");
  return { status: r.status, mark: mark(r.mark) };
}
export interface ScanMarkChange {
  id: number; itemId: string; actor: string; at: string; from: number; to: number;
  previous: EffectiveMark; current: Observation;
}
/** Keyset pages contain every prior parent judgment, including after image cleanup. */
export async function scanMarkChanges(command: MarkingCommand, parent: string, photo: string, after = 0): Promise<ScanMarkChange[]> {
  return list(await command("changes", parent, photo, null, { after })).map((v) => {
    const r = record(v);
    return { id: num(r.id), itemId: str(r.item_id), actor: str(r.actor), at: str(r.changed_at),
      from: num(r.from_version), to: num(r.to_version), previous: mark(r.previous), current: observation(r.current) };
  });
}
