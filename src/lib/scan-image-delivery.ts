import "server-only";
import { SCAN_BUCKET, SCAN_HEADERS, scanJson, type scanSession } from "@/lib/scan-photo-server";

type Session = Awaited<ReturnType<typeof scanSession>>;
type PhotoRow = { id: string; parent_id: string; state: string; created_at: string; expires_at: string } | null;

const active = (p: PhotoRow) => p && ["saved", "pending"].includes(p.state) && Date.parse(p.expires_at) > Date.now()
  && (p.state === "saved" || Date.parse(p.created_at) > Date.now() - 86_400_000);

const readPhoto = (session: Session, id: string) =>
  session.db.from("scan_photos").select("id,parent_id,state,created_at,expires_at").eq("id", id).maybeSingle();

/**
 * Serves one file of a photo: every photo, crop and straightened page goes through here. RLS scopes the read to the owner or
 * an authorized admin, and no object path or signed URL reaches the browser. `path` gives the file for the photo's family,
 * or null when there is none. All checks run again after the Storage read, because a delete or sign-out can land during it.
 */
export async function deliverScanFile(session: Session, id: string, path: (photo: NonNullable<PhotoRow>) => string | null | Promise<string | null>) {
  const { data: photo } = await readPhoto(session, id);
  if (!active(photo) || !photo) return scanJson({ error: "refused" }, 404);
  const family = await session.admin.from("parents").select("deletion_requested_at").eq("id", photo.parent_id).maybeSingle();
  if (!family.data || family.data.deletion_requested_at) return scanJson({ error: "refused" }, 404);
  const file = await path(photo);
  if (!file) return scanJson({ error: "refused" }, 404);
  const downloaded = await session.admin.storage.from(SCAN_BUCKET).download(file);
  if (downloaded.error) return scanJson({ error: "unavailable" }, 404);
  const [current, auth, currentFamily, sessionActive] = await Promise.all([
    readPhoto(session, id),
    session.db.auth.getUser(),
    session.admin.from("parents").select("deletion_requested_at").eq("id", photo.parent_id).maybeSingle(),
    session.active(),
  ]);
  if (!active(current.data) || auth.error || !sessionActive || auth.data.user?.id !== session.parent || !currentFamily.data || currentFamily.data.deletion_requested_at) return scanJson({ error: "refused" }, 404);
  return new Response(downloaded.data, { headers: { ...SCAN_HEADERS, "Content-Type": "image/jpeg", "Content-Security-Policy": "default-src 'none'" } });
}
