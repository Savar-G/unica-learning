import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { scanChecksAccess } from "@/lib/scan-marking-access";
import { checkedReady, isScanPart, scanPartPath } from "@/lib/scan-crops";
import { deliverScanFile } from "@/lib/scan-image-delivery";

/** A crop or the straightened page: the same checks as the photo, and the path comes only from a stored calibration that passed the sheet check. */
export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/preview/[part]">) {
  const session = await scanSession();
  const { id, part } = await params;
  if (!isUuid(id) || !isScanPart(part) || !await scanChecksAccess(session.admin, session.parent, process.env, { photo: id })) return scanJson({ error: "refused" }, 404);
  return deliverScanFile(session, id, async (photo) => {
    const { data } = await session.admin.from("scan_calibrations").select("state,lease_token,result").eq("photo_id", id).eq("parent_id", photo.parent_id).maybeSingle();
    const parts = data?.result?.parts ?? [];
    // (A ready result made before the sheet check (#456) is not served: its crops may hold another sheet's answers.)
    return data?.state === "ready" && checkedReady(data.result) && parts.includes(part) ? scanPartPath(photo.parent_id, id, data.lease_token, part) : null;
  });
}
