import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

// #556, review of PR #602: only the parent's own delete stopped the plans, so only it promises no more charges.
const s = vi.hoisted(() => ({ cookie: undefined as string | undefined, parent: null as string | null, state: null as string | null, fail: false }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (s.cookie === undefined ? undefined : { value: s.cookie }) }) }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({ rpc: async () => (s.fail ? { data: null, error: { code: "PGRST000" } } : { data: s.state, error: null }) }),
  parentId: async () => s.parent,
}));
import FamilyDeleted from "./page";

const text = async () => renderToStaticMarkup(await FamilyDeleted());
const PROMISE = "We will make no more charges.";
beforeEach(() => { s.cookie = undefined; s.parent = null; s.state = null; s.fail = false; });

it("promises no more charges after the parent's own delete, told by the browser's cookie once the session has ended", async () => {
  s.cookie = "1";
  expect(await text()).toContain(PROMISE);
});
it("promises it to a signed-in parent only when the request row says the plans stopped", async () => {
  s.parent = "p";
  s.state = "plans_stopped";
  expect(await text()).toContain(PROMISE);
  s.state = "queued";
  s.cookie = "1";
  const queued = await text();
  expect(queued).not.toContain(PROMISE);
  expect(queued).toContain("Your family&#x27;s account is being deleted.");
});
it("gives the neutral words to anyone else, and when the read fails without the cookie", async () => {
  expect(await text()).not.toContain(PROMISE);
  s.parent = "p";
  s.fail = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await text()).not.toContain(PROMISE);
  log.mockRestore();
});
