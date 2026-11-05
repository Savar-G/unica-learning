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
const BROWSER = "In the last day, a family asked on this browser to delete its account. We stopped every workbook plan for that family, and that family will get no more charges.";
const OWN = "Your family&#x27;s account is being deleted.";
const NEUTRAL = "If you asked us to delete your family&#x27;s account, we are deleting it.";
const noPlanWords = (html: string) => { expect(html).not.toContain("charges"); expect(html).not.toContain("workbook plan"); };
const neutral = (html: string) => { noPlanWords(html); expect(html).toContain(NEUTRAL); expect(html).not.toContain(OWN); expect(html).not.toContain("your children"); };
beforeEach(() => { s.cookie = undefined; s.parent = null; s.state = null; s.fail = false; });

it("after the parent's own delete, a signed-out browser with the cookie says only what the cookie proves", async () => {
  s.cookie = "1";
  const html = await text();
  expect(html).toContain(BROWSER);
  expect(html).not.toContain(PROMISE);
  // Review round 4: the cookie does not prove the deletion finished, nor whose browser session this is.
  expect(html).not.toContain("was deleted");
  expect(html).not.toContain(OWN);
  expect(html).not.toContain("your children");
  expect(html).not.toContain("your account");
});
it("promises it to a signed-in parent only when their own request row says the plans stopped", async () => {
  s.parent = "p";
  s.state = "plans_stopped";
  expect(await text()).toContain(PROMISE);
  s.state = "queued";
  s.cookie = "1";
  const queued = await text();
  noPlanWords(queued);
  expect(queued).toContain(OWN);
});
it("never uses another family's cookie for a signed-in parent with no request (review round 3)", async () => {
  // Family A deleted on this browser; family B signs in on it and opens the page.
  s.cookie = "1";
  s.parent = "b";
  s.state = null;
  neutral(await text());
});
it("gives the neutral words to anyone else, and when a signed-in read fails, with or without the cookie", async () => {
  neutral(await text());
  s.cookie = "0";
  neutral(await text());
  s.parent = "p";
  s.fail = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  neutral(await text());
  s.cookie = "1";
  neutral(await text());
  log.mockRestore();
});
