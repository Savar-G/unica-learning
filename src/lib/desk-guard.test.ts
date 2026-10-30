import { describe, expect, it } from "vitest";
import { createDeskGuard, DESK_OPENED } from "@/lib/desk-guard";

// The guard on parent pages (#301, review R349-2), through its interface. The proxy refuses new requests while the desk
// is open, but a page the browser restores from history, a parent tab that was already open, and a parent action that
// goes straight to Supabase (password change, sign-out) never reach it. The guard asks the server (`deskOpen`) and
// sends the page to the desk. The browser parts are fakes that record what the guard did.

function page(server: "open" | "closed" | "fails") {
  const log: string[] = [];
  const guard = createDeskGuard({
    deskOpen: async () => {
      log.push("asked");
      if (server === "fails") throw new Error("offline");
      return server === "open";
    },
    hide: () => log.push("hidden"),
    show: () => log.push("shown"),
    toDesk: () => log.push("to desk"),
  });
  return { guard, log };
}

describe("the desk guard on a parent page", () => {
  it("hides a page restored from history before asking, and sends it to the open desk", async () => {
    const { guard, log } = page("open");
    await guard.pageShown(true);
    expect(log).toEqual(["hidden", "asked", "to desk"]);
  });

  it("shows a restored page again when no desk is open", async () => {
    const { guard, log } = page("closed");
    await guard.pageShown(true);
    expect(log).toEqual(["hidden", "asked", "shown"]);
  });

  it("keeps a restored page hidden when the server cannot answer, and sends it to the desk", async () => {
    const { guard, log } = page("fails");
    await guard.pageShown(true);
    expect(log).toEqual(["hidden", "asked", "to desk"]);
  });

  it("does not ask on a fresh page load: the proxy has just checked it", async () => {
    const { guard, log } = page("open");
    await guard.pageShown(false);
    expect(log).toEqual([]);
  });

  it("sends an open parent tab to the desk at once when another tab opens it", () => {
    const { guard, log } = page("closed");
    guard.message(DESK_OPENED);
    guard.message("something else");
    expect(log).toEqual(["hidden", "to desk"]);
  });

  it("checks again when the parent tab comes back into view", async () => {
    const open = page("open");
    await open.guard.visible();
    expect(open.log).toEqual(["asked", "hidden", "to desk"]);
    const closed = page("closed");
    await closed.guard.visible();
    expect(closed.log).toEqual(["asked"]);
  });

  it("refuses a parent action while the desk is open, and sends the page to the desk", async () => {
    const { guard, log } = page("open");
    expect(await guard.mayAct()).toBe(false);
    expect(log).toEqual(["asked", "hidden", "to desk"]);
  });

  it("allows a parent action when no desk is open, and refuses it when the server cannot answer", async () => {
    expect(await page("closed").guard.mayAct()).toBe(true);
    expect(await page("fails").guard.mayAct()).toBe(false);
  });
});
