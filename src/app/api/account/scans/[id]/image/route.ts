import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson, scanPath, SCAN_BUCKET, SCAN_HEADERS } from "@/lib/scan-photo-server";

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/image">) {
  const session = await scanSession();
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  // RLS scopes this read to the owner or authorized admin. No object path or signed URL reaches the browser.
  const { data: photo } = await session.db.from("scan_photos").select("id,parent_id,state,created_at,expires_at").eq("id", id).maybeSingle();
  const active = (p: typeof photo) => p && ["saved", "pending"].includes(p.state) && Date.parse(p.expires_at) > Date.now()
    && (p.state === "saved" || Date.parse(p.created_at) > Date.now() - 86_400_000);
  if (!active(photo) || !photo) return scanJson({ error: "refused" }, 404);
  const family = await session.admin.from("parents").select("deletion_requested_at").eq("id", photo.parent_id).maybeSingle();
  if (!family.data || family.data.deletion_requested_at) return scanJson({ error: "refused" }, 404);
  const downloaded = await session.admin.storage.from(SCAN_BUCKET).download(scanPath(photo.parent_id, id));
  if (downloaded.error) return scanJson({ error: "unavailable" }, 404);
  // Recheck after the Storage await. A delete or sign-out while bytes were fetched prevents delivery.
  const [current, auth, currentFamily, sessionActive] = await Promise.all([
    session.db.from("scan_photos").select("id,parent_id,state,created_at,expires_at").eq("id", id).maybeSingle(),
    session.db.auth.getUser(),
    session.admin.from("parents").select("deletion_requested_at").eq("id", photo.parent_id).maybeSingle(),
    session.active(),
  ]);
  if (!active(current.data) || auth.error || !sessionActive || auth.data.user?.id !== session.parent || !currentFamily.data || currentFamily.data.deletion_requested_at) return scanJson({ error: "refused" }, 404);
  return new Response(downloaded.data, { headers: { ...SCAN_HEADERS, "Content-Type": "image/jpeg", "Content-Security-Policy": "default-src 'none'" } });
}
