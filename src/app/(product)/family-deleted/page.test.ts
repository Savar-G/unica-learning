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
const BROWSER = "A family&#x27;s account was deleted on this browser in the last day. We stopped every workbook plan for that family, and that family will get no more charges.";
const NEUTRAL = "Your family&#x27;s account is being deleted.";
const noPlanWords = (html: string) => { expect(html).not.toContain("charges"); expect(html).not.toContain("workbook plan"); expect(html).toContain(NEUTRAL); };
beforeEach(() => { s.cookie = undefined; s.parent = null; s.state = null; s.fail = false; });

it("after the parent's own delete, a signed-out browser with the cookie says only what the cookie proves", async () => {
  s.cookie = "1";
  const html = await text();
  expect(html).toContain(BROWSER);
  expect(html).not.toContain(PROMISE);
});
it("promises it to a signed-in parent only when their own request row says the plans stopped", async () => {
  s.parent = "p";
  s.state = "plans_stopped";
  expect(await text()).toContain(PROMISE);
  s.state = "queued";
  s.cookie = "1";
  noPlanWords(await text());
});
it("never uses another family's cookie for a signed-in parent with no request (review round 3)", async () => {
  // Family A deleted on this browser; family B signs in on it and opens the page.
  s.cookie = "1";
  s.parent = "b";
  s.state = null;
  noPlanWords(await text());
});
it("gives the neutral words to anyone else, and when a signed-in read fails, with or without the cookie", async () => {
  noPlanWords(await text());
  s.cookie = "0";
  noPlanWords(await text());
  s.parent = "p";
  s.fail = true;
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  noPlanWords(await text());
  s.cookie = "1";
  noPlanWords(await text());
  log.mockRestore();
});
