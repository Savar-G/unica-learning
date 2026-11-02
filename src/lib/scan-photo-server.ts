import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { sessionClient, adminClient } from "@/lib/supabase-auth";
import { notFound } from "next/navigation";
import { scanPagesAccess } from "@/lib/scan-pages-access";

export const SCAN_BUCKET = "scan-photos";
export const scanPath = (parent: string, id: string) => `${parent}/${id}/photo.jpg`;
export const SCAN_HEADERS = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export async function scanSession() {
  const db = await sessionClient();
  // getUser checks Auth on every request, including after sign-out/revocation.
  const [{ data, error }, claims] = await Promise.all([db.auth.getUser(), db.auth.getClaims()]);
  const admin = adminClient();
  if (error || !data.user || !admin) notFound();
  const sessionId = claims.data?.claims.session_id;
  if (claims.error || typeof sessionId !== "string" || claims.data?.claims.sub !== data.user.id) notFound();
  const parent = data.user.id;
  const active = async () => {
    const [result, released] = await Promise.all([
      admin.rpc("scan_session_active", { p_user: parent, p_session: sessionId }),
      scanPagesAccess(parent, admin),
    ]);
    return !result.error && result.data === true && released;
  };
  if (!await active()) notFound();
  return { db, admin, parent, active };
}

export function scanJson(data: unknown, status = 200) { return Response.json(data, { status, headers: SCAN_HEADERS }); }

/** Exact server-only reads, with an explicit family scope even when using the secret key. */
export async function scanView(db: SupabaseClient<Database>, parent: string, id: string) {
  const { data: photo, error } = await db.from("scan_photos").select("id,child_id,page_id,workbook_id,state,created_at,expires_at,width,height")
    .eq("id", id).eq("parent_id", parent).maybeSingle();
  if (error) throw new Error("scan_read");
  if (!photo) return null;
  const [{ data: page }, { data: book }, { data: child }] = await Promise.all([
    photo.page_id ? db.from("workbook_pages").select("page_number,day_label").eq("id", photo.page_id).eq("parent_id", parent).maybeSingle() : { data: null },
    photo.workbook_id ? db.from("workbooks").select("number").eq("id", photo.workbook_id).eq("parent_id", parent).maybeSingle() : { data: null },
    db.from("children").select("first_name").eq("id", photo.child_id).eq("parent_id", parent).maybeSingle(),
  ]);
  const live = photo.state === "saved" || photo.state === "pending";
  const active = live && Date.parse(photo.expires_at) > Date.now()
    && (photo.state === "saved" || Date.parse(photo.created_at) > Date.now() - 86_400_000);
  return { ...photo, state: live && !active ? "expired" : photo.state, child: child?.first_name, book: book?.number, day: page?.day_label, page: page?.page_number };
}

export async function cleanupScanPhoto(db: SupabaseClient<Database>, parent: string, id: string) {
  const { error } = await db.storage.from(SCAN_BUCKET).remove([scanPath(parent, id)]);
  if (error) return false;
  const result = await db.rpc("reconcile_scan_cleanup", { p_id: id });
  return !result.error && result.data;
}

/** Stable keyset paging, so physical cleanup retries do not skip rows. No image data enters family copies. */
export async function cleanupScanPhotos(db: SupabaseClient<Database>, deadline: number) {
  const expired = await db.rpc("expire_scan_photos");
  if (expired.error) throw new Error("scan_expiry");
  let after = "00000000-0000-0000-0000-000000000000";
  let removed = 0;
  while (Date.now() < deadline) {
    const { data, error } = await db.from("scan_photos").select("id,parent_id").in("state", ["deleted", "expired", "rejected"])
      .or("stored_bytes.gt.0,reserved_bytes.gt.0").gt("id", after).order("id").limit(50);
    if (error) throw new Error("scan_cleanup");
    if (!data.length) break;
    for (const row of data) {
      if (Date.now() >= deadline) return removed;
      if (await cleanupScanPhoto(db, row.parent_id, row.id)) removed++;
      after = row.id;
    }
  }
  return removed;
}
