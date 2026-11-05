import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson, scanPath } from "@/lib/scan-photo-server";
import { deliverScanFile } from "@/lib/scan-image-delivery";

export async function GET(_request: Request, { params }: RouteContext<"/api/account/scans/[id]/image">) {
  const session = await scanSession();
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  return deliverScanFile(session, id, (photo) => scanPath(photo.parent_id, id));
}
