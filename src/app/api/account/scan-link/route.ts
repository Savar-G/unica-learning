import { linkOrigin } from "@/lib/account-server";
import { sendScanLink } from "@/lib/scan-link";
import { scanLinkStore } from "@/lib/scan-link-store";
import { scanJson, scanSession } from "@/lib/scan-photo-server";
import { isUuid } from "@/lib/workbook-content";

// "Email me the link" on the Scan pages tab (#564): emails the page's address to the signed-in parent. The same checks
// as every scan route (scanSession: a live session, and scanning released to this family, else the 404), then the
// same-origin check of the scan routes. The email goes only to the parent's own address.
const STATUS = { sent: 200, not_found: 400, too_many: 429, unsure: 502, failed: 502 } as const;

export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  let child: unknown;
  try {
    ({ child } = await request.json());
  } catch {
    return scanJson({ error: "refused" }, 400);
  }
  if (!isUuid(child)) return scanJson({ error: "refused" }, 400);
  try {
    const result = await sendScanLink(scanLinkStore(session.admin), { parent: session.parent, child, origin: linkOrigin(request) });
    return scanJson(result === "sent" ? { ok: true } : { error: result }, STATUS[result]);
  } catch (error) {
    console.error("[scan-link] failed", error instanceof Error ? error.message : "failed");
    return scanJson({ error: "failed" }, 503);
  }
}
