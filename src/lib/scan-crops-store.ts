import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import { scanPath, SCAN_BUCKET } from "@/lib/scan-photo-server";
import { isFenceRefusal, scanPartPath, type BeginAnswer, type FinishAnswer, type ScanCropStore } from "@/lib/scan-crops";
import { storedQuestion } from "@/lib/workbook-content";
import { storedPrintContract } from "@/lib/workbook-print-contract";

const WORKBOOK_BUCKET = "workbook-pages";
const isActive = (p: { state: string; created_at: string; expires_at: string }, now: number) =>
  Date.parse(p.expires_at) > now && (p.state === "saved" || (p.state === "pending" && Date.parse(p.created_at) > now - 23.5 * 3_600_000));

/** The crop job's store, on the secret key: every read names the family, and Storage's fence holds the write rules. */
export function scanCropStore(db: SupabaseClient<Database>): ScanCropStore {
  const bucket = () => db.storage.from(SCAN_BUCKET);
  const removeDerived = async (parent: string, photo: string, wanted: (name: string) => boolean) => {
    const listed = await bucket().list(`${parent}/${photo}`, { limit: 1000 });
    if (listed.error) throw new Error("scan crops: list");
    const names = listed.data.map((o) => o.name).filter((n) => n !== "photo.jpg" && wanted(n));
    if (names.length) {
      const removed = await bucket().remove(names.map((n) => `${parent}/${photo}/${n}`));
      if (removed.error) throw new Error("scan crops: clear");
    }
  };
  return {
    async begin({ parent, photo, token }) {
      const { data, error } = await db.rpc("begin_scan_calibration", { p_parent: parent, p_id: photo, p_token: token });
      if (error) {
        // A family being deleted refuses every write: for this job, the photo has ended.
        if (error.message.includes("family_unavailable")) return { status: "terminal" };
        throw new Error("scan crops: begin");
      }
      return data as unknown as BeginAnswer;
    },
    async frame({ parent, photo }) {
      const row = await db.from("scan_photos").select("id,state,created_at,expires_at,printed_revision,page_id,workbook_id").eq("id", photo).eq("parent_id", parent).maybeSingle();
      if (row.error) throw new Error("scan crops: photo");
      if (!row.data) return null;
      const p = row.data;
      const active = isActive(p, Date.now());
      if (!p.page_id || !p.workbook_id) return { photo: { id: p.id, printedRevision: p.printed_revision, active }, book: { printedRevision: null }, page: { printContract: null, imagePath: null, questions: [] } };
      const [book, page, questions] = await Promise.all([
        db.from("workbooks").select("printed_revision").eq("id", p.workbook_id).eq("parent_id", parent).maybeSingle(),
        db.from("workbook_pages").select("page_number,image_path,image_width,image_height,print_contract").eq("id", p.page_id).eq("parent_id", parent).maybeSingle(),
        db.from("workbook_questions").select("question_number,schema_version,package,box_x,box_y,box_width,box_height,regions,teaching").eq("page_id", p.page_id).eq("parent_id", parent).order("question_number"),
      ]);
      if (book.error || page.error || questions.error) throw new Error("scan crops: page");
      const pg = page.data;
      const image = pg?.image_width && pg.image_height ? { width: pg.image_width, height: pg.image_height } : null;
      return {
        photo: { id: p.id, printedRevision: p.printed_revision, active },
        book: { printedRevision: book.data?.printed_revision ?? null },
        page: {
          printContract: pg?.print_contract ? storedPrintContract(pg.print_contract, { workbookId: p.workbook_id, page: pg.page_number, image }) : null,
          imagePath: pg?.image_path ?? null,
          questions: (questions.data ?? []).flatMap((q) => {
            if (!pg) return [];
            const read = storedQuestion({
              number: q.question_number, schemaVersion: q.schema_version, package: q.package, regions: q.regions, teaching: q.teaching,
              box: { x: q.box_x, y: q.box_y, width: q.box_width, height: q.box_height },
            }, { source: "workbook", workbookId: p.workbook_id!, page: pg.page_number, question: q.question_number }, image);
            return [{ number: read.number, package: read.content.status === "found" ? read.content.package : null, regions: read.regions }];
          }),
        },
      };
    },
    async calibration({ parent, photo }) {
      const { data, error } = await db.from("scan_calibrations").select("state,lease_token,printed_revision,result").eq("photo_id", photo).eq("parent_id", parent).maybeSingle();
      if (error) throw new Error("scan crops: calibration");
      return data ? { state: data.state, token: data.lease_token, revision: data.printed_revision, result: data.result } : null;
    },
    async photoBytes({ parent, photo }) {
      const { data, error } = await bucket().download(scanPath(parent, photo));
      if (error) throw new Error("scan crops: photo bytes");
      return new Uint8Array(await data.arrayBuffer());
    },
    async printedBytes(path) {
      const { data, error } = await db.storage.from(WORKBOOK_BUCKET).download(path);
      return error ? null : new Uint8Array(await data.arrayBuffer());
    },
    async put({ parent, photo, token, part, bytes }) {
      const { error } = await bucket().upload(scanPartPath(parent, photo, token, part), bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
      if (!error) return true;
      // The fence's refusal stops the job. Anything else is uncertain, and the lease lets a later call try again.
      if (isFenceRefusal(error.message)) return false;
      throw new Error("scan crops: upload");
    },
    clearLease: ({ parent, photo, token }) => removeDerived(parent, photo, (n) => n.startsWith(`${token}-`)),
    clearAll: ({ parent, photo }) => removeDerived(parent, photo, () => true),
    async finish({ parent, photo, token, state, result, bytes }) {
      const { data, error } = await db.rpc("finish_scan_calibration", { p_parent: parent, p_id: photo, p_token: token, p_state: state, p_result: result as unknown as Json, p_bytes: bytes });
      if (error) {
        if (error.message.includes("family_unavailable")) return "terminal";
        throw new Error("scan crops: finish");
      }
      return data as FinishAnswer;
    },
  };
}
