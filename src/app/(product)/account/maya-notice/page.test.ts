import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAYA_NOTICE_VERSION } from "@/lib/maya-notice";

// The Maya notice page (#529), through its default export. A parent can always decline, also when the agreement cannot be
// read, and the confirmation promises no access to chat, because a family with chat closed can agree from Settings.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const BOOK = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({ agreement: "none" as "none" | "yes" | "fail" }));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ usePathname: () => "/account/maya-notice", redirect: () => { throw new Error("redirect"); }, useRouter: () => ({}) }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => PARENT,
  sessionClient: async () => ({
    from: (table: string) => {
      const answer = () => {
        if (table !== "maya_notice_acceptances") return { data: table === "children" ? [] : { postal: null, time_zone: "America/Vancouver" }, error: null };
        if (state.agreement === "fail") return { data: null, error: { message: "down" } };
        return { data: state.agreement === "yes" ? { parent_id: PARENT, notice_version: MAYA_NOTICE_VERSION, accepted_by: PARENT, accepted_at: "2026-11-05T12:00:00Z" } : null, error: null };
      };
      const query = { select: () => query, eq: () => query, order: () => query, maybeSingle: async () => answer(), then: (done: (value: unknown) => void) => done(answer()) };
      return query;
    },
  }),
}));

const { default: Page } = await import("@/app/(product)/account/maya-notice/page");
const render = async (query: Record<string, string> = {}) => renderToStaticMarkup(createElement("div", null,
  await Page({ params: Promise.resolve({}), searchParams: Promise.resolve(query) } as never)));
/** The form that opens the desk without Maya, or null. */
const decline = (html: string) => html.match(/<form action="\/api\/desk\/open" method="post">(?:(?!<\/form>).)*name="maya" value="later"(?:(?!<\/form>).)*<\/form>/)?.[0] ?? null;

describe("the Maya notice page", () => {
  beforeEach(() => { state.agreement = "none"; });

  it("offers I agree and the way to open the desk without Maya, keeping where the parent was going", async () => {
    const html = await render({ child: CHILD, w: BOOK, p: "3", from: "qr" });
    expect(html).toContain(">I agree</button>");
    const form = decline(html)!;
    for (const value of [CHILD, BOOK, "3", "qr"]) expect(form).toContain(`value="${value}"`);
  });

  it("keeps the way out when the agreement cannot be read: the decline form still says maya=later", async () => {
    state.agreement = "fail";
    const html = await render({ child: CHILD });
    expect(html).toContain("We cannot check whether you agreed.");
    expect(decline(html)).toContain(`value="${CHILD}"`);
    expect(html).toContain(">I agree</button>");
  });

  it("offers Not now from Settings, with or without a read failure", async () => {
    for (const agreement of ["none", "fail"] as const) {
      state.agreement = agreement;
      const html = await render();
      expect(html).toContain("Not now");
      expect(decline(html)).toBeNull();
    }
  });

  it("does not ask again once the family agreed, and its desk button does not turn Maya off", async () => {
    state.agreement = "yes";
    const html = await render({ child: CHILD });
    expect(html).toContain("You agreed on");
    expect(html).not.toContain(">I agree</button>");
    expect(html).toContain("Open the desk");
    expect(html).not.toContain('name="maya"');
  });

  it("confirms the saved answer and promises no access to chat", async () => {
    state.agreement = "yes";
    const html = await render({ saved: "1" });
    expect(html).toContain("We saved your answer.");
    expect(html).toContain("This does not open chat with Maya by itself.");
    expect(html.replace(/&#x27;/g, "'")).toContain("Chat with Maya opens when your family's plan starts.");
    expect(html).not.toMatch(/in\s+stages/);
    expect(html).not.toMatch(/Maya is on|can chat with Maya/);
  });

  it("says what a withdrawal does to a chat already open", async () => {
    expect(await render()).toContain("A chat already open can continue until it ends, at most 10 minutes.");
  });
});
