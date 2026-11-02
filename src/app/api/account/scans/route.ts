import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson, scanView } from "@/lib/scan-photo-server";

export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  try {
    const { id, child, bytes } = await request.json();
    if (!isUuid(id) || !isUuid(child) || !Number.isSafeInteger(bytes)) return scanJson({ error: "refused" }, 400);
    const { data, error } = await session.admin.rpc("admit_scan_photo", { p_parent: session.parent, p_child: child, p_id: id, p_bytes: bytes });
    if (error) return scanJson({ error: "unavailable" }, 503);
    if (!["reserved", "processing", "pending", "saved"].includes(data)) return scanJson({ error: data }, 429);
    return scanJson({ state: data, id });
  } catch { return scanJson({ error: "refused" }, 400); }
}

export async function GET(request: Request) {
  const session = await scanSession();
  const child = new URL(request.url).searchParams.get("child");
  if (!child || !isUuid(child)) return scanJson({ error: "refused" }, 400);
  const { data, error } = await session.admin.from("scan_photos").select("id").eq("parent_id", session.parent).eq("child_id", child)
    .in("state", ["pending", "saved"]).order("created_at", { ascending: false }).limit(100);
  if (error) return scanJson({ error: "unavailable" }, 503);
  const photos = await Promise.all(data.map((row) => scanView(session.admin, session.parent, row.id)));
  return scanJson({ photos });
}
