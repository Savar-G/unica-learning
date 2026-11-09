import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("server-only", () => ({}));
import { PrepareFromSnapshot } from "@/components/prepare-from-snapshot";
import { nextBookButtonState } from "./next-book-button";
import { nextBookWiring } from "./next-book-planner";

// #476: what the admin child page shows for "Prepare from snapshot". With no planner it reads nothing; a failed read
// gives a note instead of an error, so the rest of the child page still renders.

const BOOK = "00000000-0000-4000-8000-000000000013";

describe("nextBookButtonState", () => {
  it("the planner is wired, so the child page asks for the delivery", () => {
    // The child page passes ready: nextBookWiring() !== null.
    expect(nextBookWiring()).not.toBeNull();
  });

  it("with no planner reads no delivery and shows the button disabled", async () => {
    const delivered = vi.fn(async () => true);
    expect(await nextBookButtonState({ ready: false, book1Id: BOOK, delivered })).toBe("not-ready");
    expect(delivered).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(createElement(PrepareFromSnapshot, { childId: "c", state: "not-ready" }));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Prepare from snapshot<\/button>/);
    expect(html).toContain("The planner is not ready yet.");
  });

  it("a failed delivery read gives a note, and never throws into the page", async () => {
    const state = await nextBookButtonState({ ready: true, book1Id: BOOK, delivered: async () => { throw new Error("connection reset"); } });
    expect(state).toBe("unavailable");
    if (state !== "unavailable") throw new Error(state);
    const html = renderToStaticMarkup(createElement(PrepareFromSnapshot, { childId: "c", state }));
    expect(html).toBe('<p class="adm-note">Next book status is unavailable.</p>');
  });

  it("shows the button only for a delivered book 1, and reads nothing without one", async () => {
    const delivered = vi.fn(async () => false);
    expect(await nextBookButtonState({ ready: true, book1Id: null, delivered })).toBe("hidden");
    expect(delivered).not.toHaveBeenCalled();
    expect(await nextBookButtonState({ ready: true, book1Id: BOOK, delivered })).toBe("hidden");
    expect(await nextBookButtonState({ ready: true, book1Id: BOOK, delivered: async () => true })).toBe("ready");
    const html = renderToStaticMarkup(createElement(PrepareFromSnapshot, { childId: "c", state: "ready" }));
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("not ready");
  });
});
