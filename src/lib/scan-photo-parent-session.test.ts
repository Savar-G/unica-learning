import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({
  user: "11111111-1111-4111-8111-111111111111" as string | null,
  subject: "11111111-1111-4111-8111-111111111111",
  session: "22222222-2222-4222-8222-222222222222" as string | undefined,
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({ auth: {
    getUser: async () => ({ data: { user: auth.user ? { id: auth.user } : null }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: auth.subject, session_id: auth.session } }, error: null }),
  } }),
  adminClient: () => ({ rpc: auth.rpc }),
}));
import { signedInParent } from "./scan-photo-server";

beforeEach(() => {
  auth.user = "11111111-1111-4111-8111-111111111111";
  auth.subject = auth.user;
  auth.session = "22222222-2222-4222-8222-222222222222";
  auth.rpc.mockReset().mockResolvedValue({ data: true, error: null });
});

it("admits an active session without requiring an open plan or scan release", async () => {
  expect(await signedInParent()).toEqual({ parent: auth.user, admin: { rpc: auth.rpc } });
  expect(auth.rpc).toHaveBeenCalledExactlyOnceWith("scan_session_active", { p_user: auth.user, p_session: auth.session });
});

it.each([
  { data: false, error: null },
  { data: null, error: null },
  { data: true, error: { message: "unavailable" } },
])("refuses a revoked or unavailable session despite a valid Auth user: %j", async result => {
  auth.rpc.mockResolvedValue(result);
  expect(await signedInParent()).toBeNull();
});

it.each(["signed-out", "missing-session", "wrong-subject"])("refuses %s before reading a private session", async kind => {
  if (kind === "signed-out") auth.user = null;
  if (kind === "missing-session") auth.session = undefined;
  if (kind === "wrong-subject") auth.subject = "33333333-3333-4333-8333-333333333333";
  expect(await signedInParent()).toBeNull();
  expect(auth.rpc).not.toHaveBeenCalled();
});
