// The v2 publish store and file store in Supabase (migration 20261127023500_workbook_v2_publish). Pass a client with the
// secret key: allocate_v2_workbook and publish_v2_workbook are service-only, and parents and admins cannot write the
// bucket. Both functions refuse a family that is not in public.test_accounts, as family() does here first.
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database, type Json } from "@/lib/database";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";
import type { AllocateResult, Allocation, AllocationRecord, FamilyCheck, PublishResult, StoredV2Book, V2PublishStore, V2Storage } from "./types";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";

/** allocate_v2_workbook's answer, checked: a change of its shape fails here, not in a caller. */
export function allocateAnswer(data: unknown): AllocateResult {
  if (isObject(data) && data.status === "refused" && isText(data.reason)) return { status: "refused", reason: data.reason };
  if (!isObject(data) || (data.status !== "allocated" && data.status !== "existing")) throw new Error("v2 allocation: unexpected answer");
  const { parentId, childId, workbookId, workbookNumber, requestKey, inputHash, inputPath, allocatedAt, allocation } = data;
  if (![parentId, childId, workbookId, requestKey, inputHash, inputPath, allocatedAt].every(isText) || !Number.isInteger(workbookNumber) || !isObject(allocation)) {
    throw new Error("v2 allocation: unexpected answer");
  }
  const a: Allocation = {
    parentId: parentId as string, childId: childId as string, workbookId: workbookId as string, workbookNumber: workbookNumber as number,
    requestKey: requestKey as string, inputHash: inputHash as string, inputPath: inputPath as string, allocatedAt: allocatedAt as string,
    allocation: allocation as unknown as AllocationRecord,
  };
  return { status: data.status, ...a };
}

/** publish_v2_workbook's answer, checked. */
export function publishAnswer(data: unknown): PublishResult {
  if (isObject(data) && data.status === "refused" && isText(data.reason)) return { status: "refused", reason: data.reason };
  if (isObject(data) && (data.status === "published" || data.status === "existing") && isText(data.workbookId) && (data.printedRevision === null || isText(data.printedRevision))) {
    return { status: data.status, workbookId: data.workbookId, printedRevision: data.printedRevision };
  }
  throw new Error("v2 publish: unexpected answer");
}

const fontMap = (v: unknown): Record<string, string> =>
  (isObject(v) ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => isText(e[1]))) : {});

export function v2PublishStore(db: SupabaseClient<Database>): V2PublishStore {
  return {
    async family(childId): Promise<FamilyCheck> {
      const { data: child, error } = await db.from("children").select("parent_id").eq("id", childId).maybeSingle();
      if (error) throw new Error(`v2 family check: ${error.message}`);
      if (!child) return { status: "unknown-child" };
      const { data: test, error: testError } = await db.from("test_accounts").select("parent_id").eq("parent_id", child.parent_id).maybeSingle();
      if (testError) throw new Error(`v2 family check: ${testError.message}`);
      return test ? { status: "test", parentId: child.parent_id } : { status: "not-test" };
    },

    async allocate(candidate) {
      const { data, error } = await db.rpc("allocate_v2_workbook", { p_allocation: toJson(candidate) });
      if (error) throw new Error(`v2 allocation: ${error.message}`);
      return allocateAnswer(data);
    },

    async findByInputHash(inputHash) {
      const { data, error } = await db.from("workbooks").select("id, printed_revision").eq("input_hash", inputHash).maybeSingle();
      if (error) throw new Error(`v2 book load: ${error.message}`);
      return data ? { workbookId: data.id, printedRevision: data.printed_revision } : null;
    },

    async publish(payload) {
      // (The payload is plain JSON that contract-writer.ts builds; its type is too deep for toJson's check.)
      const { data, error } = await db.rpc("publish_v2_workbook", { p_payload: payload as unknown as Json });
      if (error) throw new Error(`v2 publish: ${error.message}`);
      return publishAnswer(data);
    },

    async storedBook(workbookId): Promise<StoredV2Book | null> {
      const [book, pages] = await Promise.all([
        db.from("workbooks").select("id, generator, input_hash, input_path, engine_version, renderer_version, font_hashes, pdf_sha256").eq("id", workbookId).maybeSingle(),
        db.from("workbook_pages").select("page_number, print_contract").eq("workbook_id", workbookId).order("page_number", { ascending: true }).range(0, 999),
      ]);
      const error = book.error ?? pages.error;
      if (error) throw new Error(`v2 book load: ${error.message}`);
      const b = book.data;
      if (!b || b.generator !== "v2" || !b.input_hash || !b.input_path || !b.engine_version || !b.renderer_version) return null;
      return {
        workbookId: b.id, inputHash: b.input_hash, inputPath: b.input_path, engineVersion: b.engine_version, rendererVersion: b.renderer_version,
        fontHashes: fontMap(b.font_hashes), pdfSha256: b.pdf_sha256,
        pages: (pages.data ?? []).map((p) => {
          const contract = p.print_contract as { fingerprints?: { image?: unknown } } | null;
          return { number: p.page_number, imageSha256: isText(contract?.fingerprints?.image) ? contract.fingerprints.image : null };
        }),
      };
    },
  };
}

/** True for Storage's answer to a path that is taken. */
const isTaken = (error: { message: string; statusCode?: unknown; status?: unknown }) =>
  String(error.statusCode) === "409" || error.status === 409 || /already exists|duplicate/i.test(error.message);

/** The workbook bucket. A path that is taken holds the same bytes (its name is their hash), so it counts as stored. */
export function v2Files(db: SupabaseClient<Database>): V2Storage {
  const bucket = () => db.storage.from(WORKBOOK_FILES_BUCKET);
  return {
    async put(file) {
      const { error } = await bucket().upload(file.path, file.bytes, { contentType: file.contentType, upsert: false });
      if (!error) return "stored";
      if (isTaken(error as { message: string })) return "existing";
      throw new Error(`v2 file upload: ${error.message}`);
    },
    async get(path) {
      const { data, error } = await bucket().download(path);
      if (error) {
        if (/not found/i.test(error.message) || (error as { status?: unknown }).status === 404) return null;
        throw new Error(`v2 file download: ${error.message}`);
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
