import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { markedFamily } from "@/lib/scan-pages-access";
import { isScanPart, scanPartPath } from "@/lib/scan-crops";
import { deliverScanFile } from "@/lib/scan-image-delivery";

/** A crop or the straightened page: the same checks as the photo, and the path comes only from the stored calibration. */
export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview/[part]">) {
  const session = await scanSession();
  const { id, part } = await params;
  if (!isUuid(id) || !isScanPart(part) || !await markedFamily(session.parent, session.admin)) return scanJson({ error: "refused" }, 404);
  return deliverScanFile(session, id, async (photo) => {
    const { data } = await session.admin.from("scan_calibrations").select("state,lease_token,result").eq("photo_id", id).eq("parent_id", photo.parent_id).maybeSingle();
    const parts = data?.result?.parts ?? [];
    return data?.state === "ready" && parts.includes(part) ? scanPartPath(photo.parent_id, id, data.lease_token, part) : null;
  });
}
