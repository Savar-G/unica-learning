import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";

/**
 * Lets go of an upload slot when the parent gives up on a photo whose answer was lost. It is not a delete: the database
 * releases only a reservation whose upload has not started, and answers any other photo with its state, untouched. The
 * parent's own "Delete this photo" is DELETE on the photo's route.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/account/scans/[id]/release">) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const { id } = await params;
  if (!isUuid(id)) return scanJson({ error: "refused" }, 404);
  const { data, error } = await session.admin.rpc("release_scan_photo", { p_parent: session.parent, p_id: id });
  if (error) return scanJson({ error: "unavailable" }, 503);
  return data === "released" ? scanJson({ state: data }) : scanJson({ error: data }, 409);
}
