import { beforeEach, expect, it, vi } from "vitest";
import { notFound } from "next/navigation";
const session = vi.hoisted(() => ({ signedIn: true, parent: "verified-parent", error: false, args: null as unknown }));
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => session.signedIn ? { parent: session.parent, admin: { rpc: async (_name: string, args: unknown) => {
    session.args = args; return { data: !session.error, error: session.error ? { message: "unavailable" } : null };
  } } } : notFound(),
}));
import { POST } from "./route";
const request = (origin = "https://unicalearning.com") => new Request("https://unicalearning.com/api/account/scans/notice", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ parent: "another-family" }) });
beforeEach(() => { session.signedIn = true; session.error = false; session.args = null; });
it("uses the authenticated parent, ignoring a forged family in the body", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(session.args).toEqual({ p_parent: "verified-parent" });
});
it("refuses cross-origin and signed-out acknowledgement without a write", async () => {
  expect((await POST(request("https://other.example"))).status).toBe(403); expect(session.args).toBeNull();
  session.signedIn = false; await expect(POST(request())).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }); expect(session.args).toBeNull();
});
it("does not report acknowledgement if the server cannot store it", async () => {
  session.error = true; expect((await POST(request())).status).toBe(503);
});
