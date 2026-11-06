import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/scan-photo-server", () => ({ SCAN_BUCKET: "scan-photos", SCAN_HEADERS: { "Cache-Control": "private, no-store", Vary: "Cookie" }, scanJson: (data: unknown, status = 200) => Response.json(data, { status }) }));
import { deliverScanFile } from "@/lib/scan-image-delivery";
const ID = "11111111-1111-4111-8111-111111111111";
let viewer: string, active: boolean, state: string, expired: boolean, downloads: number, revokeInFlight: boolean;
function session() {
  const db = createClient("https://local.invalid", "synthetic", { auth: { persistSession: false }, global: { fetch: async () => Response.json((viewer === "owner" || viewer === "admin") && active ? [{ id: ID, parent_id: "owner", state, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + (expired ? -1 : 60000)).toISOString() }] : []) } });
  const admin = createClient("https://local.invalid", "synthetic-service", { auth: { persistSession: false }, global: { fetch: async (input) => {
    if (String(input).includes('/storage/')) { downloads++; if (revokeInFlight) active = false; return new Response("known-existing-photo-bytes", { headers: { "content-type": "image/jpeg" } }); }
    return Response.json([{ deletion_requested_at: null }]);
  } } });
  vi.spyOn(db.auth, "getUser").mockImplementation(async () => ({ data: { user: { id: viewer } }, error: null }) as Awaited<ReturnType<typeof db.auth.getUser>>);
  return { db, admin, parent: viewer, active: async () => active };
}
beforeEach(() => { viewer = "owner"; active = true; state = "saved"; expired = false; downloads = 0; revokeInFlight = false; });
it.each(["owner", "admin"])("%s receives the intended existing private image through session delivery", async (role) => { viewer = role; const r = await deliverScanFile(session(), ID, () => "owner/photo/crop-1.jpg"); expect(r.status).toBe(200); expect(await r.text()).toBe("known-existing-photo-bytes"); expect(r.headers.get("cache-control")).toBe("private, no-store"); expect(r.headers.get("vary")).toBe("Cookie"); });
it.each(["anonymous", "other-family"])("a copied route fails for %s before any Storage read", async (role) => { viewer = role; expect((await deliverScanFile(session(), ID, () => "path")).status).toBe(404); expect(downloads).toBe(0); });
it.each(["deleted", "expired"])("%s refuses the old route while bytes still exist", async (terminal) => { if (terminal === "deleted") state = "deleted"; else expired = true; expect((await deliverScanFile(session(), ID, () => "known-existing-object")).status).toBe(404); expect(downloads).toBe(0); });
it("sign-out during a held Storage read prevents delivery of already downloaded bytes", async () => { revokeInFlight = true; expect((await deliverScanFile(session(), ID, () => "known-existing-object")).status).toBe(404); expect(downloads).toBe(1); });
