import { beforeEach, expect, it, vi } from "vitest";
import { CONTACT_MAX, CONTACT_WINDOW_SECONDS } from "@/lib/contact-limit";

// A fake store for the site-wide count: it keeps a number of accepted messages and applies the same rule as the SQL
// function claim_contact_message (true and counted below the limit, false and counted not at it).
const f = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: f.admin }));
vi.mock("@/lib/email-delivery", () => ({ sendEmail: f.send }));
import { POST } from "./route";

const post = (body: unknown) => POST(new Request("https://unica.test/api/contact", { method: "POST", body: JSON.stringify(body) }));
const good = { name: "Ana", email: "ana@example.com", message: "Hello", website: "", elapsed: 5000 };
let counted = 0;

beforeEach(() => {
  counted = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  f.send.mockReset(); f.send.mockResolvedValue({ status: "sent" });
  f.rpc.mockReset();
  f.rpc.mockImplementation(async (name: string, args: { p_max: number; p_window_seconds: number }) => {
    if (name !== "claim_contact_message") return { data: null, error: { message: "unknown function" } };
    if (counted >= args.p_max) return { data: false, error: null };
    counted += 1;
    return { data: true, error: null };
  });
  f.admin.mockReset(); f.admin.mockReturnValue({ rpc: f.rpc });
});

it("sends the message and counts it with the site limit", async () => {
  const res = await post(good);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(f.rpc).toHaveBeenCalledWith("claim_contact_message", { p_max: CONTACT_MAX, p_window_seconds: CONTACT_WINDOW_SECONDS });
  expect(f.send).toHaveBeenCalledTimes(1);
});

it("answers the could-not-send path and sends nothing at the limit", async () => {
  for (let i = 0; i < CONTACT_MAX; i += 1) expect((await post(good)).status).toBe(200);
  expect(f.send).toHaveBeenCalledTimes(CONTACT_MAX);
  const res = await post(good);
  expect(res.status).toBe(429);
  expect(await res.json()).toEqual({ ok: false, error: "failed" });
  expect(f.send).toHaveBeenCalledTimes(CONTACT_MAX);
});

it("sends nothing when the count fails or there is no secret key", async () => {
  f.rpc.mockResolvedValue({ data: null, error: { message: "down" } });
  let res = await post(good);
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ ok: false, error: "failed" });
  f.admin.mockReturnValue(null);
  res = await post(good);
  expect(res.status).toBe(503);
  expect(f.send).not.toHaveBeenCalled();
});

it("counts neither bots nor invalid forms", async () => {
  await post({ ...good, website: "x" });
  await post({ ...good, elapsed: 10 });
  expect((await post({ ...good, email: "nope" })).status).toBe(400);
  expect(f.rpc).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});
