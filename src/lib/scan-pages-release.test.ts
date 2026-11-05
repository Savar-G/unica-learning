import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import * as access from "./scan-pages-access";
import * as scans from "@/app/api/account/scans/route";
import * as photo from "@/app/api/account/scans/[id]/route";
import * as image from "@/app/api/account/scans/[id]/image/route";
import * as notice from "@/app/api/account/scans/notice/route";
import ScanPage from "@/app/(product)/account/(dashboard)/scan/page";

vi.mock("server-only", () => ({}));
vi.mock("@/components/scan-pages", () => ({ ScanPages: () => null }));
const requestAuth = vi.hoisted(() => ({ db: null as SupabaseClient<Database> | null, signedIn: true, claimsMatch: true }));
// The Scan pages tab (#564) reads the device and the dashboard: a phone, outside the dashboard frame.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Mobile/15E148", host: "unicalearning.com" }) }));
vi.mock("@/lib/parent-dashboard-server", () => ({ parentDashboard: async () => null }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => requestAuth.db,
  parentId: async () => (requestAuth.signedIn ? "00000000-0000-4000-8000-000000000001" : null),
  sessionClient: async () => ({
    from: requestAuth.db!.from.bind(requestAuth.db),
    auth: {
      getUser: async () => ({ data: { user: requestAuth.signedIn ? { id: "00000000-0000-4000-8000-000000000001" } : null }, error: null }),
      getClaims: async () => ({ data: { claims: { sub: requestAuth.claimsMatch ? "00000000-0000-4000-8000-000000000001" : "forged", session_id: "verified-session" } }, error: null }),
    },
  }),
}));

const parent = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000002";
const child = "00000000-0000-4000-8000-000000000003";
const realAccess = access.scanPagesAccess;
const state = {
  env: {} as Readonly<Record<string, string | undefined>>, test: false, admin: false, sessionActive: true,
  photo: false, revokeOnDownload: false, effects: [] as string[],
};
const db = createClient<Database>("https://scan-release.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1)!;
    if (table === "scan_session_active") return Response.json(state.sessionActive);
    if (table === "test_accounts" || table === "admin_users") {
      const test = table === "test_accounts", column = test ? "parent_id" : "user_id";
      expect(url.searchParams.get(column)).toBe(`eq.${parent}`);
      return Response.json((test ? state.test : state.admin) ? [{ [column]: parent }] : []);
    }
    state.effects.push(url.pathname);
    if (url.pathname.startsWith("/storage/")) {
      if (state.revokeOnDownload) state.test = false;
      return new Response("private photo", { headers: { "Content-Type": "image/jpeg" } });
    }
    if (table === "scan_photos") return Response.json(state.photo ? [{ id, parent_id: parent, child_id: child, state: "saved", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86_400_000).toISOString() }] : []);
    if (table === "parents") return Response.json([{ deletion_requested_at: null }]);
    if (table === "recover_scan_photo") return Response.json(true);
    if (table === "children" || table === "scan_photo_notices") return Response.json([]);
    throw new Error(`Unexpected downstream operation: ${url.pathname}`);
  } },
});

beforeEach(() => {
  vi.restoreAllMocks();
  state.env = {}; state.test = false; state.admin = false; state.sessionActive = true;
  state.photo = false; state.revokeOnDownload = false; state.effects = [];
  requestAuth.db = db; requestAuth.signedIn = true; requestAuth.claimsMatch = true;
  // Inject configuration at the release helper's public seam. Never change process or deployment variables.
  vi.spyOn(access, "scanPagesAccess").mockImplementation((parent, client) => realAccess(parent, client, state.env));
});

const request = (method: string, path = "", origin = "https://other.example") => new Request(`https://unicalearning.com/api/account/scans${path}`, { method, headers: { Origin: origin } });
const params = { params: Promise.resolve({ id }) };
const endpoints = [
  ["list", () => scans.GET(request("GET", `?child=${child}`)), 200],
  ["admit", () => scans.POST(request("POST")), 403],
  ["recover", () => photo.GET(request("GET", `/${id}`), params), 404],
  ["upload", () => photo.PUT(request("PUT", `/${id}`), params), 403],
  ["save", () => photo.POST(request("POST", `/${id}`), params), 403],
  ["delete", () => photo.DELETE(request("DELETE", `/${id}`), params), 403],
  ["image", () => image.GET(request("GET", `/${id}/image`), params), 404],
  ["notice", () => notice.POST(request("POST", "/notice")), 403],
] as const;
const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const page = () => ScanPage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });

it.each(endpoints)("off: %s returns the normal not-found result before any photo read, write or body parse", async (_name, run) => {
  await expect(run()).rejects.toMatchObject(notFound);
  expect(state.effects).toEqual([]);
});

it("off: the page returns not-found before it reads children or the notice", async () => {
  await expect(page()).rejects.toMatchObject(notFound);
  expect(state.effects).toEqual([]);
});

it.each(["on", "test", "admin"] as const)("%s: the real page and every handler pass the release gate", async (mode) => {
  state.env = mode === "on" ? { SCAN_PAGES_ENABLED: "on" } : {};
  state.test = mode === "test"; state.admin = mode === "admin";
  await expect(page()).resolves.toBeTruthy();
  for (const [, run, expected] of endpoints) expect((await run()).status).toBe(expected);
  expect(state.effects.some(path => path.endsWith("/scan_photos"))).toBe(true);
  expect(state.effects.some(path => path.endsWith("/children"))).toBe(true);
});

it.each(["signed-out", "mismatched claims", "revoked session"])("on still refuses %s before photo access", async (kind) => {
  state.env = { SCAN_PAGES_ENABLED: "on" };
  requestAuth.signedIn = kind !== "signed-out"; requestAuth.claimsMatch = kind !== "mismatched claims"; state.sessionActive = kind !== "revoked session";
  for (const [, run] of endpoints) await expect(run()).rejects.toMatchObject(notFound);
  // A signed-out visitor signs in and comes back (#564), so the QR code works on a phone; nothing is read before.
  await expect(page()).rejects.toMatchObject(kind === "signed-out" ? { digest: expect.stringContaining("/sign-in?next=%2Faccount%2Fscan") } : notFound);
  expect(state.effects).toEqual([]);
});

it("rechecks the test mark on the next request and after an image Storage read", async () => {
  state.test = true;
  expect((await scans.GET(request("GET", `?child=${child}`))).status).toBe(200);
  state.test = false; state.effects = [];
  await expect(scans.GET(request("GET", `?child=${child}`))).rejects.toMatchObject(notFound);
  expect(state.effects).toEqual([]);
  state.test = true; state.photo = true; state.revokeOnDownload = true;
  const result = await image.GET(request("GET", `/${id}/image`), params);
  expect(result.status).toBe(404);
  expect(await result.text()).not.toContain("private photo");
  expect(state.effects.filter(path => path.startsWith("/storage/"))).toHaveLength(1);
});
