import { scanJson, scanSession } from "@/lib/scan-photo-server";

export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  const result = await session.admin.rpc("acknowledge_scan_photo_notice", { p_parent: session.parent });
  if (result.error || result.data !== true) return scanJson({ error: "unavailable" }, 503);
  return scanJson({ acknowledged: true });
}
