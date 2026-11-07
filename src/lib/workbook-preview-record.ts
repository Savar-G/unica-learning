import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isUuid } from "./workbook-content";
import { canonical, evaluateWorkbookProgressSources, PREVIEW_ENGINE, workbookPreviewRequest,
  type FrozenWorkbookSources, type FrozenWorkbookSourcesV2, type SourceUnavailable, type WorkbookPreviewRequest } from "./workbook-progress-source";
import { evaluateBook1Preview, PREVIEW_ENGINE_V2, type Book1PreviewOutcome } from "./workbook-book1-preview";

export const MAX_PREVIEW_BYTES = 4_000_000;
export interface WorkbookPreviewDocument {
  version: 1;
  engine: typeof PREVIEW_ENGINE;
  actorId: string;
  request: WorkbookPreviewRequest;
  requestHash: string;
  frozen: FrozenWorkbookSources;
  sourceHash: string;
  outcome: SourceUnavailable;
}
export interface WorkbookPreviewRecord { payload: string; hash: string }
/** Isolated SQL port. Root must connect it after applying the migration and regenerating official types. */
export interface WorkbookPreviewRepository {
  read(actorId: string, request: WorkbookPreviewRequest): Promise<WorkbookPreviewRecord | null>;
  save(actorId: string, request: WorkbookPreviewRequest, record: WorkbookPreviewRecord): Promise<"saved" | "duplicate" | "conflict" | "unavailable">;
}
export const previewPayloadHash = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
export function createWorkbookPreviewRecord(actorId: string, request: WorkbookPreviewRequest, frozen: FrozenWorkbookSources): WorkbookPreviewRecord {
  if (!isUuid(actorId) || !workbookPreviewRequest(request)) throw Error("invalid-preview");
  const outcome = evaluateWorkbookProgressSources(request, frozen);
  const payload = canonical({ version: 1, engine: PREVIEW_ENGINE, actorId, request, requestHash: previewPayloadHash(canonical(request)),
    frozen, sourceHash: previewPayloadHash(canonical(frozen)), outcome } satisfies WorkbookPreviewDocument);
  if (Buffer.byteLength(payload, "utf8") > MAX_PREVIEW_BYTES) throw Error("preview-bound");
  return { payload, hash: previewPayloadHash(payload) };
}
/** Replay the saved source contract. Do not read a live profile, issue a decision, or run a different engine. */
export function replayWorkbookPreview(record: WorkbookPreviewRecord, actorId: string, rawRequest: unknown): WorkbookPreviewDocument | null {
  try {
    const request = workbookPreviewRequest(rawRequest);
    if (!request || typeof record.payload !== "string" || Buffer.byteLength(record.payload, "utf8") > MAX_PREVIEW_BYTES || previewPayloadHash(record.payload) !== record.hash) return null;
    const d = JSON.parse(record.payload) as WorkbookPreviewDocument;
    if (d.version !== 1 || d.engine !== PREVIEW_ENGINE || d.actorId !== actorId || !isDeepStrictEqual(d.request, request)) return null;
    // Rebuild through the public validator, then compare the whole exact document, including all version/hash fields.
    const rebuilt = createWorkbookPreviewRecord(actorId, request, d.frozen);
    if (!isDeepStrictEqual(JSON.parse(rebuilt.payload), d)) return null;
    return structuredClone(d);
  } catch { return null; }
}

/** Version 2 (#472): frozen sources that may hold a Book 1 baseline, with an outcome that may be a real plan. */
export interface WorkbookPreviewDocumentV2 {
  version: 2;
  engine: typeof PREVIEW_ENGINE_V2;
  actorId: string;
  request: WorkbookPreviewRequest;
  requestHash: string;
  frozen: FrozenWorkbookSourcesV2;
  sourceHash: string;
  outcome: Book1PreviewOutcome;
}
/** Either version. Version 1 keeps the exact bytes and rules it was saved with. */
export async function createWorkbookPreviewRecordAny(actorId: string, request: WorkbookPreviewRequest,
  frozen: FrozenWorkbookSources | FrozenWorkbookSourcesV2): Promise<WorkbookPreviewRecord> {
  if (frozen.version === 1) return createWorkbookPreviewRecord(actorId, request, frozen);
  if (!isUuid(actorId) || !workbookPreviewRequest(request)) throw Error("invalid-preview");
  const outcome = await evaluateBook1Preview(request, frozen);
  // JSON as stored: the plan and decision drop undefined fields before the canonical bytes are made.
  const payload = canonical(JSON.parse(JSON.stringify({ version: 2, engine: PREVIEW_ENGINE_V2, actorId, request, requestHash: previewPayloadHash(canonical(request)),
    frozen, sourceHash: previewPayloadHash(canonical(frozen)), outcome } satisfies WorkbookPreviewDocumentV2)));
  if (Buffer.byteLength(payload, "utf8") > MAX_PREVIEW_BYTES) throw Error("preview-bound");
  return { payload, hash: previewPayloadHash(payload) };
}
/** Replays a saved record of either version through the public evaluator of its own version. */
export async function replayWorkbookPreviewAny(record: WorkbookPreviewRecord, actorId: string, rawRequest: unknown): Promise<WorkbookPreviewDocument | WorkbookPreviewDocumentV2 | null> {
  try {
    const request = workbookPreviewRequest(rawRequest);
    if (!request || typeof record.payload !== "string" || Buffer.byteLength(record.payload, "utf8") > MAX_PREVIEW_BYTES || previewPayloadHash(record.payload) !== record.hash) return null;
    const d = JSON.parse(record.payload) as WorkbookPreviewDocument | WorkbookPreviewDocumentV2;
    if (d.version === 1) return replayWorkbookPreview(record, actorId, request);
    if (d.version !== 2 || d.engine !== PREVIEW_ENGINE_V2 || d.actorId !== actorId || !isDeepStrictEqual(d.request, request) || d.frozen?.version !== 2) return null;
    const rebuilt = await createWorkbookPreviewRecordAny(actorId, request, d.frozen);
    if (rebuilt.payload !== record.payload) return null;
    return structuredClone(d);
  } catch { return null; }
}
